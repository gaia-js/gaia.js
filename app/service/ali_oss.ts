import * as OSS from 'ali-oss';
import { PutObjectResult } from 'ali-oss';
import * as md5 from 'md5';
import { ObjectId } from 'mongodb';
import * as path from 'path';
import { Readable } from 'stream';
import { OSSClient } from '../../typings/gaia';
import { OSSConfig } from '../../typings/gaia-config';
import BaseService from '../lib/BaseService';
import ObjectProfiler from '../lib/object_profiler';

export type OSSBucketName = 'default' | 'video' | Extract<keyof OSSConfig, string>;


export default class AliOssService extends BaseService {
  getClient(name: OSSBucketName) {
    const app = this.ctx.app;
    const ossBucket = app.ossBucket || (app.ossBucket = {});

    if (!ossBucket[name]) {
      this.ctx.assert(app.config.oss[name], `oss config of ${name} not set`);

      ossBucket[name] = new OSS({
        region: app.config.oss[name].region,
        accessKeyId: app.config.oss[name].accessKeyId,
        accessKeySecret: app.config.oss[name].accessKeySecret,
        bucket: app.config.oss[name].bucket,
        urllib: { request: this.ctx.curl.bind(this.ctx) },
      } as any) as OSS & OSSClient;
    }

    return ObjectProfiler.createProfileProxy(ossBucket[name], 'oss', { name }, this.ctx, { timeout: 500 });
  }

  async put(filePath: string | Buffer | NodeJS.ReadableStream, targetPathName?: string, options?: OSSBucketName | Partial<{ bucketName?: string; mime: string; headers?: object }>): Promise<string> {
    try {
      const bucketName = typeof options === 'string' ? options : (options && options.bucketName) || 'default';
      if (typeof options === 'string') {
        options = {};
      }

      const absoluteFilePath = this.getObjectPath(targetPathName || (typeof filePath === 'string' ? path.basename(filePath) : filePath instanceof Buffer ? md5(filePath) : new ObjectId().toHexString()), bucketName);
      const client = this.getClient(bucketName);
      let ossPath:
        | PutObjectResult
        | {
            name: string;
            res: OSS.NormalSuccessResponse;
          };
      if (typeof filePath === 'string') {
        ossPath = await client.put(absoluteFilePath, filePath, options as OSS.PutStreamOptions);
      } else if (filePath instanceof Buffer) {
        const readableInstanceStream = new Readable({
          read() {
            this.push(filePath);
            this.push(null);
          },
        });
        ossPath = await client.putStream(absoluteFilePath, readableInstanceStream, options as OSS.PutStreamOptions);
      } else {
        ossPath = await client.putStream(absoluteFilePath, filePath, options as OSS.PutStreamOptions);
      }
      return client.getObjectUrl(ossPath.name, this.app.config.oss[bucketName].endpoint);
    } catch (err) {
      this.ctx.logCritical({ type: 'oss_error', msg: 'cannot put file', err, detail: { filePath, targetPathName } });
      throw err;
    }
  }

  async delete(filePath: string, bucketName: OSSBucketName = 'default') {
    try {
      const client = this.getClient(bucketName);
      const absoluteFilePath = this.getObjectPath(filePath, bucketName);
      await client.delete(absoluteFilePath);
      return true;
    } catch (err) {
      this.ctx.logCritical({ type: 'oss_error', msg: 'cannot delete file', err, detail: { filePath, bucketName } });
      throw err;
    }
  }

  /**
   *
   * @param filePath
   * @param bucketName
   * @return 存在时返回完整的cdn url，否则返回false，出错时返回undefined
   */
  async exists(filePath: string, bucketName: OSSBucketName = 'default'): Promise<string | false | undefined> {
    const client = this.getClient(bucketName);
    const absoluteFilePath = this.getObjectPath(filePath, bucketName);
    try {
      const result = await client.head(absoluteFilePath);
      if (result.status === 200) {
        return client.getObjectUrl(absoluteFilePath, this.app.config.oss[bucketName].endpoint);
      }

      return false;
    } catch (err) {
      if ((err as any).status === 404) {
        return false;
      }

      this.ctx.logCritical({ type: 'oss_error', msg: 'test oss object exists failed', err, detail: { filePath, bucketName } });
      return undefined;
    }
  }

  public async getTempToken(ossConfigName: string, expireSeconds: number) {
    this.ctx.logError('oss::getTempToken 有安全隐患, 请用 ctx.service.aliOssSts.generateStsConfig 替代');
    try {
      const app = this.ctx.app;

      this.ctx.assert(app.config.oss[ossConfigName] && (app.config.oss[ossConfigName] as any).stsToken, '配置错误');

      const client = new OSS.STS({
        accessKeyId: app.config.oss[ossConfigName].accessKeyId,
        accessKeySecret: app.config.oss[ossConfigName].accessKeySecret,
      });

      const retVal = await client.assumeRole(app.config.oss[ossConfigName].stsToken!, '', expireSeconds);
      return retVal.credentials;
    } catch (err) {
      this.ctx.logCritical({ type: 'oss_error', msg: 'STS获取失败', err, detail: { ossConfigName, expireSeconds } });
      throw this.ctx.service.error.createBusinessError({ msg: '系统错误：获取授权失败', detail: err });
    }
  }

  /**
   * 解析object 的绝对路径 支持 http | 绝对地址 ｜ 相对地址
   */
  getObjectPath(object: string, bucketName: OSSBucketName = 'default') {
    const bucketConfig = this.app.config.oss[bucketName];
    if (bucketConfig.endpoint) {
      if (object.startsWith(bucketConfig.endpoint)) {
        object = object.substr(bucketConfig.endpoint.length - 1);
      } else if (!object.startsWith('/')) {
        object = `${bucketConfig.rootPath || '/'}${object}`;
      }
    }

    return object;
  }

  public async processObjectSave(sourceObject: string, targetObject: string, processStr: string, bucketName: OSSBucketName = 'default') {
    const client = this.getClient(bucketName);

    try {
      sourceObject = this.getObjectPath(sourceObject);
      targetObject = this.getObjectPath(targetObject);

      const result = await client.processObjectSave(sourceObject, targetObject, processStr);

      if (!result || !result.res || result.res.status !== 200) {
        this.ctx.logError({ type: 'oss_error', msg: 'process object failed', detail: { sourceObject, targetObject, processStr, result } });

        throw this.ctx.service.error.createBusinessError({ msg: '系统错误' });
      }

      return client.getObjectUrl(targetObject, this.app.config.oss[bucketName].endpoint);
    } catch (err) {
      this.ctx.logError({ type: 'oss_error', msg: '生成对象失败', err, detail: { sourceObject, targetObject, processStr } });

      throw err;
    }
  }
}
