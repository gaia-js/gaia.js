import { Context } from 'egg';
import MongoModelService from '../../lib/model/MongoModelService';
import { ObjectModelOptions } from '../../lib/model/ObjectModelService';
import PermissionNode from '../../object/admin/permission_node';

export default class AdminPermissionNodeModelService<T extends PermissionNode = PermissionNode> extends MongoModelService<T, string> {
  constructor(ctx: Context, daoName = 'AdminPermissionNode', options: ObjectModelOptions<T> = {}) {
    super(ctx, daoName, Object.assign({ objectModelClass: PermissionNode, cacheRepository: [ 'admin', 'default' ] }, options || {}));

    this.registerCountWith({ disabled: { $not: { $exists: true, $eq: true } } });
    this.registerLoadMultiWith({ disabled: { $not: { $exists: true, $eq: true } } }, { limit: 50, skip: 0 });
  }

  async loadAll(limit = 50, skip = 0) {
    if (!skip) {
      skip = 0;
    }

    // @ts-ignore
    return await this.loadMultiWith({ disabled: { $not: { $exists: true, $eq: true } } }, { skipCache: this.option('disableCache') || !!skip || limit !== 50 || false, skipSetCache: this.option('disableCache'), fetchOptions: { limit, skip } });
  }

  async countAll() {
    // @ts-ignore
    return await this.countWith({ disabled: { $not: { $exists: true, $eq: true } } });
  }

  async delNode(node: T) {
    // @ts-ignore
    await this.update(node, { disabled: true });
  }
}
