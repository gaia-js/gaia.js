import BaseService from '../lib/BaseService';
import * as mongodb from 'mongodb';
import { Readable } from 'stream';
import { basename } from 'path';
import * as md5 from 'md5';
import * as fs from 'fs';
import { randomString } from '../lib/string';
import { MongooseSingleton } from 'egg';
import { Connection } from 'mongoose';
import { ServerError } from '../errors';
import method from '../lib/profiler/method';

export default class GridFSService extends BaseService {
  private async getClient(dbName?: string, conn?: string) {
    const mongooseDB = (this.app as any).mongooseDB as MongooseSingleton | Connection;

    if (!mongooseDB) {
      throw new ServerError({ msg: '系统错误' });
    }

    if (!conn && mongooseDB && (mongooseDB as MongooseSingleton).clients) {
      conn = [...(mongooseDB as MongooseSingleton).clients.keys()][0];
      conn = 'default';
    }

    const connection: Connection = conn ? (mongooseDB as MongooseSingleton).get(conn) as Connection : mongooseDB as Connection;
    const db = dbName ? connection.useDb(dbName) : connection;
    return new mongodb.GridFSBucket(db.db as any);
  }

  @method('gridfs', { operator: 'put' })
  async put(filePath: string | Buffer | Readable, fileName?: string, options?: Partial<{ conn?: string; db?: string; mime: string; headers?: object }>) {
    const client = await this.getClient(options && options.db, options && options.conn);

    let stream: Readable;

    if (typeof filePath === 'string') {
      if (!fileName) {
        fileName = basename(filePath);
      }

      stream = fs.createReadStream(filePath);
    } else if (filePath instanceof Buffer) {
      if (!fileName) {
        fileName = md5(filePath);
      }

      stream = new Readable({
        read() {
          this.push(filePath);
          this.push(null);
        },
      });
    } else {
      if (!fileName) {
        fileName = await randomString(16);
      }

      stream = filePath as Readable;
    }

    const gfsStream = client.openUploadStream(fileName!);
    try {
      await new Promise<void>((resolve, reject) => {
        stream.pipe(gfsStream).on('error', err => {
          reject(err);
        }).on('finish', () => {
          resolve();
        });
      });
    } catch (err) {
      this.ctx.logCritical({ type: 'oss', msg: 'cannot put file', err, detail: { filePath, fileName } });
      throw err;
    }

    return gfsStream.id as mongodb.ObjectId;
  }

  // tslint:disable-next-line: no-reserved-keywords
  async get(id: mongodb.ObjectId, options?: Partial<{ conn?: string; db?: string }>) {
    const client = await this.getClient(options && options.db, options && options.conn);

    return client.openDownloadStream(id);
  }

  @method('gridfs', { operator: 'remove' })
  async remove(id: mongodb.ObjectId, options?: Partial<{ conn?: string; db?: string }>) {
    const client = await this.getClient(options && options.db, options && options.conn);

    await new Promise<void>((resolve, reject) => {
      client.delete(id, err => {
        if (err) {
          reject(err);
          return;
        }

        resolve();
      });
    });
  }
}
