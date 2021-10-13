import OSS = require('ali-oss');
import Path = require('path');
import { OSSClient } from '../../typings/gaia';
import { OSSConfig } from '../../typings/gaia-config';
import BaseService from '../lib/BaseService';
import ObjectProfiler from '../lib/object_profiler';
import { VALUE_OF } from '../object/BasePropertiesObject';
import { OSSBucketName } from './ali_oss';

export enum ActionType {
  GET = 1,
  PUT = 2,
}
type PolicyData = { type: 'simple'; action: ActionType; path: string } | { type: 'original'; policy: string | object; path?: string };
const mSimpleActionMap = [
  [ActionType.GET, ['oss:GetObject', 'oss:GetObjectAcl']],
  [ActionType.PUT, ['oss:PutObject', 'oss:PutObjectACL', 'oss:ListMultipartUploads', 'oss:AbortMultipartUpload']],
] as [ActionType, string[]][];

/**
 * policy 可以是很复杂 弄个包内类结构 来适配简单方式
 */
class AliOssStsPolicy {
  data: PolicyData;
  constructor(data: PolicyData) {
    this.data = data;
  }
  get path() {
    return this.data.path || undefined;
  }

  getAbsolutePath(rootPath?: string) {
    const currentPath = this.path || '/';
    return currentPath.startsWith('/') ? currentPath : Path.join(rootPath || '/', currentPath);
  }

  getPolicy(ossConf: VALUE_OF<OSSConfig>) {
    if (this.data.type === 'simple') {
      // 如果 / 开始不出里 相对路径
      const absoluteFilePath = this.getAbsolutePath(ossConf.rootPath);
      const action = this.data.action;
      const actionValue = mSimpleActionMap.reduce((ret, x) => (action & x[0] && ret.push(...x[1]), ret), [] as string[]);
      return {
        Version: '1',
        Statement: [
          {
            Action: actionValue,
            Effect: 'Allow',
            Resource: [`acs:oss:*:*:${ossConf.bucket}${absoluteFilePath}`, `acs:oss:*:*:${ossConf.bucket}${absoluteFilePath}*`],
          },
        ],
      };
    } else {
      return this.data.policy;
    }
  }
}

/**
 * 快捷方法
 */
export const simplePolicy = (path: string, action: ActionType = ActionType.GET | ActionType.PUT) => new AliOssStsPolicy({ type: 'simple', action, path });
export const originalPolicy = (policy: string | object, path?: string) => new AliOssStsPolicy({ type: 'original', policy, path });

export default class AliOssStsService extends BaseService {
  /**
   * 生成sts client
   * @param name  config里的key
   */
  getStsClient(name: OSSBucketName): OSS.STS {
    const app = this.ctx.app;
    const ossBucket = app['ossStsBucket'] || (app['ossStsBucket'] = {});

    if (!ossBucket[name]) {
      this.ctx.assert(app.config.oss[name], `oss config of ${name} not set`);
      ossBucket[name] = new OSS.STS({
        accessKeyId: app.config.oss[name].accessKeyId,
        accessKeySecret: app.config.oss[name].accessKeySecret,
      });
    }
    return ObjectProfiler.createProfileProxy(ossBucket[name], 'oss', { name }, this.ctx, { timeout: 500 });
  }

  /**
   * 生成sts的临时配置 可直接用于前端上传
   *
   * @param policy 权限策略 simplePolicy('GET', path) | originalPolicy(policy)
   * @param expire 过期时间 秒
   * @param name config里的bucket key
   * @returns
   */
  async generateStsConfig(policy: AliOssStsPolicy, expire: number, name: OSSBucketName = 'default') {
    const client = this.getStsClient(name);
    const ossConf = this.app.config.oss[name];
    const roleArn = (ossConf.stsRoleArn || ossConf.stsToken) as string;
    this.ctx.assert(roleArn, `oss[${name}] stsRoleArn not set`);
    const { credentials } = await client.assumeRole(roleArn, policy.getPolicy(ossConf), expire);
    return {
      accessKeyId: credentials.AccessKeyId,
      accessKeySecret: credentials.AccessKeySecret,
      stsToken: credentials.SecurityToken,
      expiration: credentials.Expiration,
      region: ossConf.region,
      bucket: ossConf.bucket,
      endpoint: ossConf.endpoint,
      host: `https://${ossConf.bucket}.${ossConf.region}.aliyuncs.com`,
      authorizedPath: policy.path ? policy.getAbsolutePath(ossConf.rootPath) : undefined,
    };
  }

  /**
   * 生成一个oss client  =  ctx.service.aliOss.getClien
   */
  async generateStsClient(policy: AliOssStsPolicy, expire: number, name: OSSBucketName = 'default') {
    const info = await this.generateStsConfig(policy, expire, name);
    const client = new OSS({
      accessKeyId: info.accessKeyId,
      accessKeySecret: info.accessKeySecret,
      stsToken: info.stsToken,
      region: info.region,
      bucket: info.bucket,
      urllib: { request: this.ctx.curl.bind(this.ctx) },
    } as any) as OSS & OSSClient;
    return ObjectProfiler.createProfileProxy(client, 'oss', { name }, this.ctx, { timeout: 500 });
  }

  /**
   * 生成一串`token` 这个在 oss-browser 授权码登陆
   */
  async generateStsToken(policy: AliOssStsPolicy, expire: number, name: OSSBucketName = 'default') {
    const info = await this.generateStsConfig(policy, expire, name);
    const tokenInfo = {
      id: info.accessKeyId,
      secret: info.accessKeySecret,
      stoken: info.stsToken,
      expiration: info.expiration,
      region: info.region,
      osspath: `oss://${info.bucket}/${info.authorizedPath || ''}`,
      privilege: 'all',
    };
    return Buffer.from(JSON.stringify(tokenInfo)).toString('base64');
  }
}
