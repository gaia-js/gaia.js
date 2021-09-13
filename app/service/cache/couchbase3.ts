// import 'couchbase';
// const couchbase = require('couchbase');
// import { CacheRepository, CacheSetOptions, BaseCacheService, CacheOptions } from '../../lib/BaseCacheService';
// import { Context, Application } from 'egg';
// import * as rhea from 'rhea-cli';
// import * as md5 from 'md5';
// import { unserialize, serialize } from '../../lib/serialize';
// import { CouchbaseConfig } from '../../../typings/gaia-config';

// const COUCHBASE = Symbol('gaia@couchbase');

// async function getConnection(app: Application, config: CouchbaseConfig, name: string) {
//   if (!app[COUCHBASE]) {
//     app[COUCHBASE] = {};
//   }

//   let connection: {
//     cluster: Cluster;
//     bucket: Bucket;
//     collection: Collection;
//   } = app[COUCHBASE][name];

//   if (!connection) {
//     const start = Date.now();

//     try {
//       const timeout = (config && config.operationTimeout) || 2000;
//       const cluster: Cluster = await couchbase.connect(config.url,
//         {
//           username: config.username,
//           password: config.password,
//           bucketName: config.bucket,
//           kvTimeout: timeout,
//           kvDurableTimeout: timeout,
//         });

//       const bucket = cluster.bucket(config.bucket);

//       const collection = bucket.defaultCollection();

//       app[COUCHBASE][name!] = connection = {
//         cluster,
//         bucket,
//         collection,
//       };

//       console.info('Couchbase bucket: ' + bucket.name + ': connected');

//       // app.beforeClose(async () => {
//       //   cluster.close();
//       // });
//     } catch (err) {
//       app.logger.error({ level: 'CRIT', module: 'couchbase', msg: 'failed to connect to couchbase', detail: { operation: 'connect' } }, err);
//     } finally {
//       const tags: { [key: string]: string } = { operation: 'connect' };
//       const duration = Date.now() - start;
//       if (duration > 200) {
//         tags.timeout = 'timeout';
//       }

//       rhea.submit('couchbase', tags, 1, duration);
//     }
//   }

//   return connection;
// }

// const bucketCache: {
//   [ name: string ]: {
//     name: string;
//     config: any;
//   };
// } = {

// };

// class CouchbaseRepository implements CacheRepository {
//   private ctx: Context;
//   // private name: string;
//   // private config: CouchbaseConfig;
//   // private bucket: couchbase.Bucket;

//   constructor(ctx: Context) {
//     Object.defineProperty(this, 'ctx', {
//       enumerable: false,
//       value: ctx,
//     });
//   }

//   private getConfig(names?: string | string[]) {
//     const app = this.ctx.app;

//     let name = 'default';

//     if (names && Array.isArray(names) && names.length > 0) {
//       if ((app.config.couchbase as any).clusters) {
//         for (const item of names) {
//           if ((app.config.couchbase as any).clusters[item]) {
//             name = item;
//             break;
//           }
//         }
//       }
//     } else {
//       name = names as string;
//     }

//     if (bucketCache) {
//       if (!name) {
//         if (Object.keys(bucketCache).length > 0) {
//           return bucketCache[Object.keys(bucketCache)[0]];
//         }
//       } else if (bucketCache[name]) {
//         return bucketCache[name];
//       }
//     }

//     let config: CouchbaseConfig | undefined;
//     if (!name && (app.config.couchbase as any).url) {
//       config = app.config.couchbase as unknown as CouchbaseConfig;
//     } else if ((app.config.couchbase as any).clusters) {
//       if (!name) {
//         if ((app.config.couchbase as any).clusters.default) {
//           name = 'default';
//         } else if (Object.keys((app.config.couchbase as any).clusters).length > 0) {
//           name = ((app.config.couchbase as any).clusters)[Object.keys((app.config.couchbase as any).clusters)[0]];
//         } else {
//           this.ctx.assert(false, '系统错误，配置未定义');
//         }
//       }

//       config = ((app.config.couchbase as any).clusters)[name!];
//     }

//     if (!config) {
//       this.ctx.assert(config, 'cannot get config of couchbase:' + (name || 'default'));
//     }

//     const res = bucketCache[ name ] = {
//       name,
//       config,
//     };

//     return res;
//   }

//   private async connect(cluster?: string | string[]) {
//     const { name, config } = this.getConfig(cluster);
//     const connection = await getConnection(this.ctx.app, config, name);

//     return { ...connection, prefix: config.prefix, config };
//   }

//   private getKey(key: string, prefix?: string): string {
//     return (prefix || '') + (key.length > 48 ? md5(key) : key)
//   }

//   async get(key: string, options?: CacheOptions): Promise<any> {
//     const ctx = this.ctx;

//     const item = ctx.service.profiler.createItem('couchbase', { operation: 'get' });

//     try {
//       const { collection, prefix, config } = await this.connect(options && options.repository);

//       const couchbaseKey = this.getKey(key, prefix);

//       const result = await collection.get(couchbaseKey, { timeout: (config && config.operationTimeout) || 2000 });

//       return await unserialize(result.content);
//     } catch (err) {
//       if (err instanceof couchbase.TimeoutError) {
//         ctx.logNotice({ type: 'slowreq_couchbase', module: 'couchbase', msg: 'couchbase get timeout ' + item.last() + 'ms', detail: { operation: 'get', key } }, err as any);
//       } else if (!(err instanceof couchbase.DocumentNotFoundError)) {
//         ctx.logError({ type: 'couchbase_error', module: 'couchbase', msg: 'failed to get', detail: { operation: 'get', key } }, err);
//       }

//       return undefined;
//     } finally {
//       if (item.last() > 100) {
//         item.addTag('timeout', 'timeout');
//       }

//       ctx.service.profiler.addItem(item);
//     }
//   }

//   async set(key: string, value: any, options: CacheSetOptions = {}): Promise<void> {
//     const ctx = this.ctx;

//     const item = ctx.service.profiler.createItem('couchbase', { operation: 'upsert' });

//     try {
//       const { collection, prefix, config } = await this.connect(options && options.repository);

//       let expiry = options && options.expires;
//       if (expiry) {
//         if (expiry >= 60 * 60 * 24 * 30 && expiry <= Date.now() / 1000) {
//           // ctx.logger.warn({ msg: 'unexpected expiry for couchbase upsert', detail: { key, expiry } });
//           expiry = Date.now() / 1000 + expiry;
//         }
//       } else {
//         expiry = 3600;
//       }

//       const serializedValue = await serialize(value, { type: options.serializeType });

//       const couchbaseKey = this.getKey((options && options.prefix || '') + key, prefix);

//       // @ts-ignore
//       await collection.upsert(couchbaseKey, serializedValue, { expiry, timeout: (config && config.operationTimeout) || 2000 });

//       // await collection.touch(couchbaseKey, expiry);
//     } catch (err) {
//       if (err instanceof couchbase.TimeoutError) {
//         ctx.logNotice({ type: 'slowreq_couchbase', module: 'couchbase', msg: 'couchbase upset timeout ' + item.last() + 'ms', detail: { operation: 'upsert', key } }, err as any);
//       } else {
//         ctx.logError({ type: 'couchbase_error', module: 'couchbase', msg: 'failed to upsert', detail: { operation: 'set', key, value } }, err);
//       }
//     } finally {
//       if (item.last() > 100) {
//         item.addTag('timeout', 'timeout');
//       }

//       ctx.service.profiler.addItem(item);
//     }
//   }

//   async remove(key: string, options?: CacheOptions): Promise<void> {
//     const ctx = this.ctx;

//     const item = ctx.service.profiler.createItem('couchbase', { operation: 'remove' });

//     try {
//       const { collection, prefix, config } = await this.connect(options && options.repository);

//       const couchbaseKey = this.getKey(key, prefix);

//       await collection.remove(couchbaseKey, { timeout: (config && config.operationTimeout) || 2000 });
//     } catch (err) {
//       if (!(err instanceof couchbase.DocumentNotFoundError)) {
//         if (err instanceof couchbase.TimeoutError) {
//           ctx.logNotice({ type: 'slowreq_couchbase', module: 'couchbase', msg: 'couchbase remove timeout ' + item.last() + 'ms', detail: { operation: 'remove', key } }, err as any);
//         } else {
//           ctx.logError({ type: 'couchbase_error', module: 'couchbase', msg: 'failed to remove', detail: { operation: 'remove', key } }, err);
//         }
//       }
//     } finally {
//       if (item.last() > 100) {
//         item.addTag('timeout', 'timeout');
//       }

//       ctx.service.profiler.addItem(item);
//     }
//   }

//   async counter(type: 'increment' | 'decrement', key: string, value = 1, options?: CacheOptions & { initial?: number; expires?: number }): Promise<number> {
//     const ctx = this.ctx;

//     const item = ctx.service.profiler.createItem('couchbase', { operation: type });

//     try {
//       const { collection, prefix, config } = await this.connect(options && options.repository);

//       let expiry = options && options.expires;
//       if (expiry) {
//         if (expiry >= 60 * 60 * 24 * 30 && expiry <= Date.now() / 1000) {
//           // ctx.logger.warn({ msg: 'unexpected expiry for couchbase upsert', detail: { key, expiry } });
//           expiry = Date.now() / 1000 + expiry;
//         }
//       } else {
//         expiry = 3600;
//       }

//       const couchbaseKey = this.getKey(key, prefix);

//       const initial = options && options.initial || 1;

//       // @ts-ignore
//       const res = await collection.binary()[type](couchbaseKey, value, { initial, timeout: (config && config.operationTimeout) || 2000 });

//       // await collection.touch(couchbaseKey, expiry);

//       return res.value || 0;
//     } catch (err) {
//       if (err instanceof couchbase.TimeoutError) {
//         ctx.logNotice({ type: 'slowreq_couchbase', module: 'couchbase', msg: 'couchbase counter timeout ' + item.last() + 'ms', detail: { operation: 'counter', key } }, err as any);
//       } else {
//         ctx.logError({ type: 'couchbase_error', module: 'couchbase', msg: 'failed to ' + type, detail: { operation: 'counter', key, value } }, err);
//       }

//       return 0;
//     } finally {
//       if (item.last() > 100) {
//         item.addTag('timeout', 'timeout');
//       }

//       ctx.service.profiler.addItem(item);
//     }
//   }

//   async flushAll(options?: CacheOptions): Promise<void> {
//     const ctx = this.ctx;

//     ctx.logError({ level: ctx.app.deployment.isProduction() ? 'CRIT' : 'NOTICE', msg: 'couchbase flushed!' });

//     const item = ctx.service.profiler.createItem('couchbase', { operation: 'flush' });

//     try {
//       const { cluster, bucket, config } = await this.connect(options && options.repository);

//       await cluster.buckets().flushBucket(bucket.name, { timeout: (config && config.operationTimeout) || 2000 });
//     } catch (err) {
//       if (err instanceof couchbase.TimeoutError) {
//         ctx.logNotice({ type: 'slowreq_couchbase', module: 'couchbase', msg: 'couchbase flush timeout ' + item.last() + 'ms', detail: { operation: 'flush' } }, err as any);
//       } else {
//         ctx.logError({ type: 'couchbase_error', module: 'couchbase', msg: 'failed to flush', detail: { operation: 'flush' } }, err);
//       }
//     } finally {
//       if (item.last() > 100) {
//         item.addTag('timeout', 'timeout');
//       }

//       ctx.service.profiler.addItem(item);
//     }
//   }
// }

// function getRepository(ctx: Context) {
//   return new CouchbaseRepository(ctx);
// }

// export default class Couchbase extends BaseCacheService {
//   constructor(ctx: Context) {
//     super(ctx, getRepository(ctx));
//   }

//   async increment(key: string, value = 1, options?: CacheOptions & { initial?: number; expires?: number }): Promise<number> {
//     return await (this.cacheRepository as CouchbaseRepository).counter('increment', key, value, options);
//   }

//   async decrement(key: string, value = 1, options?: CacheOptions & { initial?: number; expires?: number }): Promise<number> {
//     return await (this.cacheRepository as CouchbaseRepository).counter('decrement', key, value, options);
//   }

//   async flushAll(options?: CacheOptions) {
//     return await (this.cacheRepository as CouchbaseRepository).flushAll(options);
//   }
// }
