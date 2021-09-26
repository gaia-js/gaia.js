import { BaseCacheService, LoadOptions } from '../../lib/BaseCacheService';
import { Context, Service } from 'egg';

interface CachePoolChainLoadOptions<T = any> extends LoadOptions<T> {
  skipRuntimeCache?: boolean;
}

type KeyType = string | number | any;

export default class CachePoolChain extends Service {
  protected cachePool: BaseCacheService[];

  constructor(ctx: Context) {
    super(ctx);

    this.cachePool = [ ctx.service.cache.runtime as any, ctx.service.cache[ (ctx.app.config.cache && ctx.app.config.cache.type) || 'couchbase'] as any ];
  }

  async load<T = any, KT = KeyType>(id: KT, missedCallback: ((key: KT) => Promise<T>) | undefined, options: CachePoolChainLoadOptions<T> = {}): Promise<T> {
    let index = 1;
    const callback = async () => {
      if (options.skipCache) {
        return missedCallback ? missedCallback(id) : undefined;
      }

      if (index < this.cachePool.length) {
        index++;
      }

      return await this.cachePool[index - 1].load(id, index < this.cachePool.length ? callback : missedCallback, options);
    };

    if (options && options.skipRuntimeCache || false) {
      return await callback();
    }

    return await this.cachePool[0].load(id, callback, options);
  }

  async loadMulti<T = any, KT = KeyType>(ids: KT[], missedCallback: ((keys: KT[]) => Promise<Map<KT, T>>) | undefined, options: CachePoolChainLoadOptions<T> = {}): Promise<Map<KT, T>> {
    let index = 1;
    const callback = async (ids: KT[]) => {
      if (options.skipCache) {
        return missedCallback ? missedCallback(ids) : new Map<KT, T>();
      }

      if (index < this.cachePool.length) {
        index++;
      }

      return await this.cachePool[index - 1].loadMulti(ids, index < this.cachePool.length ? callback : missedCallback, options);
    };

    if (options && options.skipRuntimeCache || false) {
      return await callback(ids);
    }

    return await this.cachePool[0].loadMulti(ids, callback, options);
  }

  async remove<KT = KeyType>(id: KT, options: { prefix?: string, skipCache?: boolean, repository?: string | string[] | undefined } = {}) {
    // return Promise.all(this.cachePool.map((cache) => {
    //     return new Promise((resolve, reject) => {
    //         try {
    //             (async () => {
    //                 await cache.deleteCache(id, options);
    //             })();
    //         }
    //         catch(err) {
    //             reject(err);
    //         }
    //     });
    // }));
    // for (const cache of this.cachePool) {
    //     await cache.remove(id, options);
    // }
    if (options.skipCache) {
      await this.cachePool[0].remove((options && options.prefix || '') + id, { repository: options.repository });
      return;
    }

    await Promise.all(this.cachePool.map(cache => cache.remove((options && options.prefix || '') + id, options)));
  }

  // tslint:disable-next-line: no-reserved-keywords
  async get<KT = KeyType>(key: KT, options: CachePoolChainLoadOptions = {}): Promise<any> {
    return await this.load(key, undefined, options);
  }

  // tslint:disable-next-line: no-reserved-keywords
  async set<KT = KeyType>(key: KT, value: any, options: CachePoolChainLoadOptions = {}): Promise<void> {
    if (options.skipCache && options.skipRuntimeCache) {
      return;
    } else if (options.skipCache && !options.skipRuntimeCache) {
      await this.cachePool[0].set(String(key), value, options);
      return;
    }

    await Promise.all(this.cachePool.map(cache => cache.set(String(key), value, options)));
  }

  async mset<KT = KeyType>(values: Map<KT, any>, options: CachePoolChainLoadOptions = {}): Promise<void> {
    if (!options || !options.skipRuntimeCache) {
      this.cachePool && this.cachePool.length > 0 && await this.cachePool[0].mset(values as any, options);
    }

    if (!options || !options.skipCache) {
      this.cachePool && this.cachePool.length > 1 && await this.cachePool[1].mset(values as any, options);
    }
  }
}
