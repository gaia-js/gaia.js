import { Context } from 'egg';

import BaseService from '../lib/BaseService';
import { list as redisCommandList } from 'redis-commands';
import { Commands, Redis } from 'ioredis';
import { sleep } from '../lib/utils';
import { Singleton } from '../../typings/app';
import ObjectProfiler from '../lib/object_profiler';

class RedisService extends BaseService {
  constructor(ctx: Context) {
    super(ctx);

    let redisClient: any = this.app.redis;
    ctx.assert(redisClient, 'redis配置错误');

    const instanceName = redisClient.clients && redisClient.clients.keys && redisClient.clients.keys().next().value;
    if (instanceName && redisClient.get(instanceName)) {
      redisClient = redisClient.clients && redisClient.get(instanceName);
    }

    redisCommandList.forEach((func: string) => {
      this[ func ] = async (...params: any[]) => {
        if (!redisClient) {
          throw new Error('cannot get redis connection');
        }

        const item = this.ctx.service.profiler.createItem('redis', { operation: func });

        const ret = await redisClient[func](...params);

        if (item.last() > 100) {
          item.addTag('timeout', 'timeout');
        }

        this.ctx.service.profiler.addItem(item);

        return ret;
      };
    });
  }

  async execExclusively<T>(key: string, callback: () => Promise<void>, expire?: number) {
    this.ctx.assert(this.ctx.app.redis);

    const redis: Redis = this as unknown as Redis;

    const res = await redis.setnx(key, `${Date.now()}`);
    if (res) {
      try {
        if (expire && !(await redis.expire(key, expire))) {
          this.ctx.logNotice({ msg: 'set expire failed', detail: { key, expire } });
        }
      } catch (err) {
        this.ctx.logNotice({ msg: 'set expire failed', err, detail: { key, expire } });
      }

      try {
        await callback();
        return true;
      } finally {
        await redis.del(key);
      }
    } else {
      if (expire && (await redis.ttl(key)) === -1) {
        await redis.expire(key, expire);
      }

      return false;
    }
  }

  async lock<T>(key: string, callback: () => Promise<void>, options: { wait: number; expire?: number }) {
    const start = Date.now();

    const wait = options.wait || 0;

    do {
      const res = await this.execExclusively(key, callback, options && options.expire || 3600);
      if (res) {
        return res;
      }

      wait && await sleep(Math.min(wait * 100, 50));
    } while (Date.now() < start + wait * 1000);

    this.ctx.logError({ msg: 'lock超时', detail: { key, start, now: Date.now(), wait } });
    throw this.ctx.service.error.createBusinessError({ code: 503, msg: '系统超时' + (Date.now() - start), detail: { error: 'lock失败', start, now: Date.now() } });
  }

  connectionOf(name?: string) {
    const redis = (this.app.redis as unknown as Singleton<Redis>).get(name || 'default') ||
      (!name && ((this.app.config.redis.clients && (this.app.redis as unknown as Singleton<Redis>).get(Object.keys(this.app.config.redis.clients)[ 0 ])) || this.app.redis));

    return redis && ObjectProfiler.createProfileProxy(redis, 'redis', {},  this.ctx, { methods: redisCommandList });
  }
}

declare interface RedisService extends Omit<Commands, 'config'> {
};

export default RedisService;
