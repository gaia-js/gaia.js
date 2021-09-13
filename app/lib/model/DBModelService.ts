import { Context } from 'egg';
import * as md5 from 'md5';
import ObjectModelService, { LoadOptions, LoadAs, IObjectModelOptions } from './ObjectModelService';
import { deepFindObject } from '../obj_util';
import BaseModelObject, { KeyType } from '../../object/BaseModelObject';
import { ObjectProperties } from '../../object/BasePropertiesObject';
import { makeObject } from '../utils';
import { LoadOptions as CacheLoadOptions } from '../BaseCacheService';
import * as _ from 'lodash';
import { upperFirst } from 'lodash';

// import { capitalize } from '../string';
// import Pagination from './Pagination';

export interface CreateOptions {
  load?: any; // 
  skipSetCache: boolean;
  daoOptions: any;
}

export interface DaoUpdateOptions {

}

export interface UpdateOptions extends DaoUpdateOptions {
  skipSetCache: boolean;
}

export type UpdateValue<T> = ObjectProperties<T> & Partial<{ $set: ObjectProperties<T> }>;

export interface Dao<KT = KeyType, TObj extends BaseModelObject<KT> = BaseModelObject<KT>> {
  create(values: ObjectProperties<TObj>, options?: Partial<CreateOptions>): Promise<[ ObjectProperties<TObj>, boolean ]>;

  fetchOne(id: KT, projection?: string[]): Promise<ObjectProperties<TObj> | null>;

  fetchMany(ids: KT[], projection?: string[]): Promise<Map<KT, ObjectProperties<TObj>>>;

  fetchAll(clause: any, options?: any, projection?: string[]): Promise<ObjectProperties<TObj>[]>;

  fetchOneWith(clause: any, options?: any, projection?: string[]): Promise<ObjectProperties<TObj> | null>;

  updateOne(values: ObjectProperties<TObj>, obj: TObj): Promise<number>;

  remove(id: KT): Promise<boolean>;

  count(clause: any): Promise<number>;
}

export interface DBModelOptions<T> extends IObjectModelOptions<T> {
  projection: string[];
}

export default abstract class DBModelService<KT = KeyType, T extends BaseModelObject<KT> = BaseModelObject<KT>, TDao extends Dao<KT, T> = Dao<KT, T>, TDBModelOptions extends DBModelOptions<T> = DBModelOptions<T>> extends ObjectModelService<KT, T, TDBModelOptions> {
  protected daoName: string;

  protected registeredLoadWith: Array<{
    filterKeys: (keyof T | { [ K in keyof T ]: any })[] | object;
    fetchOptions?: any;
  }>;

  protected registeredLoadMultiWith: Array<{
    filterKeys: (keyof T | {[ K in keyof T ]: any})[] | object;
    fetchOptions?: any;
  }>;

  protected registeredCountWith: Array<{
    filterKeys: (keyof T | { [ K in keyof T ]: any })[] | object;
  }>;


  constructor(ctx: Context, daoName: string, options?: Partial<TDBModelOptions>);
  constructor(ctx: Context, options?: Partial<TDBModelOptions>);

  /**
   *
   * @param ctx
   * @param daoName 从 ctx.model.<daoName> fetch，用ctx.object.<daoName> 创建object
   * @param options
   */
  constructor(ctx: Context, daoName: string | undefined | Partial<TDBModelOptions>, options?: Partial<TDBModelOptions>) {
    ctx.assert(daoName, 'daoName should be specified');
    // daoName = capitalize(daoName); // 有的model不是gaia构建的，挂载的model上的名字不是gaia期待的

    if (daoName && typeof daoName === 'object') {
      options = daoName;
      daoName = '';
    }

    const objectService = daoName && deepFindObject(ctx.object, daoName as string).obj || undefined;
    // 已经指定了objectModelClass就不再使用默认的object creator了
    super(ctx, Object.assign(options && options.objectModelClass ? {} : { objectCreator: objectService && objectService.create }, options));

    this.daoName = daoName as string;
  }

  cachePrefix(): string {
    return `dbm.${this.daoName || this._modelName || this.constructor.name}:`
  }

  protected abstract get dao(): TDao;

  protected async fetchOne(id: KT): Promise<ObjectProperties<T> | null> {
    return this.dao.fetchOne(id, this.option('projection'));
  }

  protected async fetchMany(ids: KT[]): Promise<Map<KT, ObjectProperties<T>>> {
    return this.dao.fetchMany(ids, this.option('projection'));
  }

  protected cacheKeyOf(clause: Partial<{ [ K in keyof T ]: T[ K ] | any }>, fetchOptions?: any, autoRegistered = false) {
    // TODO: 应该支持mongodb/sequelize中的symbol序列化
    const keys = Object.keys(clause || {})
      .sort();
    return md5(JSON.stringify({ clause: makeObject(clause, keys), options: fetchOptions }));
  }

  protected async flushLoadWith(clause: Partial<{ [K in keyof T]: T[K] | any }> | any, fetchOptions?: any, autoRegistered = false) {
    await this.cachePoolChain.remove(this.cacheKeyOf(clause, fetchOptions, autoRegistered), { prefix: this.cachePrefix() + 'with:', skipCache: this.option('disableCache', false) });
  }

  protected async loadWith(clause: Partial<{ [K in keyof T]: T[K] | any }> | any, options: Partial<LoadOptions<T> & { fetchOptions: any }> = {}): Promise<T | null> {
    let obj: T | undefined;

    const id = await this.cachePoolChain.load(
      this.cacheKeyOf(clause, options.fetchOptions),
      async () => {
        const res = await this.dao.fetchOneWith(clause, options.fetchOptions, this.option('projection'))
          // .catch(async err => {
          //   return Promise.reject(err);
          // });

        if (res) {
          obj = this.createObject(res);
          if (!(options.skipCache || this.option('disableCache')) && !(options.skipRuntimeCache || this.option('disableRuntimeCache'))) {
            // tslint:disable-next-line: no-floating-promises
            this.saveCache(obj);
          }

          return obj[this.primaryKeyName];
        }

        return res as any;
      },
      {
        prefix: `${this.cachePrefix()}with:`,
        skipCache: options.skipCache || this.option('disableCache') || false,
        skipRuntimeCache: options.skipRuntimeCache || this.option('disableRuntimeCache') || false,
        expires: options && options.expires || this.expires || 7200,
      })
      // .catch(err => {
      //   this.ctx.logCritical({ msg: `cannot load with ${JSON.stringify(clause)}`, detail: { options, err } }, err);
      //   throw err;
      // });

    return obj || (id && await this.load(id, options)) || null;
  }

  protected async flushLoadMultiWith(clause: Partial<{ [ K in keyof T ]: T[ K ] | any }> | any, fetchOptions?: any, autoRegistered = false) {
    await this.cachePoolChain.remove(this.cacheKeyOf(clause, fetchOptions, autoRegistered), { prefix: this.cachePrefix() + 'mwith:', skipCache: this.option('disableCache', false) });
  }

  /**
   *
   * @param clause
   * @param options 对于mongo model可以使用 fetchOptions 指定skip/limit等参数，而对于sequelize都用clause参数指定。这个行为并不统一，保持了mongoose和sequelize的原始风貌
   */
  protected async loadMultiWith(clause: Partial<{ [K in keyof T]: T[K] | any }> | any, options: Partial<LoadOptions<T> & { fetchOptions: any }> = { loadAs: LoadAs.array }): Promise<T[]> {
    options = Object.assign({ loadAs: LoadAs.array }, options || {});

    this.ctx.assert(options.loadAs === LoadAs.array, 'loadMultiWith should be load as array');

    let objs: Array<T> | undefined;

    const ids: KT[] = await this.cachePoolChain.load<any>(this.cacheKeyOf(clause, options.fetchOptions), async () => {
      // try {
        const res = await this.dao.fetchAll(clause, options.fetchOptions, this.option('projection'));

        if (res && Array.isArray(res)) {
          const ids: KT[] = [];
          const mapResult = new Map<KT, ObjectProperties<T>>();
          objs = [];
          res.forEach(element => {
            const obj: T = this.createObject(element, { loadFromDb: true });
            (objs as T[]).push(obj);
            ids.push(obj[ this.primaryKeyName ]);
            mapResult.set(obj[ this.primaryKeyName ], element);
          });

          if (!(options.skipCache || this.option('disableCache')) && !(options.skipRuntimeCache || this.option('disableRuntimeCache'))) {
            await this.cachePoolChain.mset(mapResult, {
              prefix: this.cachePrefix(),
              expires: this.option('expires', this.expires),
              skipCache: (options && options.skipCache) ?? this.option('disableCache', false),
              skipRuntimeCache: (options && options.skipRuntimeCache) ?? this.option('disableRuntimeCache', false),
            });
          }

          return ids;
        }
        // else if (res && res instanceof Map) {
        //   await this.cachePoolChain.mset(res, { prefix: this.cachePrefix(), expires: this.option('expires'), skipCache: this.option('disableCache') || (options && options.skipCache) || false, skipRuntimeCache: options && options.skipRuntimeCache });
        //   objs = /*(options.loadAs === LoadAs.array)?*/Array.from(res, ([key, value])=>{return this.createObject(value, { loadFromDb: true })})/*:new Map(Array.from(res, ([key, value])=>{return [key, this.createObject(value)]}))*/;
        //   return Array.from(res.keys());
        // }

        this.ctx.logCritical({ msg: 'fetchAll returns invalid result', detail: { dao: this.daoName, options, clause, res } });
        return undefined;
      // } catch (err) {
      //   this.ctx.logCritical({ msg: 'cannot fetch', detail: { dao: this.daoName, clause, options } }, err);

      //   throw err;
      // }
    }, {
      prefix: this.cachePrefix() + 'mwith:',
      skipCache: (options && options.skipCache) ?? this.option('disableCache', false),
      skipRuntimeCache: (options && options.skipRuntimeCache) ?? this.option('disableRuntimeCache', false),
      expires: options && options.expires || this.expires || 7200,
    })
    // .catch(err => {
    //   this.ctx.logCritical({ msg: `cannot load multi with ${JSON.stringify(clause)}`, detail: { options, err } }, err);
    // });

    if (typeof ids === 'undefined') {
      return /* (options.loadAs === LoadAs.array)? */[]/* : new Map<KeyType, T>()*/;
    }

    if (typeof objs !== 'undefined') {
      return objs;
    }

    return this.loadMulti(ids, { loadAs: LoadAs.array, skipEmpty: true, ...(options || {}) }) as Promise<T[]>;
  }

  public async create(properties: ObjectProperties<T>, options?: Partial<CreateOptions>): Promise<T|null> {
    try {
      const [ objectValue, created ] = await this.dao.create(properties, options);
      if (!objectValue) {
        return null;
      }

      const obj = this.createObject(objectValue);
      obj.isNewCreated = created;

      if (!this.disableCache || !this.disableRuntimeCache) {
        await this._updateCache(obj, undefined, undefined, options && { skipSetCache: options.skipSetCache ?? this.option('disableCache', false) } || undefined);
      }

      return obj;
    } catch (err) {
      this.ctx.logCritical({ msg: `db ${this.daoName} document create failed`, err, detail: { properties } });
      throw err;
    }
  }

  async update(obj: T, values: UpdateValue<T>, options?: { upsert: boolean }): Promise<T | false> {
    try {
      const result = await this.dao.updateOne(values, obj);
      if (result < 0) {
        if ((!options || options.upsert) && !(await this.fetchOne(obj[this.primaryKeyName]))) {
          this.ctx.logCritical({ msg: `db ${this.daoName} update failed: doc not found in db, try creating`, detail: { obj, values } });
          return await this.create(Object.assign(obj.getProperties(), values)) as T;
        }

        if (result < 0) {
          // 更新失败了
          this.ctx.logCritical({ msg: `db ${this.daoName} update failed`, detail: { obj, values, result } });
        }
      } else if (result === 0) {
        return obj;
      }

      await this._updateCache(obj, values);

      return obj;
    } catch (err) {
      this.ctx.logCritical({ msg: `cannot update ${this.daoName}`, err, detail: { obj, values } });
      return false;
    }
  }

  async remove(obj: T|KT) {
    let id = obj as KT;
    if ((typeof obj === 'object' && (obj as any)._bsontype === 'ObjectID') || typeof obj !== 'object') {
      obj = await this.load(obj as KT, { skipSetCache: true }) as T;

      if (obj === null) {
        return true;
      }
    } else {
      id = (obj as T)[this.primaryKeyName];
    }

    const ret = await this.dao.remove((obj && (obj as T)[this.primaryKeyName]) || id);
    await this._updateCache(obj as T, undefined, id);

    return ret;
  }

  async save(properties: ObjectProperties<T>) {
    const obj = this.createObject(properties);
    const existing = obj[this.primaryKeyName] ? await this.load(obj[this.primaryKeyName]) : null;
    if (existing) {
      if (await this.update(existing, properties)) {
        return existing;
      }

      return null;
    }

    try {
      return await this.create(properties);
    } catch (err) {
      this.ctx.logCritical({ msg: `${this.daoName} document save failed`, err, detail: { properties } });
      return null;
    }
  }

  async flushCache(obj: T) {
    await this._updateCache(obj);
  }

  protected async _updateCache(obj: T, updateValue?: ObjectProperties<T>, id?: KT, options?: { overwrite?: boolean ; skipSetCache?: boolean }) {
    if (obj) {
      await this.updateCache(obj, updateValue);
    }

    await this.clearRegisteredLoadWith(obj, updateValue);

    if (updateValue) {
      options && options.overwrite ? obj.overwriteProperties(updateValue) : obj.setProperties(updateValue);

      if (!(options && options.skipSetCache)) {
        await this.saveCache(obj);
      } else {
        await this.removeCache(obj[this.primaryKeyName]);
      }
    } else if (obj && obj[this.primaryKeyName] || id) {
      // 即使设置了skipSetCache，还是应该清理一下缓存，以免loadWith等操作带入了缓存
      await this.removeCache((obj && obj[this.primaryKeyName] || id)! as KT);
    }
  }

  protected async updateCache(obj: T, updateValue?: ObjectProperties<T>) {
    // implement by derived classes
  }

  protected async countWith(clause: Partial<{ [K in keyof T]: T[K] | any }> | any, options?: Partial<Exclude<CacheLoadOptions, { prefix: string; serializeType: string }> & { expires: number }>) {
    return await this.cachePoolChain.load(
      `count:${this.cacheKeyOf(clause)}`,
      async () => this.dao.count(clause),
      {
        prefix: `${this.cachePrefix()}cwith:`,
        skipCache: (options && options.skipCache) ?? this.option('disableCache', false),
        skipRuntimeCache: (options && options.skipRuntimeCache) ?? this.option('disableRuntimeCache', false),
        expires: options && options.expires || this.expires || 7200,
        ...(options as any || {})
      });
  }

  async flushCountWith(clause: Partial<{ [ K in keyof T ]: T[ K ] | any }>, options?: { prefix?: string }, autoRegistered = false) {
    await this.cachePoolChain.remove('count:' + this.cacheKeyOf(clause, undefined, autoRegistered), Object.assign({
      prefix: this.cachePrefix() + 'cwith:',
    }, options || {}));
  }

  private _registerFor(method: 'loadWith' | 'loadMultiWith' | 'countWith', filterKeys: (keyof T | { [ K in keyof T ]: any })[] | object, fetchOptions?: any) {
    const _method: 'LoadWith' | 'LoadMultiWith' | 'CountWith' = upperFirst(method) as any;

    if (!this[ 'registered' + _method ]) {
      this[ 'registered' + _method ] = [];
    }

    if (Array.isArray(filterKeys)) {
      this.ctx.assert(filterKeys.every(item => typeof item === 'string' || (typeof item === 'object' && Object.keys(item).length === 1)), 'invalid criteria registered');
    } else {
      this.ctx.assert(Object.keys(filterKeys).length === 1, 'invalid criteria registered');
    }

    if (this[ 'registered' + _method ].find(item => JSON.stringify(item) === JSON.stringify({ filterKeys, fetchOptions }))) {
      return;
    }

    this[ 'registered' + _method ].push({ filterKeys, fetchOptions });
  }

  protected registerLoadWith(filterKeys: (keyof T | { [ K in keyof T ]: any })[] | object, fetchOptions?: any) {
    this._registerFor('loadWith', filterKeys, fetchOptions);
  }

  protected registerLoadMultiWith(filterKeys: (keyof T | { [ K in keyof T ]: any })[] | object, fetchOptions?: any) {
    this._registerFor('loadMultiWith', filterKeys, fetchOptions);
  }

  protected registerCountWith(filterKeys: (keyof T | { [ K in keyof T ]: any })[] | object) {
    this._registerFor('countWith', filterKeys);
  }

  protected async clearRegisteredLoadWith(obj: T, updateValue?: ObjectProperties<T>) {
    await Promise.all([ ...(this.registeredLoadWith || []).map(item => (async item => {
      await this.updateCacheForLoadWith(item.filterKeys, obj, updateValue, item.fetchOptions);
    })(item)), ...(this.registeredLoadMultiWith || []).map(item => (async item => {
      await this.updateCacheForLoadMultiWith(item.filterKeys, obj, updateValue, item.fetchOptions);
    })(item)), ...(this.registeredCountWith || []).map(item => (async item => {
      await this.updateCacheForCountWith(item.filterKeys, obj, updateValue);
    })(item)) ]);
  }

  protected async _updateCacheFor(method: 'loadWith' | 'loadMultiWith' | 'countWith', clause: (keyof T | { [ K in keyof T ]: any })[] | object, obj: T, updateValue?: ObjectProperties<T>, fetchOptions?: any) {
    if (updateValue) {
      if (Array.isArray(clause)) {
        if (clause.some(item => (typeof item === 'string' ? updateValue.hasOwnProperty(item as string) : Object.keys(item).length > 0 && updateValue.hasOwnProperty(Object.keys(item)[ 0 ])))) {
          const originCriteria: any = {};
          const criteria: any = {};
          clause.forEach(item => {
            if (typeof item === 'string') {
              originCriteria[ item ] = obj[item];
              criteria[ item ] = updateValue.hasOwnProperty(item) ? updateValue[ item as string ] : obj[ item ];
            } else {
              const key = Object.keys(item)[0];
              originCriteria[ key ] = item[key];
              criteria[ key ] = item[ key ];
            }
          });

          if (JSON.stringify(originCriteria) === JSON.stringify(criteria)) {
            await this[ `flush${upperFirst(method)}` ](criteria, fetchOptions, true);
          } else {
            await Promise.all([
              this[ `flush${upperFirst(method)}` ](originCriteria, fetchOptions, true),
              this[ `flush${upperFirst(method)}` ](criteria, fetchOptions, true),
            ]);
          }
        }
      } else {
        if (Object.keys(clause).some(item => updateValue.hasOwnProperty(item))) {
          await this[ `flush${upperFirst(method)}` ](clause, fetchOptions, true);
        }
      }
    } else {
      if (Array.isArray(clause)) {
        const criteria: any = {};
        clause.forEach(item => {
          if (typeof item === 'string') {
            criteria[ item ] = obj[ item ];
          } else {
            const key = Object.keys(item)[ 0 ];
            criteria[ key ] = item[ key ];
          }
        });

        await this[ `flush${upperFirst(method)}` ](criteria, fetchOptions, true);
      } else {
        await this[ `flush${upperFirst(method)}` ](clause, fetchOptions, true);
      }
    }
  }

  protected async updateCacheForLoadWith(clause: (keyof T | { [ K in keyof T ]: any })[] | object, obj: T, updateValue?: ObjectProperties<T>, fetchOptions?: any) {
    await this._updateCacheFor('loadWith', clause, obj, updateValue, fetchOptions);
  }

  protected async updateCacheForLoadMultiWith(clause: (keyof T | { [ K in keyof T ]: any })[] | object, obj: T, updateValue?: ObjectProperties<T>, fetchOptions?: any) {
    await this._updateCacheFor('loadMultiWith', clause, obj, updateValue, fetchOptions);
  }

  protected async updateCacheForCountWith(clause: (keyof T | { [ K in keyof T ]: any })[] | object, obj: T, updateValue?: ObjectProperties<T>) {
    await this._updateCacheFor('countWith', clause, obj, updateValue);
  }

  // pagination(pageSize = 10) {
  //   return new Pagination(this, pageSize);
  // }
}
