import { Context } from 'egg';
import MongoModelService from '../../lib/model/MongoModelService';
import { ObjectModelOptions } from '../../lib/model/ObjectModelService';
import Role, { ROLE_ANONYMOUS } from '../../object/admin/role';
import { ObjectProperties } from '../../object/BasePropertiesObject';

let _anonymous: ObjectProperties<any> | undefined;

export default class AdminRoleModelService<T extends Role = Role> extends MongoModelService<T, string> {
  private _anonymous: T;

  constructor(ctx: Context, daoName = 'AdminRole', options: ObjectModelOptions<T> = {}) {
    super(ctx, daoName, Object.assign({ objectModelClass: Role, cacheRepository: [ 'admin', 'default' ] }, options || {}));

    this.registerCountWith({ disabled: { $not: { $exists: true, $eq: true } } });
    this.registerLoadMultiWith({ disabled: { $not: { $exists: true, $eq: true } } }, { limit: 50, skip: 0 });
  }

  get anonymous(): Promise<T> {
    return (async () => {
      if (!this._anonymous) {
        if (!_anonymous) {
          let anonymous = await this.load(ROLE_ANONYMOUS);
          if (!anonymous) {
            anonymous = this.createObject({ _id: ROLE_ANONYMOUS, name: ROLE_ANONYMOUS } as any);
          }

          _anonymous = anonymous.getProperties();

          return anonymous;
        }

        this._anonymous = this.createObject(_anonymous as any);
      }

      return this._anonymous;
    })();
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

  async delRole(role: T) {
    // @ts-ignore
    await this.update(role, { disabled: true });
  }
}
