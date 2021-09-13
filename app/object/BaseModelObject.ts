import { Context } from 'egg';
import BasePropertiesObject, { ObjectProperties } from './BasePropertiesObject';
import { LoadOptions } from '../lib/BaseCacheService';
// import ObjectModelService from '../lib/model/ObjectModelService';

export type KeyType = string | number;

export interface ModelObjectOptions {
  newCreated?: boolean;
  loadFromDb?: boolean;
  loadFromCache?: boolean;
}

export interface CacheableOptions extends LoadOptions {
  readonly?: boolean;
}

export function cacheable(options: CacheableOptions = {}) {
  return function(
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originGetter = descriptor.get;
    const originValue = descriptor.value;

    const accessor: { get?: any; set?: any } = {
      // eslint-disable-next-line object-shorthand
      get: function(this: BaseModelObject) {
        return this.loadCacheableProperty(
          propertyKey,
          () => {
            return (originGetter && originGetter.call(this)) || originValue;
          },
          options
        );
      },
    };

    if (!options.readonly) {
      accessor.set = function(this: BaseModelObject, value: any) {
        this.setCacheableProperty(propertyKey, value);
      };
    }

    Object.assign(descriptor, accessor);
  };
}

export default abstract class BaseModelObject<KT = KeyType> extends BasePropertiesObject {
  private _cacheableVars: { [name: string]: any };
  private _options: ModelObjectOptions;

  // protected model?: ObjectModelService<KT, this>; // 用ctx.Object...create() 生成的没有model属性

  abstract get id(): KT;

  constructor(properties: ObjectProperties<any>, ctx: Context) {
    super(properties, ctx);

    const _cacheableVars = {};
    Object.defineProperty(this, '_cacheableVars', {
      enumerable: false,
      configurable: false,
      writable: false,
      value: _cacheableVars,
    });

    const _options: ModelObjectOptions = {};
    Object.defineProperty(this, '_options', {
      enumerable: false,
      writable: false,
      configurable: false,
      value: _options,
    });
  }

  async loadCacheableProperty<T = any>(
    propertyName: string,
    missed: (key: string) => Promise<T>,
    options: LoadOptions<T> = { skipCache: true }
  ): Promise<T> {
    options = Object.assign({ skipCache: true }, options || {});

    if (!this._cacheableVars.hasOwnProperty(propertyName)) {
      try {
        const ret = await this.ctx.service.cache.poolChain.load(
          propertyName,
          missed,
          Object.assign(
            {
              prefix: `${this.constructor.name}:${this.id}:`,
              expires: 7 * 86400,
            },
            options || {}
          )
        );
        if (typeof ret === 'undefined') {
          // @ts-ignore
          return ret;
        }

        this._cacheableVars[propertyName] = ret;
      } catch (err) {
        // this.ctx.logError({ msg: 'cannot load property of ' + propertyName, error: err }, err);
        // @ts-ignore
        throw err;
      }
    }

    return this._cacheableVars[propertyName];
  }

  getCacheableProperty(propertyName: string) {
    this.ctx.assert(this._cacheableVars.hasOwnProperty(propertyName), `trying to get property ${propertyName} not prepared`);

    return this._cacheableVars[propertyName];
  }

  async clearCacheableProperty(propertyName: string) {
    delete this._cacheableVars[propertyName];
    await this.ctx.service.cache.poolChain.remove(propertyName, { prefix: `${this.constructor.name}:${this.id}:` });
  }

  async setCacheableProperty(propertyName: string, value: any) {
    this._cacheableVars[propertyName] = value;
  }

  setOptions(options: ModelObjectOptions) {
    Object.assign(this._options, options);
  }

  setOption(name: string, value: any) {
    this._options[name] = value;
  }

  get isNewCreated(): boolean {
    return (this._options && this._options.newCreated) || false;
  }

  set isNewCreated(value: boolean) {
    this._options.newCreated = value;
  }

  get isLoadFromDb(): boolean {
    return this._options.loadFromDb || false;
  }

  set isLoadFromDb(value: boolean) {
    this._options.loadFromDb = value;
  }

  get isLoadFromCache(): boolean {
    return this._options.loadFromCache || false;
  }

  set isLoadFromCache(value: boolean) {
    this._options.loadFromCache = value;
  }
}
