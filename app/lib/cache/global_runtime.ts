import * as os from 'os';
import { Application } from 'egg';
import { Logger } from 'egg-logger';
import RuntimeRepository from './runtime';
import { createClient } from '../redis';
import { CacheSetOptions } from '../BaseCacheService';
import { Redis } from 'ioredis';

const debug = require('debug')('gaia:runtime');

export interface RuntimeRepositoryOptions {

}

const hostname = os.hostname();

export default class GlobalRuntimeRepository extends RuntimeRepository {
  protected app: Application;
  redis: Redis;

  constructor(app: Application, options?: RuntimeRepositoryOptions, logger?: Logger) {
    super(logger);

    Object.defineProperty(this, 'app', {
      enumerable: false,
      configurable: true,
      value: app,
    });

    this.startPubsub();

    this.app.assert(this.app.redis, 'should has redis');

    // publish的连接需要与subscribe的连接分开
    this.redis = this.app.getRedis() as Redis;
  }

  async set(key: string, value: any) {
    await super.set(key, value);

    this.redis.publish(`${this.app.name}.global_runtime.set`, JSON.stringify({ hostname, pid: process.pid, key, value }));
  }

  async remove(id: string) {
    await super.remove(id);

    this.redis.publish(`${this.app.name}.global_runtime.remove`, JSON.stringify({ hostname, pid: process.pid, key: id }));
  }

  async mset(values: Map<string, any>, options: CacheSetOptions = {}): Promise<void> {
    await super.mset(values, options);

    this.redis.publish(`${this.app.name}.global_runtime.mset`, JSON.stringify({ hostname, pid: process.pid, keys: values.keys() }));
  }

  clear() {
    super.clear();

    this.redis.publish(`${this.app.name}.global_runtime.flush`, JSON.stringify({ hostname, pid: process.pid }));
  }

  startPubsub() {
    const client = createClient(this.app, undefined, { noCluster: true }) as Redis;

    // 定时清理所有的全局缓存
    if (this.app.config.cache && this.app.config.cache.globalRuntime && this.app.config.cache.globalRuntime.autoExpire) {
      setTimeout(() => {
        super.clear();
      }, typeof this.app.config.cache.globalRuntime.autoExpire === 'number' ? this.app.config.cache.globalRuntime.autoExpire : 600000);
    }

    client.on('ready', () => {
      client.psubscribe(`${this.app.name}.global_runtime.*`);

      client.on('pmessage', async (pattern, channel, message) => {
        debug(`on redis message: ${channel} ${message}`);

        if (channel === `${this.app.name}.global_runtime.flush`) {
          super.clear();
        } else if (channel === `${this.app.name}.global_runtime.set`) {
          message = JSON.parse(message);
          if (message.hostname !== hostname || message.pid !== process.pid) {
            if (await this.get(message.key) !== message.value) {
              super.remove(message.key);
            }
          }
        } else if (channel === `${this.app.name}.global_runtime.remove`) {
          message = JSON.parse(message);
          if (message.hostname !== hostname || message.pid !== process.pid) {
            // await super.set(message.key, message.value);
            super.remove(message.key);
          }
        } else if (channel === `${this.app.name}.global_runtime.mset`) {
          message = JSON.parse(message);
          if (message.hostname !== hostname || message.pid !== process.pid) {
            const ids: string[] = message.keys;
            if (ids && Array.isArray(ids)) {
              ids.forEach(id => super.remove(id));
            }
          }
        }
      });
    });
  }
}
