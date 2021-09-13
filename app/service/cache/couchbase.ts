import * as couchbase from 'couchbase';
import { CacheRepository, CacheSetOptions, BaseCacheService, CacheOptions } from '../../lib/BaseCacheService';
import { Context, Application } from 'egg';
import * as rhea from 'rhea-cli';
import * as md5 from 'md5';
import { deserialize, serialize } from '../../lib/serialize';
import { CouchbaseConfig } from '../../../typings/gaia-config';

function openBucket(app: Application, config: CouchbaseConfig, name: string) {
  if (!app.couchbase) {
    app.couchbase = {};
  }

  let bucket = app.couchbase[name];

  if (!bucket) {
    const cluster = new couchbase.Cluster(config.url);

    const start = Date.now();
    bucket = cluster.openBucket(config.bucket, err => {
      const tags: { [key: string]: string } = { operation: 'connect' };
      const duration = Date.now() - start;
      if (duration > 200) {
        tags.timeout = 'timeout';
      }

      rhea.submit('couchbase', tags, 1, duration);

      if (err) {
        app.logger.error({ module: 'couchbase', detail: { operation: 'connect' } }, err);

        // console.error('Couchbase openBucket. Got error getting bucket: ' + config.bucket + ': %j', err);
      } else {
        app.logger.debug('Couchbase bucket: ' + config!.bucket + ': connected');
      }
    });

    bucket.on('error', err => {
      app.logger.error({ module: 'couchbase', level: 'CRIT', detail: { operation: 'error' } }, err);

      // console.debug('couchbase on error: ', err);
      if (app.couchbase && app.couchbase[name!]) {
        delete app.couchbase[name!];
      }
    });

    bucket.operationTimeout = (config && config.operationTimeout) || 2000;

    app.couchbase[name!] = bucket;
  }

  return bucket;
}

const bucketCache: {
  [ name: string ]: {
    name: string;
    config: any;
  };
} = {

};

class CouchbaseRepository implements CacheRepository {
  private ctx: Context;
  // private name: string;
  // private config: CouchbaseConfig;
  // private bucket: couchbase.Bucket;

  constructor(ctx: Context) {
    Object.defineProperty(this, 'ctx', {
      enumerable: false,
      value: ctx,
    });
  }

  private getConfig(names?: string | string[]) {
    const app = this.ctx.app;

    let name = 'default';

    if (names && Array.isArray(names) && names.length > 0) {
      if ((app.config.couchbase as any).clusters) {
        for (const item of names) {
          if ((app.config.couchbase as any).clusters[ item ]) {
            name = item;
            break;
          }
        }
      }
    } else if (names) {
      name = names as string;
    }

    if (bucketCache) {
      if (!name) {
        if (Object.keys(bucketCache).length > 0) {
          return bucketCache[Object.keys(bucketCache)[0]];
        }
      } else if (bucketCache[name]) {
        return bucketCache[name];
      }
    }

    let config: CouchbaseConfig | undefined;
    if (!name && (app.config.couchbase as any).url) {
      config = app.config.couchbase as unknown as CouchbaseConfig;
    } else if ((app.config.couchbase as any).clusters) {
      if (!name) {
        if ((app.config.couchbase as any).clusters.default) {
          name = 'default';
        } else if (Object.keys((app.config.couchbase as any).clusters).length > 0) {
          name = ((app.config.couchbase as any).clusters)[Object.keys((app.config.couchbase as any).clusters)[0]];
        } else {
          this.ctx.assert(false, '系统错误，配置未定义');
        }
      }

      config = ((app.config.couchbase as any).clusters)[name!];
    }

    if (!config) {
      this.ctx.assert(config, 'cannot get config of couchbase:' + (name || 'default'));
    }

    const res = bucketCache[ name ] = {
      name,
      config,
    };

    return res;
  }

  private async connect(cluster?: string | string[]) {
    const { name, config } = this.getConfig(cluster);
    const bucket = openBucket(this.ctx.app, config, name);

    return { bucket, prefix: config.prefix, config };
  }

  private getKey(key: string, prefix?: string): string {
    return (prefix || '') + (key.length > 48 ? md5(key) : key)
  }

  available(): boolean {
    return !!(this.ctx.app.config.couchbase && this.getConfig());
  }

  async get(key: string, options?: CacheOptions): Promise<any> {
    const ctx = this.ctx;

    const { bucket, prefix, config } = await this.connect(options && options.repository);

    return await new Promise((resolve, reject) => {
      const item = ctx.service.profiler.createItem('couchbase', { operation: 'get' });

      let resolved = false;

      const timer = setTimeout(() => {
        resolved = true;

        if (item.last() > 100) {
          item.addTag('timeout', 'timeout');
        }

        ctx.service.profiler.addItem(item);

        resolve(undefined);
      }, (config && config.operationTimeout) || 2000);

      const couchbaseKey = this.getKey(key, prefix);
      bucket.get(couchbaseKey, (err, result) => {
        clearTimeout(timer);

        if (resolved) {
          ctx.logNotice({ type: 'slowreq_couchbase', module: 'couchbase', msg: 'couchbase get timeout ' + item.last() + 'ms', detail: { operation: 'get', key } }, err as any);

          return;
        }

        if (item.last() > 100) {
          item.addTag('timeout', 'timeout');
        }

        ctx.service.profiler.addItem(item);

        if (err) {
          if (err.code === couchbase.errors.keyNotFound || err.code === couchbase.errors.timedOut) {
            resolve(undefined);
            return;
          }

          ctx.logError({ module: 'couchbase', detail: { operation: 'get', key } }, err);

          resolve(undefined);
          return;
        }

        deserialize(result.value).then(resolve).catch(() => {
          resolve(undefined);
        });
        // let value = unserialize(result.value);
        // // if (typeof result.value === 'string') {
        // //   try {
        // //     value = JSON.parse(result.value)
        // //   } catch (err) {
        // //     ctx.logWarn({ module: 'couchbase', msg:'unserialize failed', detail: { operation: 'get', key, value } }, err);
        // //   }
        // // }

        // resolve(value);
      });
    });
  }

  async set(key: string, value: any, options: CacheSetOptions = {}): Promise<void> {
    const ctx = this.ctx;

    const { bucket, prefix } = await this.connect(options.repository);

    return await new Promise<void>((resolve, reject) => {
      const item = ctx.service.profiler.createItem('couchbase', { operation: 'upsert' });

      let expiry = options && options.expires;
      if (expiry) {
        if (expiry >= 60 * 60 * 24 * 30 && expiry <= Date.now() / 1000) {
          // ctx.logger.warn({ msg: 'unexpected expiry for couchbase upsert', detail: { key, expiry } });
          expiry = Date.now() / 1000 + expiry;
        }
      } else {
        expiry = 3600;
      }

      serialize(value, { type: options.serializeType }).then(serializedValue => {
        const couchbaseKey = this.getKey((options && options.prefix || '') + key, prefix);
        bucket.upsert(couchbaseKey, serializedValue, { expiry }, function(err, result) {
          if (item.last() > 100) {
            item.addTag('timeout', 'timeout');
          }

          ctx.service.profiler.addItem(item);

          if (err) {
            ctx.logError({ module: 'couchbase', detail: { operation: 'set', key, value } }, err);
            // reject(err);
            // return;
          }

          resolve();
        });
      }).catch(reject);
    });
  }

  async remove(key: string, options?: CacheOptions): Promise<void> {
    const ctx = this.ctx;

    const { bucket, prefix } = await this.connect(options && options.repository);

    return await new Promise<void>((resolve, reject) => {
      const item = ctx.service.profiler.createItem('couchbase', { operation: 'remove' });
      const couchbaseKey = this.getKey(key, prefix);
      bucket.remove(couchbaseKey, (err, result) => {
        if (item.last() > 100) {
          item.addTag('timeout', 'timeout');
        }

        ctx.service.profiler.addItem(item);
        if (err && err.code !== couchbase.errors.keyNotFound) {
          ctx.logError({ module: 'couchbase', detail: { operation: 'remove', key } }, err);
          // reject(err);
          // return;
        }

        resolve();
      });
    });
  }

  async counter(key: string, value = 1, options?: CacheOptions & { initial?: number; expires?: number }): Promise<number> {
    const ctx = this.ctx;

    const { bucket, prefix } = await this.connect(options && options.repository);

    return await new Promise<number>((resolve, reject) => {
      const item = ctx.service.profiler.createItem('couchbase', { operation: 'counter' });
      const couchbaseKey = this.getKey(key, prefix);
      bucket.counter(couchbaseKey, value, { initial: options && options.initial || 1, expiry: options && options.expires || 3600 }, (err, result) => {

        if (item.last() > 100) {
          item.addTag('timeout', 'timeout');
        }

        ctx.service.profiler.addItem(item);
        if (err) {
          ctx.logError({ module: 'couchbase', detail: { operation: 'counter', key, value } }, err);
          // reject(err);
          // return;
        }

        resolve(result && result.value || 0);
      });
    });
  }

  async flushAll(options?: CacheOptions): Promise<number> {
    const ctx = this.ctx;

    ctx.logError({ level: ctx.app.deployment.isProduction() ? 'CRIT' : 'NOTICE', msg: 'couchbase flushed!' });

    const { bucket } = await this.connect(options && options.repository);

    return await new Promise<number>((resolve, reject) => {
      bucket.manager().flush((err, status) => {
        if (err || !status) {
          ctx.logError({ module: 'couchbase', msg: 'flush failed', detail: { operation: 'flush' } }, err);

          reject(err);
          return;
        }

        resolve(status);
      });
    });
  }
}

function getRepository(ctx: Context) {
  return new CouchbaseRepository(ctx);
}

export default class Couchbase extends BaseCacheService {
  constructor(ctx: Context) {
    super(ctx, getRepository(ctx));
  }

  async increment(key: string, value = 1, options?: { initial?: number; expires?: number }): Promise<number> {
    return await (this.cacheRepository as CouchbaseRepository).counter(key, value, options);
  }

  async decrement(key: string, value = 1, options?: { initial?: number; expires?: number }): Promise<number> {
    return await (this.cacheRepository as CouchbaseRepository).counter(key, -value, options);
  }

  async flush(options?: CacheOptions) {
    return await (this.cacheRepository as CouchbaseRepository).flushAll(options);
  }
}
