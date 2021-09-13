import BaseService from '../lib/BaseService';

import * as crypto from 'crypto';

export interface EncryptOptions {
  algorithm?: crypto.CipherGCMTypes | 'aes-128-cbc' | 'aes-192-cbc' | 'aes-256-cbc';
  iv: string | Buffer;
}

export default class EncryptService extends BaseService {
  async encrypt(data: string, key: string, options?: Partial<EncryptOptions>) {
    const algorithm = options && options.algorithm || 'aes-256-gcm';
    // eslint-disable-next-line no-bitwise
    const length = Number(algorithm.split('-')[ 1 ]) >>> 4;
    const iv = options && options.iv || crypto.randomBytes(length);

    return await new Promise<[string, string]>((resolve, reject) => {
      crypto.scrypt(key, 'salt', 32, (err: Error | null, derivedKey: Buffer) => {
        if (err) {
          reject(err);
          return;
        }

        try {
          const cipher = crypto.createCipheriv(algorithm, derivedKey, iv);
          cipher.setAutoPadding(true);
          let pl = cipher.update(data, 'utf8', 'base64');
          pl += cipher.final('base64');
          resolve([ pl, iv.toString('base64') ]);
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  async decrypt(data: string, key: string, options: EncryptOptions) {
    const iv = options.iv;

    const algorithm = options && options.algorithm || 'aes-256-gcm';

    try {
      return await new Promise<string>((resolve, reject) => {
        crypto.scrypt(key, 'salt', 32, (err: Error | null, derivedKey: Buffer) => {
          if (err) {
            reject(err);
            return;
          }

          try {
            const decipher = crypto.createDecipheriv(algorithm, derivedKey, typeof iv === 'string' ? Buffer.from(iv, 'base64') : iv);
            decipher.setAutoPadding(true);
            let pl = decipher.update(data, 'base64', 'utf8');
            if ([ 'ccm', 'cbc' ].includes(algorithm.split('-')[2])) {
              pl += decipher.final('utf8');
            }

            resolve(pl);
          } catch (err) {
            reject(err);
          }
        });
      });
    } catch (err) {
      this.ctx.logError({ msg: 'decrypt failed', err, detail: { data } });
      return undefined;
    }
  }
}
