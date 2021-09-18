import { Context } from 'egg';
import BaseService from './BaseService';
import { isArray, isMap } from 'lodash';
import { KeyType } from '../object/BaseModelObject';
import * as is from 'is-type-of';
import { SerializeType } from './serialize';
import { ObjectProperties } from '../object/BasePropertiesObject';

export interface CacheOptions {
  repository?: string | string[] | undefined;
}

export interface CacheSetOptions extends CacheOptions {
  prefix?: string;
  expires?: number;
  serializeType?: SerializeType | undefined;
}

// export type KeyType = string | number;

export interface CacheRepository {
  available(): boolean;
  get(key: string, options?: CacheOptions): Promise<any>;
  set(key: string, value: any, options: CacheSetOptions): Promise<void>;
  remove(key: string, options?: CacheOptions): Promise<void>;
}

export interface LoadOptions<TCreator = any> extends CacheSetOptions {
  skipCache?: boolean;
  skipRuntimeCache?: boolean;
  skipSetCache?: boolean;
  creator?: ((properties: ObjectProperties<TCreator>, ctx?: Context) => TCreator) | { new(properties: ObjectProperties<TCreator>, ctx?: Context): TCreator };
}

export class BaseCacheService extends BaseService implements CacheRepository {
  protected _cacheRepository: CacheRepository;

  constructor(ctx: Context, repository?: CacheRepository) {
    super(ctx);

    if (repository) {
      this._cacheRepository = repository;
    }
  }

  get cacheRepository(): CacheRepository {
    return this._cacheRepository;
  }

  available() {
    return this.cacheRepository.available();
  }

  // tslint:disable-next-line: no-reserved-keywords
  async get(key: string, options?: CacheOptions): Promise<any> {
    return await this.cacheRepository.get(key, options);
  }

  // tslint:disable-next-line: no-reserved-keywords
  async set(key: string, value: any, options?: CacheSetOptions): Promise<void> {
    return await this.cacheRepository.set((options && options.prefix ? options.prefix : '') + key, value, { expires: options && options.expires || 600, ...(options && options.serializeType ? { serializeType: options.serializeType } : {}), ...(options && options.repository ? { repository: options && options.repository } : {}) });
  }

  async remove(key: string, options?: CacheOptions) {
    await this.cacheRepository.remove(key, options);
  }

  async mget(keys: string[], options?: CacheOptions): Promise<Map<string, any>> {
    this.ctx.assert(Array.isArray(keys), 'keys should be array to mget');

    const results: any[] = await Promise.all(keys.map(key => this.get(key, options)));

    const res = new Map<string, any>();
    results.forEach((value, index) => {
      if (!is.undefined(value)) {
        res.set(keys[ index ], value);
      }
    });

    return res;
  }

  async mset(values: Map<string, any>, options: CacheSetOptions): Promise<void> {
    const all: Promise<void>[] = [];

    values.forEach((value: any, key: string) => {
      all.push(this.set(key, value, options));
    });

    await Promise.all(all);
    return;
  }

  async load<T = any, KT = KeyType>(key: KT, missingLoader: ((key: KT) => Promise<T | null>) | undefined, options: LoadOptions<T> = {}): Promise<T> {
    const { expires, prefix } = Object.assign({ expires: 86400, prefix: null }, options || {});

    let res: any;

    const cache_key = prefix ? prefix + key : String(key);
    try {
      res = await this.get(cache_key, options);
    } catch (err) {
      this.ctx.logError({ type: 'app_error', module: 'cache', err, msg: 'failed to get cache', detail: { cache_key } });
    }

    if (is.undefined(res)) {
      if (missingLoader) {
        // try {
        res = await missingLoader(key);
        // } catch (err) {
        //   this.ctx.logError({ type: 'app_error', msg: `cannot load ${key}`, error: err }, err);
        //   throw err;
        //   // res = undefined;
        // }
      }

      if (!options.skipSetCache && !is.undefined(res)) {
        // eslint-disable-next-line no-bitwise
        await this.set(cache_key, res, { expires: res ? expires : expires >> 10, serializeType: options.serializeType, repository: options.repository }).catch(err => {
          this.ctx.logError({
            type: 'app_error',
            module: 'cache',
            msg: 'set cache error: ' + err.message,
            error: err,
            detail: { cache_key, res, expires },
          }, err);
        });
      }
    } else {
      res = this.loadFromCache(res, options);
    }

    return res;
  }

  private loadFromCache<T>(res: any, options: LoadOptions<T>) {
    if (options && options.creator) {
      if (is.class(options.creator)) {
        const creator = options.creator as unknown as { new(properties: ObjectProperties<T>, ctx?: Context): T };
        res = new creator(res, this.ctx);
      } else if (is.function(options.creator)) {
        const creator = options.creator as unknown as (properties: ObjectProperties<T>, ctx?: Context) => T;
        res = creator(res, this.ctx);
      }
    }

    return res;
  }

  async loadMulti<T = any, KT = KeyType>(keys: KT[], missingLoader: ((keys: KT[]) => Promise<Map<KT, any> | any[]>) | undefined, options: LoadOptions<T> = {}): Promise<Map<KT, any>> {
    const { expires, prefix } = Object.assign({ expires: 86400, prefix: null }, options || {});

    const cacheKeys: string[] = (keys as any[]).map(key => (prefix ? prefix + key : key.toString()));

    let cacheHit: Map<string, any>;
    try {
      cacheHit = await this.mget(cacheKeys, options);
    } catch (err) {
      this.ctx.logError({ type: 'app_error', module: 'cache', msg: 'get cache error', err, detail: { cacheKeys } });
      cacheHit = new Map<string, any>();
    }

    const missedKeys: KT[] = [];

    const result = new Map<KT, any>();

    cacheKeys.forEach((key: string, index: number) => {
      if (!cacheHit.has(key)) {
        missedKeys.push(keys[ index ] as any);
      } else {
        result.set(keys[ index ], this.loadFromCache(cacheHit.get(key), options));
      }
    });

    if (missedKeys.length === 0) {
      return result;
    }

    const missedObjects = new Map<string, any>();

    let retrieved;
    if (missingLoader) {
      // try {
        retrieved = await missingLoader(missedKeys);
      // } catch (err) {
      //   this.ctx.logError({ type: 'app_error', msg: `cannot load ${missedKeys.join(',')}`, error: err }, err);
      //   retrieved = undefined;
      // }
    } else {
      retrieved = undefined;
    }

    if (typeof retrieved !== 'undefined') {
      if (isArray(retrieved)) {
        retrieved.forEach((value, index) => {
          result.set(missedKeys[ index ], value);
          missedObjects.set(prefix ? prefix + missedKeys[ index ] : String(missedKeys[ index ]), value);
        });
      } else {
        const ismap = isMap(retrieved);
        missedKeys.forEach(key => {
          const value = ismap ? (retrieved as Map<KT, any>).get(key) : (retrieved as any)[ typeof key === 'object' && (key as any).toString() || key as any ];
          if (!is.undefined(value)) {
            result.set(key, value);
            missedObjects.set(prefix ? prefix + key : String(key), value);
          }
        });
      }

      await this.mset(missedObjects, { expires, repository: options.repository, serializeType: options.serializeType }).catch(err => {
        this.ctx.logError({ type: 'app_error', module: 'cache', msg: 'set cache error', err, detail: { missedObjects, expires } });
      });
    }

    return result;
  }
}
