import * as path from 'path';
import { TransformCallback, PassThrough, Readable, Writable } from 'stream';
import { createWriteStream, promises as fs } from 'fs';
import { promisify } from 'util';
import * as crypto from 'crypto';
import { WritableStreamBuffer } from 'stream-buffers';

export async function waitFinish(stream: Readable) {
  await Promise.race([
    promisify(stream.once.bind(stream))('end'),
    promisify(stream.once.bind(stream))('finish'),
    promisify(stream.once.bind(stream))('error'),
  ]);
}

export class HashStream extends PassThrough {
  private hash: crypto.Hash;

  constructor(algorithm: string) {
    const hash = crypto.createHash(algorithm);

    super({
      write(chunk: any, encoding: BufferEncoding, callback: TransformCallback) {
        hash.update(chunk);

        callback(null, chunk);
      },
    });

    this.hash = hash;
  }

  async waitFinish() {
    await waitFinish(this);
  }

  digest(encoding: 'hex' | 'base64') {
    return this.hash.digest(encoding);
  }
}

export async function getHash(stream: Readable, algorithm: string, encoding: 'hex' | 'base64' = 'hex') {
  const hash = crypto.createHash(algorithm);
  stream.pipe(new PassThrough({
    write(chunk: any, encoding: BufferEncoding, callback: TransformCallback) {
      hash.update(chunk);

      callback(null, chunk);
    },
  }));

  return waitFinish(stream).then(() => hash.digest(encoding));
}

export async function readToBuffer(stream: Readable) {
  const buffer = new WritableStreamBuffer();
  stream.pipe(buffer);

  return waitFinish(stream).then(() => buffer.getContents() as Buffer);

  // return new Promise<Buffer>((resolve, reject) => {
  //   const buffers: any = [];
  //   stream.on('data', data => { buffers.push(data); });
  //   stream.on('error', err => {
  //     reject(err);
  //   });
  //   stream.on('end', () => {
  //     resolve(Buffer.concat(buffers));
  //   });
  // });
}

export async function readToFile(stream: Readable, filePath: string) {
  try {
    await fs.stat(path.dirname(filePath));
  } catch (err) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
  }

  const tmpFile = createWriteStream(filePath);
  stream.pipe(tmpFile);
}

export function bufferReadStream(buffer: Buffer | string): Readable {
  return Readable.from([ buffer ]);
}

export function bufferWriteStream(): Writable & { buffer: Buffer } {
  return new (class extends Writable {
    _buffer: Buffer;

    _write(chunk: any) {
      this._buffer = Buffer.concat([this._buffer || '', chunk]);
    }

    get buffer() {
      return this._buffer;
    }
  })();
}
