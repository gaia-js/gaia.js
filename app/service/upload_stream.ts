import { FileStream } from 'egg';
import * as sendToWormhole from 'stream-wormhole';
import * as path from 'path';
import { promises as fs } from 'fs';
import BaseService from '../lib/BaseService';
import { getHash, readToBuffer, readToFile, waitFinish } from '../lib/stream';
import * as uuidV1 from 'uuid/v1';

export default class UploadStream extends BaseService {
  async readToBuffer(stream: FileStream) {
    try {
      return await readToBuffer(stream);
    } catch (err) {
      sendToWormhole(stream);
      throw err;
    }
  }

  async readToFile(stream: FileStream) {
    try {
      const tempFileName = (this.app.config.tempRoot || '/data/temp') + '/' + uuidV1().replace(/-/g, '');
      await readToFile(stream, tempFileName);

      await waitFinish(stream);
      return tempFileName;
    } catch (err) {
      sendToWormhole(stream);
      throw err;
    }
  }

  async uploadToOss(stream: FileStream, filePath = '', buckerName?: string) {
    // const hash = new HashStream('sha1');
    // stream.pipe(hash);

    const hash = getHash(stream, 'sha1');

    const tempFileName = await this.readToFile(stream);

    try {
      const fileName = path.join(filePath, `${await hash}${path.extname(stream.filename || '')}`);
      const url = await this.ctx.service.aliOss.exists(fileName, buckerName);
      if (url) {
        return url;
      }

      return await this.ctx.service.aliOss.put(tempFileName, fileName, { mime: stream.mime, headers: { 'content-type': stream.mimeType } });
    } finally {
      await fs.unlink(tempFileName);
    }
  }
}
