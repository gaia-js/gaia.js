import BaseService from '../lib/BaseService';
import AdminUser from '../object/admin/user';
import { BusinessError } from '../errors/index';
import { ValidateOptions } from '../lib/request';

export const PREFIX = 'admin_token:';

export default class AdminAuthService extends BaseService {
  async validate(): Promise<AdminUser | null> {
    this.ctx.assert(false, '系统错误');

    return null;
  }

  async requireAuth(options?/* : ValidateOptions */): Promise<boolean> {
    if (!this.ctx.user || !(this.ctx.user instanceof AdminUser)) {
      throw BusinessError.NO_AUTH;
    }

    return true;
  }

  async startAuth(bpOptions: ValidateOptions): Promise<boolean> {
    this.ctx.assert(false, '系统错误');
    return false;
  }

  async login(): Promise<AdminUser|null> {
    this.ctx.assert(false, '系统错误');

    return null;
  }

  async logout() {
    this.ctx.assert(false, '系统错误');
  }
}
