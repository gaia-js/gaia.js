import BaseService from '../lib/BaseService';
import { sensitivePhone } from '../lib/string';

export default class SensitiveService extends BaseService {
  async encrypt(data: string, key?: string, iv?: string) {
    return (await this.ctx.service.encrypt.encrypt(data, key || this.app.config.userEncryptToken, { iv: Buffer.from(iv || key || this.app.config.userEncryptToken, 16, 16) }))[ 0 ];
  }

  async decrypt(data: string, key?: string, iv?: string) {
    return await this.ctx.service.encrypt.decrypt(data, key || this.app.config.userEncryptToken, { iv: Buffer.from(iv || key || this.app.config.userEncryptToken, 16, 16) });
  }

  async encryptMobile(mobile: string, key?: string) {
    return await this.encrypt(mobile, key);
  }

  async decryptMobile(encryptedMobile: string, key?: string) {
    return await this.decrypt(encryptedMobile, key);
  }

  maskingMobile(mobile: string, remainLast = 3) {
    return sensitivePhone(mobile, remainLast);
  }
}
