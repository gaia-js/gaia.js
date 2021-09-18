import { BaseCacheService, CacheRepository, CacheSetOptions } from '../../lib/BaseCacheService';
import { Context } from 'egg';
import * as Memcached from 'memcached';

function getRepository(ctx: Context) {
  function prepareMemcached() {
    const memcached = ctx.app.memcached;

    if (!memcached) {
      const memcached = new Memcached(ctx.app.config.cache.memcached.url);
      memcached.on('failure', (details: any) => {
        ctx.app.coreLogger.error('memcached', {
          type: 'memcached-error',
          msg: 'Memcached connect fail',
          detail: `failure: Server ${details.server}went down due to: ${details.messages.join()}`,
        });
      });
      memcached.on('reconnecting', (details: any) => {
        ctx.app.coreLogger.error('memcached', {
          type: 'memcached-error',
          msg: 'Memcached reconnecting',
          detail: `reconnecting: Total downtime caused by server ${details.server} :${details.totalDownTime}ms`,
        });
      });

      ctx.app.memcached = memcached;
    }

    return memcached;
  }

  prepareMemcached();

  class MemcachedCache implements CacheRepository {
    available() {
      return !!(ctx.app.config.cache?.memcached && ctx.app.memcached);
    }

    // tslint:disable-next-line: no-reserved-keywords
    async get(key: string): Promise<any> {
      return await new Promise<any>((resolve, reject) => {
        const item = ctx.service.profiler.createItem('memcached', { operation: 'get' });

        ctx.app.memcached.get(key, (err: Error, data: any) => {
          if (item.last() > 100) {
            item.addTag('timeout', 'timeout');
          }

          ctx.service.profiler.addItem(item);
          if (err) {
            resolve(undefined);
            // reject(err);
            // return;
          }

          resolve(data);
        });
      });
    }

    // tslint:disable-next-line: no-reserved-keywords
    async set(key: string, value: any, options: CacheSetOptions = {}): Promise<void> {
      await new Promise<void>((resolve, reject) => {
        const item = ctx.service.profiler.createItem('memcached', { operation: 'set' });
        ctx.app.memcached.set(key, value, { expiry: (options && options.expires) || 3600 }, (err: Error, result: any) => {

          if (item.last() > 100) {
            item.addTag('timeout', 'timeout');
          }

          ctx.service.profiler.addItem(item);
          // if (err) {
          //     reject(err);
          //     return;
          // }

          resolve();
        });
      });
    }

    async remove(key: string): Promise<void> {
      await new Promise<void>((resolve, reject) => {
        const item = ctx.service.profiler.createItem('memcached', { operation: 'remove' });
        ctx.app.memcached.del(key, (err: Error, result: any) => {

          if (item.last() > 100) {
            item.addTag('timeout', 'timeout');
          }

          ctx.service.profiler.addItem(item);
          // if (err) {
          //     reject(err);
          //     return;
          // }

          resolve();
        });
      });
    }
  }

  return new MemcachedCache();
}

export default class MemcachedCacheService extends BaseCacheService {
  constructor(ctx: Context) {
    super(ctx, getRepository(ctx));
  }
}
