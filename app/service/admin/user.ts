import { Context } from 'egg';
import MongoModelService from '../../lib/model/MongoModelService';
import { ObjectModelOptions } from '../../lib/model/ObjectModelService';
import AdminUser from '../../object/admin/user';

export default class AdminUserModelService<T extends AdminUser = AdminUser> extends MongoModelService<T> {
  constructor(ctx: Context, daoName = 'AdminUser', options: ObjectModelOptions<T> = {}) {
    super(ctx, daoName, Object.assign({ objectModelClass: AdminUser, cacheRepository: [ 'admin', 'default' ] }, options || {}));

    this.registerCountWith({ disabled: { $not: { $exists: true, $eq: true } } });
    this.registerLoadMultiWith({ disabled: { $not: { $exists: true, $eq: true } } }, { limit: 50, skip: 0 });
  }

  async loadWithUserName(username: string) {
    return await this.load(username);
  }

  async loadAll(limit = 50, skip = 0) {
    if (!skip) {
      skip = 0;
    }

    // @ts-ignore
    return await this.loadMultiWith({ disabled: { $not: { $exists: true, $eq: true } } }, { skipCache: this.option('disableCache') || !!skip || limit !== 50 || false, fetchOptions: { limit, skip } });
  }

  async countAll() {
    // @ts-ignore
    return await this.countWith({ disabled: { $not: { $exists: true, $eq: true } } });
  }

  async delUser(user: T) {
    // @ts-ignore
    await this.update(user, { disabled: true });
  }
}
