import { BaseCacheService, CacheRepository, CacheSetOptions } from '../../lib/BaseCacheService';
import { Context } from 'egg';
// import "egg-redis";
// import { Redis } from "ioredis";

// declare module 'egg' {
//   interface Application {
//     redis: Redis & Singleton<Redis>;
//   }
// }

class RedisCache implements CacheRepository {
  private ctx: Context;

  constructor(ctx: Context) {
    Object.defineProperty(this, 'ctx', {
      enumerable: false,
      configurable: true,
      value: ctx,
    });
  }

  available() {
    return !!(this.ctx.app.redis && this.redis);
  }

  get redis() {
    return ((this.ctx.app.redis as any).clients && (this.ctx.app.redis as any).clients.get('default')) || this.ctx.app.redis;
  }

  // tslint:disable-next-line: no-reserved-keywords
  async get(key: string) {
    const item = this.ctx.service.profiler.createItem('redis', { operation: 'get' });

    const res = await this.redis.get(key);

    this.ctx.service.profiler.addItem(item);

    if (typeof res === 'undefined' || res === null) {
      return undefined;
    }

    try {
      return JSON.parse(res);
    } catch (err) {
      this.ctx.logError({ msg: 'deserialize failed', err, detail: { key, res } });
      return undefined;
    }
  }

  async mget(keys: string[]): Promise<Map<string, any>> {
    const item = this.ctx.service.profiler.createItem('redis', { operation: 'mget' });

    const res = await this.redis.mget(keys as any);

    if (item.last() > 100) {
      item.addTag('timeout', 'timeout');
    }

    this.ctx.service.profiler.addItem(item);

    const ret = new Map();

    res &&
      res.forEach((value: any, index: number) => {
        if (value !== null) {
          try {
            ret.set(keys[index], JSON.parse(value));
          } catch (err) {
            this.ctx.logError({ msg: 'deserialize failed', err, detail: { key: keys[index], value } });
            // omit
          }
        }
      });

    return ret;
  }

  // tslint:disable-next-line: no-reserved-keywords
  async set(key: string, value: any, options: CacheSetOptions = {}) {
    const item = this.ctx.service.profiler.createItem('redis', { operation: 'setex' });

    await this.redis.setex(key, (options && options.expires) || 3600, JSON.stringify(value));

    if (item.last() > 100) {
      item.addTag('timeout', 'timeout');
    }

    this.ctx.service.profiler.addItem(item);
  }

  // async mset(values) {
  //     return await redis.mset(values);
  // }

  async remove(key: string): Promise<void> {
    const item = this.ctx.service.profiler.createItem('redis', { operation: 'del' });

    await this.redis.del(key);

    if (item.last() > 100) {
      item.addTag('timeout', 'timeout');
    }

    this.ctx.service.profiler.addItem(item);

    return;
  }
}

function getRepository(ctx: Context) {
  return new RedisCache(ctx);
}

export default class RedisService extends BaseCacheService {
  constructor(ctx: Context) {
    super(ctx, getRepository(ctx));
  }

  async mget(keys: string[]): Promise<Map<string, any>> {
    return await (<RedisCache>this.cacheRepository).mget(keys);
  }
}
