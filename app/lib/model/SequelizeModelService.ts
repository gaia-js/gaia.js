import * as md5 from 'md5';
import { CountOptions, Filterable, Model, ModelAttributes, ModelIndexesOptions, ModelOptions, Sequelize, SyncOptions } from 'sequelize';
import { Context } from 'egg';
import { FindOptions, WhereOptions } from 'sequelize';
import DBModelService, { CreateOptions, Dao, DBModelOptions } from './DBModelService';

import { ObjectProperties } from '../../object/BasePropertiesObject';
import BaseModelObject, { KeyType } from '../../object/BaseModelObject';
import { deepFindObject } from '../obj_util';
import ObjectProfiler from '../object_profiler';
import { LoadAs, LoadOptions } from './ObjectModelService';
import { makeObject } from '../utils';

// const SEQUELIZE_OPERATORS = ['findAll', 'findByPk', 'findOne', 'aggregate', 'findOrBuild', 'findOrCreate', 'findCreateFind', 'findAndCountAll', 'update', 'upsert', 'max', 'min', 'sum', 'build', 'bulkBuild', 'create', 'bulkCreate', 'truncate', 'bulkUpdate', 'count', 'destroy', 'restore', 'findOneAndReplace', 'increment'];

// 提供一个完全兼容的Model类
class M extends Model<any, any> {

}

export class SequelizeDao<KT = KeyType, T extends BaseModelObject<KT> = BaseModelObject<KT>> implements Dao<KT, T> {
  private sequelizeModel: typeof M;

  constructor(sequelizeModel: typeof M, ctx: Context) {
    // this.sequelizeModel = new ObjectProfiler<M>(sequelizeModel,
    //   'sequelize',
    //   { from: 'dao', table: sequelizeModel.tableName },
    //   SEQUELIZE_OPERATORS,
    //   ctx) as any;
    this.sequelizeModel = ObjectProfiler.createProfileProxy(sequelizeModel, 'sequelize', { from: 'dao', table: sequelizeModel.tableName }, ctx);
  }

  get primaryKeyAttribute() {
    return this.sequelizeModel.primaryKeyAttribute;
  }

  async fetchOne(id: KT, projection?: string[]): Promise<ObjectProperties<T> | null> {
    const res = await this.sequelizeModel.findByPk(id as any, projection ? { attributes: { include: projection } } : undefined);
    return res && res.get();
  }

  async fetchOneWith(clause: any, options?: any, projection?: string[]): Promise<ObjectProperties<T> | null> {
    if (!clause) {
      clause = {};
    }

    if (!clause.limit) {
      clause.limit = 1;
    }

    const res: Array<Model<any, any>> = await this.sequelizeModel.findAll({ ...(projection ? { attributes: { include: projection } } : {}), ...(options || {}), ...clause });
    return (res && res.length > 0 && res[0].get()) || null;
  }

  async fetchMany(ids: KT[], projection?: string[]): Promise<Map<KT, ObjectProperties<T>>> {
    // @ts-ignore
    const res: Array<Model<any, any>> = await this.sequelizeModel.findAll({ where: { id: ids }, ...(projection ? { attributes: { include: projection } } : {}) });
    if (!res) {
      return res;
    }

    const results = new Map<KT, ObjectProperties<T>>();
    res.forEach(element => {
      // 主键名必须为"id"
      element.get() && results.set((element.get() as any).id, element.get());
    });

    return results;
  }

  async fetchAll(clause: any, options?: any, projection?: string[]): Promise<ObjectProperties<T>[]> {
    const res: Array<Model<any, any>> = await this.sequelizeModel.findAll({ ...(projection ? { attributes: { include: projection } } : {}), ...(options || {}), ...clause });
    if (!res) {
      return res;
    }

    return res.map(element => element.get());
  }

  async create(values: ObjectProperties<T>, options: Partial<CreateOptions> = {}): Promise<[ObjectProperties<T>, boolean]> {
    let obj: Model<any, any>;
    let created: boolean;

    if (options.load) {
      [ obj, created ] = await this.sequelizeModel.findOrCreate({
        where: options.load as WhereOptions,
        defaults: values,
      });
    } else {
      created = true;
      obj = await this.sequelizeModel.create(values);
    }

    return [ obj.get(), created ];
  }

  async updateOne(values: ObjectProperties<T>, obj: T): Promise<number> {
    try {
      const res = await this.sequelizeModel.update(values, { where: { id: obj.id } });

      return res && Array.isArray(res) && res.length > 0 ? res[0] : -1;
    } catch (err) {
      throw err;
    }
  }

  async count(clause: any): Promise<number> {
    const res = await this.sequelizeModel.count(clause);
    if (res && typeof res === 'object') {
      const values = Object.values(res);
      return values[0];
    }

    return res;
  }

  async bulkCreate(records: any[]): Promise<T[]> {
    return await this.sequelizeModel.bulkCreate(records) as unknown[] as T[];
  }

  async remove(id: KT) {
    return (await this.sequelizeModel.destroy({ where: { id } })) === 1;
  }

  async sync(options?: SyncOptions) {
    return this.sequelizeModel.sync(options);
  }
}

export interface SequelizeModelOptions<T> extends DBModelOptions<T> {
  database: string;
  table: string;
  timestamps: boolean;
}

export default class SequelizeModelService<T extends BaseModelObject<KT>, KT = KeyType> extends DBModelService<KT, T, SequelizeDao<KT, T>, SequelizeModelOptions<T>> {
  private _dao: SequelizeDao<KT, T>;

  get primaryKeyName() {
    return this.option('primaryKeyName', this.dao.primaryKeyAttribute) || 'id';
  }

  protected get dao() {
    if (!this._dao) {
      let model: typeof M | undefined;

      if (this.daoName) {
        model = deepFindObject<typeof M>(this.ctx.app.model, this.daoName)?.obj;
        this.ctx.assert(model, `model '${this.daoName}' not exist`);
      }

      if (!model) {
        if (!(this.app as any)._sequelizeModelCache) {
          (this.app as any)._sequelizeModelCache = {};
        }

        const sequelizeModelCache = (this.app as any)._sequelizeModelCache;

        const dbName: string | undefined = this.option('database');
        const tableName = this.option('table')!;
        this.app.assert(tableName, 'table should be specified');

        model = sequelizeModelCache[`${dbName || 'default'}.${tableName}`];
        if (!model) {
          model = sequelizeModelCache[`${dbName || 'default'}.${tableName}`] = (this.app.model as any as Sequelize).define(tableName, this.schema, {
            tableName,
            freezeTableName: true,
            timestamps: this.option('timestamps', false),
            ...(this.modelOptions || {}),
            ...(this.indexes ? { indexes: this.indexes } : {}),
          }) as typeof M;
        }
      }

      this._dao = new SequelizeDao(model!, this.ctx);
    }

    return this._dao;
  }

  get schema(): ModelAttributes {
    throw new Error('schema not specified');
  }

  get modelOptions(): ModelOptions | undefined {
    return undefined;
  }

  get indexes(): ModelIndexesOptions[] {
    return [];
  }

  async findOrCreate(values: ObjectProperties<T>, where: WhereOptions): Promise<T> {
    const [ objectValue, created ] = await this.dao.create(values, { load: where });
    const obj = this.createObject(objectValue);
    obj.isNewCreated = created;
    return obj;
  }

  async bulkCreate(values: ObjectProperties<T>[]): Promise<T[]> {
    const objects = await this.dao.bulkCreate(values);
    if (objects) {
      return objects.map(value => { const obj = this.createObject(value); obj.isNewCreated = true; return obj;} );
    }

    return [] as T[];
  }

  protected async loadWith(clause: FindOptions, options: Partial<LoadOptions<T>> = {}): Promise<T | null> {
    return await super.loadWith(clause, options);
  }

  protected async flushLoadWith(clause: FindOptions, fetchOptions?: Omit<FindOptions, keyof Filterable>, autoRegistered = false) {
    await super.flushLoadWith(clause, fetchOptions, autoRegistered);
  }

  protected async loadMultiWith(clause: FindOptions, options: Partial<LoadOptions<T>> = { loadAs: LoadAs.array }): Promise<T[]> {
    return await super.loadMultiWith(clause, options);
  }

  protected async flushLoadMultiWith(clause: FindOptions, fetchOptions?: Omit<FindOptions, keyof Filterable>, autoRegistered = false) {
    await super.flushLoadMultiWith(clause, fetchOptions, autoRegistered);
  }

  protected async countWith(clause: CountOptions, options?: any): Promise<number> {
    return await super.countWith(clause, options);
  }

  protected cacheKeyOf(clause: Partial<{ [ K in keyof T ]: T[ K ] | any }>, fetchOptions?: any, autoRegistered = false) {
    if (autoRegistered) {
      const keys = Object.keys(clause || {})
        .sort();
      return md5(JSON.stringify({ clause: { where: makeObject(clause, keys) }, options: fetchOptions }));
    }

    const options = Object.assign({}, clause || {}, fetchOptions || {});
    options.where && delete options.where;

    if ((<any>clause).where) {
      const keys = Object.keys(clause && (<any>clause).where || {}).sort();

      return md5(JSON.stringify({ clause: { where: makeObject((<any>clause).where, keys) }, options: options || undefined, }));
    }

    return md5(JSON.stringify({ clause: { }, options, }));
  }
}
