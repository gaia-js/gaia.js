import * as crypto from 'crypto';

// import { Request } from 'egg';
import BaseService from '../lib/BaseService';
// import { ValidateOptions } from '../lib/request';
import { getRandomStr } from '../lib/string';

export default class AuthService extends BaseService {
  async requireAuth(options/*?: ValidateOptions*/): Promise<boolean> {
    if (!this.ctx.user) {
      this.ctx.service.error.throwBusinessError(this.ctx.app.errorCodes.NO_AUTH);
    }

    return true;
  }

  async issueToken(userId: string) {
    this.ctx.assert(this.app.config.token_key, '缺少token_key配置');

    const tmp = getRandomStr(4);

    const iv = getRandomStr(8);
    const cipher = crypto.createCipheriv('aes-128-gcm', this.app.config.token_key, iv);
    let encrypted = cipher.update(`${tmp}#${userId}#${Date.now()}`, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return `${iv}.${encrypted}`;
  }

  async validateTokenWithTimestamp(token: string, tokenKey?: string) {
    try {
      const value = token.match(/^([^\.]+)\.(.+)$/);
      if (!value || value.length !== 3) {
        return false;
      }

      const iv = value[ 1 ];
      token = value[ 2 ];

      if (iv.length !== 8) {
        return false;
      }

      const decipher = crypto.createDecipheriv('aes-128-gcm', tokenKey || this.app.config.token_key, iv);
      const decrypted = decipher.update(token, 'base64', 'utf8');
      // decrypted += decipher.final('utf8');
      if (!decrypted) {
        return null;
      }

      const matched = decrypted.match(/^([^#]+)#(.+)#(\d+)$/);
      if (!matched || matched.length !== 4) {
        return null;
      }

      return matched.slice(2);
    } catch (err) {
      this.ctx.logError({ msg: 'validate token failed', err, detail: { token } });

      return null;
    }
  }

  async validateToken(token: string, tokenKey?: string) {
    const res = await this.validateTokenWithTimestamp(token, tokenKey);
    if (!res) {
      return res;
    }

    return res[ 0 ];
  }

  async inceptToken(userId: number | string, token: string) {

  }

  async cancelIncept(token: string) {

  }
}
