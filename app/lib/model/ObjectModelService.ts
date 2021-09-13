import { Context } from 'egg';
import * as is from 'is-type-of';
import BaseModelObject, { KeyType, ModelObjectOptions } from '../../object/BaseModelObject';
import { ObjectProperties } from '../../object/BasePropertiesObject';
import LazyLoadObject from '../../object/LazyLoadObject';
import CachePoolChain from '../../service/cache/poolChain';
import BaseService from '../BaseService';
import { SerializeType } from '../serialize';

export type ObjectClass<T> = ({ new(properties: ObjectProperties<T>, ctx: Context): T }) | ((properties: ObjectProperties<T>, ctx: Context) => T)

export interface IObjectModelOptions<T> {
  objectCreator: (properties: ObjectProperties<T>, ctx: Context) => T;
  objectModelClass: ObjectClass<T>;
  expires: number;
  disableCache: boolean;
  disableRuntimeCache: boolean;
  cacheVersion: string;
  modelSourceName: string;
  serializeType: SerializeType;
  cacheRepository: string | string[];
  loadFilter: (obj: T) => T | null;
  primaryKeyName: string;
}

export type ObjectModelOptions<T> = Partial<IObjectModelOptions<T>>;

export const enum LoadAs {
  array = 'array',
  map = 'map',
}

export interface LoadOptions<T> {
  loadAs: LoadAs;
  skipEmpty: boolean;
  skipRuntimeCache: boolean;
  skipCache: boolean;
  skipSetCache: boolean;
  expires: number;
  filter?: (obj: T) => T | null;
}

export class Fetcher<KT = KeyType> {
  id: KT
  fetcher: (key: KT) => Promise<any>
  loadFromCache = true;

  constructor(id: KT, fetcher: (key: KT) => Promise<any>) {
    this.id = id;
    this.fetcher = fetcher;
  }

  async fetch(): Promise<any> {
    this.loadFromCache = false;
    return await this.fetcher(this.id);
  }
}

export class MultiFetcher<KT = KeyType> {
  ids: KT[]
  fetcher: (keys: KT[]) => Promise<Map<KT, any>>

  private missedIds: KT[];

  constructor(ids: KT[], fetcher: (keys: KT[]) => Promise<Map<KT, any>>) {
    this.ids = ids;
    this.fetcher = fetcher;
  }

  async fetch(ids: KT[]): Promise<Map<KT, any>> {
    this.missedIds = ids;
    return await this.fetcher(ids);
  }

  loadFromCache(id: KT): boolean {
    return !this.missedIds || this.missedIds.indexOf(id) === -1;
  }
}

export default abstract class ObjectModelService<KT = KeyType, T extends BaseModelObject<KT> = BaseModelObject<KT>, TOptions extends IObjectModelOptions<T> = IObjectModelOptions<T>> extends BaseService {
  protected objectCreator?: ((properties: ObjectProperties<T>, ctx: Context) => T | undefined) | undefined
  protected objectModelClass: ObjectClass<T> | undefined
  protected expires: number

  protected _modelName: string | undefined

  private _options: Partial<TOptions>;

  protected abstract fetchOne(id: KT): Promise<ObjectProperties<T> | null | undefined>
  protected abstract fetchMany(ids: KT[]): Promise<Map<KT, ObjectProperties<T> | null>>

  constructor(ctx: Context, options: Partial<TOptions>) {
    super(ctx);

    this._options = { serializeType: 'bson', ...(options || {}) };

    const { objectCreator, objectModelClass, expires } = { expires: 7 * 86400, ...(options || {})};

    this.objectCreator = objectCreator;
    this.objectModelClass = objectModelClass;
    this.expires = expires;

    this._modelName = this.constructor.name;
  }

  protected get cachePoolChain(): CachePoolChain {
    return this.ctx.service.cache.poolChain as any;
  }

  option<TName extends keyof TOptions>(name: TName): TOptions[TName] | undefined;
  option<TName extends keyof TOptions>(name: TName, defaultValue: TOptions[TName]): TOptions[TName];

  option<TName extends keyof TOptions>(name: TName, defaultValue?: TOptions[TName]): TOptions[TName] | undefined {
    return this.hasOption(name) ? this._options[name] : defaultValue;
  }

  hasOption(name: keyof TOptions): boolean {
    return this._options.hasOwnProperty(name);
  }

  setOption<TName extends keyof TOptions>(name: TName, value: TOptions[TName] | undefined) {
    this._options[name] = value;
  }

  setOptions(options: Partial<TOptions>) {
    Object.assign(this._options, options);
  }

  get primaryKeyName(): string {
    return this.option('primaryKeyName', 'id');
  }

  get disableCache(): boolean {
    return this.option('disableCache', false);
  }

  set disableCache(value: boolean) {
    this.setOption('disableCache', value);
  }

  get disableRuntimeCache(): boolean {
    return this.option('disableRuntimeCache', false);
  }

  set disableRuntimeCache(value: boolean) {
    this.setOption('disableRuntimeCache', value);
  }

  cachePrefix(): string {
    return this._modelName ? this._modelName : this.constructor.name;
  }

  private _cachePrefix(): string {
    return [ this.cachePrefix(), ...(this.hasOption('cacheVersion') ? [ this.option('cacheVersion') ] : []) ].join(':');
  }

  private _createObject(properties: ObjectProperties<T>, options?: ModelObjectOptions): T {
    const obj = this.createObject(properties, options);
    // 确保如果createObject被重写时的方法没有给ctx赋值能正确赋值
    if (obj && !obj.ctx) {
      Object.defineProperty(obj, 'ctx', {
        enumerable: false,
        configurable: true,
        value: this.ctx,
      });

      // object.ctx = this.ctx;
    }

    obj && options && obj.setOptions(options);

    return obj;
  }

  createObject(properties: ObjectProperties<T>, options?: ModelObjectOptions): T {
    let obj: T | null | undefined;

    if (this.objectCreator) {
      obj = this.objectCreator(properties, this.ctx);
    } else {
      const objectClass = this.objectClass(properties);

      if (objectClass) {
        if (is.class(objectClass)) {
          obj = (this.ctx as any).createObject(objectClass, properties, this.ctx);
        } else if (typeof objectClass === 'function') {
          obj = (objectClass as Function)(properties, this.ctx);
        } else {
          this.ctx.logCritical({ msg: 'invalid objectClass', detail: { model: this._modelName, properties } });
          this.ctx.assert(false, 'invalid objectClass');
        }
      }
    }

    if (!obj) {
      this.ctx.assert(false, `cannot create object in ${this.constructor.name} for properties: ${JSON.stringify(properties)}`);
    }

    if (obj) {
      Object.defineProperty(obj, 'ctx', {
        enumerable: false,
        configurable: true,
        value: this.ctx,
      });

      if (properties['model'] === undefined) {
        Object.defineProperty(obj, 'model', {
          enumerable: false,
          configurable: true,
          value: this,
        });
      }

      options && obj.setOptions(options);
    } else {
      this.ctx.logError({ msg: 'cannot create object for ' + this.constructor.name, detail: { properties } });
      // throw new Error('cannot create object for ' + this.constructor.name);
    }

    return obj as T;
  }

  objectClass(properties: ObjectProperties<T>) {
    return this.objectModelClass;
  }

  resolveResult(result: any, options: LoadOptions<T>): Map<KeyType, T> {
    return result;
  }

  protected async _loadMultiWithFetcher(fetcher: MultiFetcher<KT>, options: Partial<LoadOptions<T>> = {}): Promise<(T | null)[] | Map<KT, T> | T[]> {
    options = { skipEmpty: false, skipRuntimeCache: false, ...(options || {})};

    const ids = fetcher.ids;
    const res: Map<KT, ObjectProperties<T>> = await this.cachePoolChain.loadMulti(
      fetcher.ids,
      fetcher.fetch.bind(fetcher),
      {
        prefix: this._cachePrefix(),
        expires: options && options.expires || this.expires,
        skipCache: options.skipCache || this.disableCache || false,
        skipRuntimeCache: options.skipRuntimeCache || this.disableRuntimeCache || false,
        serializeType: this.option('serializeType', 'bson')!,
        repository: this.option('cacheRepository'),
      }
    );

    if (options && options.loadAs === LoadAs.array) {
      const result: (T | null)[] = [];
      ids.forEach(id => {
        const object = res.get(id);
        if (object) {
          const obj = this._createObject(object, { loadFromDb: true, loadFromCache: fetcher.loadFromCache(id) });
          // 兼容id类型不匹配情况 ObjectID <-> string, string <-> number
          // eslint-disable-next-line eqeqeq
          if (!obj[this.primaryKeyName] || String(obj[this.primaryKeyName]) != String(id)) {
            this.cachePoolChain.remove(id);
            // eslint-disable-next-line eqeqeq
            this.ctx.assert(id && obj[this.primaryKeyName] == id, `invalid object id: ${id} vs ${obj[this.primaryKeyName]} of object: ${JSON.stringify(obj)}`);
          }

          result.push(obj);
        } else if (!options.skipEmpty) {
          result.push(null);
        }
      });

      return result;
    }

    const result: Map<KT, T> = new Map<KT, T>();
    for (const [ key, object ] of res.entries()) {
      result.set(key, object ? (options && options.filter || this._options.loadFilter || (obj => obj))(this._createObject(object, { loadFromDb: true, loadFromCache: fetcher.loadFromCache(key) })) : object as any);
    }

    return result;
  }

  async loadMulti(ids: KT[], options: Partial<LoadOptions<T>> = {}): Promise<Array<T | null> | Map<KT, T> | (T | null | undefined)[] | T[]> {
    this.ctx.assert(ids instanceof Array, 'ids should be array: ' + JSON.stringify(ids));

    return await this._loadMultiWithFetcher(new MultiFetcher<KT>(ids, async ids => {
      return await this.fetchMany(ids);
    }), options);
  }

  async loadMultiAsArray(ids: KT[], options: Partial<LoadOptions<T>> = {}): Promise<T[]> {
    return await this.loadMulti(ids, { loadAs: LoadAs.array, skipEmpty: true, ...(options || {})}) as T[];
  }

  async loadMultiAsMap(ids: KT[], options: Partial<LoadOptions<T>> = {}): Promise<Map<KT, T>> {
    return await this.loadMulti(ids, { loadAs: LoadAs.map, ...(options || {})}) as Map<KT, T>;
  }

  async saveCache(obj: T) {
    this.ctx.assert(obj[this.primaryKeyName], `obj.${[this.primaryKeyName]} is invalid`);
    if (!obj || !obj[this.primaryKeyName]) {
      return;
    }

    return this.cachePoolChain.set(
      obj[this.primaryKeyName],
      obj.getProperties(),
      {
        prefix: this._cachePrefix(),
        expires: this.expires,
        skipCache: this.disableCache || false,
        skipRuntimeCache: this.disableRuntimeCache || false,
        serializeType: this.option('serializeType', 'bson')!,
        repository: this.option('cacheRepository'),
      }
    );
  }

  protected validId(id: KT) {
    return id;
  }

  protected async _loadWithFetcher(fetcher: Fetcher<KT>, options: Partial<LoadOptions<T>> = {}): Promise<T | null> {
    const res = await this.cachePoolChain.load(
      fetcher.id,
      fetcher.fetch.bind(fetcher),
      {
        prefix: this._cachePrefix(),
        expires: options && options.expires || this.expires,
        skipCache: options.skipCache || this.disableCache || false,
        skipSetCache: options.skipSetCache || false,
        skipRuntimeCache: options.skipRuntimeCache || this.disableRuntimeCache || false,
        serializeType: this.option('serializeType', 'bson')!,
        repository: this.option('cacheRepository')
      }
    );

    if (res) {
      const obj = this._createObject(res, { loadFromDb: true, loadFromCache: fetcher.loadFromCache });
      if (!obj[this.primaryKeyName] || this.validId(obj[this.primaryKeyName]) != this.validId(fetcher.id)) {
        await this.cachePoolChain.remove(fetcher.id, { repository: this.option('cacheRepository') });
        this.ctx.assert(obj[this.primaryKeyName] && obj[this.primaryKeyName] == fetcher.id, `invalid object id: ${fetcher.id} vs ${obj[this.primaryKeyName]} of object: ${JSON.stringify(obj)}`);
      }

      return (options && options.filter || this._options.loadFilter || (obj => obj))(obj);
    }

    return null;
  }

  async load(id: KT, options: Partial<LoadOptions<T>> = {}): Promise<T | null> {
    return await this._loadWithFetcher(new Fetcher(id, async () => {
      return await this.fetchOne(id);
    }), options);
  }

  async safeLoad(id: KT, options: Partial<LoadOptions<T>> = {}): Promise<T> {
    const obj = await this.load(id, options);
    if (!obj) {
      throw this.ctx.service.error.createBusinessError({ code: 404, msg: `资源${id}不存在` });
    }
    return obj;
  }

  async removeCache(id: KT) {
    await this.cachePoolChain.remove(id, { prefix: this._cachePrefix(), skipCache: this.disableCache || false, repository: this.option('cacheRepository') });
  }

  lazyLoad(id: KT) {
    return new LazyLoadObject<KT, T>(id, this);
  }
}
