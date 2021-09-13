'use strict';

import { Application } from 'egg';
import * as Redis from "ioredis";
import { sleep } from './utils';

const awaitFirst = require('await-first');

interface RedisClientOptions {
  noCluster: boolean
}

export function createClient(app: Application, redisName?: string | (string | null)[], options?: RedisClientOptions): Redis.Redis | Redis.Cluster {
  let config: any;

  if (app.config.redis && app.config.redis.client) {
    config = app.config.redis.client;
  } else if (app.config.redis && app.config.redis.clients) {
    if (typeof redisName === 'string') {
      config = app.config.redis.clients[ redisName ];
    } else if (Array.isArray(redisName)) {
      (redisName as string[]).some(name => {
        if (!app.config.redis.clients) {
          return false;
        }

        if (!name) {
          config = app.config.redis.clients[ 'default' ] || app.config.redis.clients[ Object.keys(app.config.redis.clients)[ 0 ] ];
          return config;
        } else if (app.config.redis.clients[ name ]) {
          config = app.config.redis.clients[ name ];
          return true;
        }

        return false;
      });
    } else if (!redisName) {
      config = app.config.redis.clients[ 'default' ] || app.config.redis.clients[ Object.keys(app.config.redis.clients)[ 0 ] ];
    }
  }

  app.assert(config, 'cannot get config for redis of ' + (Array.isArray(redisName) || !redisName ? JSON.stringify(redisName) : redisName));

  if (options && options.noCluster && config && config.cluster && config.nodes && config.nodes.length > 0) {
    config = Object.assign({ keyPrefix: config.keyPrefix }, config.nodes[ 0 ]);
  }

  let client: Redis.Redis | Redis.Cluster;

  if (config.cluster === true) {
    app.assert(config.nodes && config.nodes.length !== 0, '[egg-redis] cluster nodes configuration is required when use cluster redis');

    config.nodes.forEach(client => {
      app.assert(client.host && client.port && client.password !== undefined && client.db !== undefined,
        `[egg-redis] 'host: ${client.host}', 'port: ${client.port}', 'password: ${client.password}', 'db: ${client.db}' are required on config`);
    });
    app.coreLogger.info('[egg-redis] cluster connecting');
    client = new Redis.Cluster(config.nodes, config);
  } else if (config.sentinels) {
    app.assert(config.sentinels && config.sentinels.length !== 0, '[egg-redis] sentinels configuration is required when use redis sentinel');

    config.sentinels.forEach(sentinel => {
      app.assert(sentinel.host && sentinel.port,
        `[egg-redis] 'host: ${sentinel.host}', 'port: ${sentinel.port}' are required on config`);
    });

    app.assert(config.name && config.password !== undefined && config.db !== undefined,
      `[egg-redis] 'name of master: ${config.name}', 'password: ${config.password}', 'db: ${config.db}' are required on config`);

    app.coreLogger.info('[egg-redis] sentinel connecting start');
    client = new Redis(config);
  } else {
    app.assert(config.host && config.port && config.password !== undefined && config.db !== undefined,
      `[egg-redis] 'host: ${config.host}', 'port: ${config.port}', 'password: ${config.password}', 'db: ${config.db}' are required on config`);
    app.coreLogger.info('[egg-redis] server connecting redis://:***@%s:%s/%s',
      config.host, config.port, config.db);
    client = new Redis(config);
  }

  client.on('connect', () => {
    app.coreLogger.info('[egg-redis] client connect success');
  });
  client.on('error', err => {
    app.coreLogger.error('[egg-redis] client error: %s', err);
    app.coreLogger.error(err);
  });

  return client;
}

export async function waitForReady(client: Redis.Redis | Redis.Cluster) {
  await Promise.all([
    sleep(5000),
    awaitFirst(client, [ 'ready', 'error' ]),
  ]);
}
