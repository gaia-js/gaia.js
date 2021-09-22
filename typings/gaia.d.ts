import * as Memcached from 'memcached';
import { Bucket } from 'couchbase';
import { Redis } from 'ioredis';
import * as OSS from 'ali-oss';
// import 'egg-passport';
import { RequestOptions } from '../app/extend/context';
import RheaItem, { Item } from 'rhea-cli/lib/item';

import Deployment from '../app/lib/deployment';

import './app/object/index';
import './app/object/admin/index';
import AdminUser from '../app/object/admin/user';

import './app/service/index';
import './app/service/admin/index';

import './gaia-config';

import GaiaRedisService from '../app/service/redis';

import './app/extend/request';
import ExtendApplication from '../app/extend/application';
import ExtendContext from '../app/extend/context';
import LazyLoadObject from '../app/object/LazyLoadObject';
import CircuitBreaker from '../app/lib/circuit_breaker';
import GaiaApplication from '../lib/application';
import DownGrader from '../app/lib/downgrader';

type ExtendApplicationType = typeof ExtendApplication;
type ExtendContextType = typeof ExtendContext;

interface OSSClient {
  processObjectSave(sourceObject: string, targetObject: string, processStr: string): Promise<{ res: OSS.NormalSuccessResponse }>;
}

declare module 'egg' {
  interface IGaiaApplication extends ExtendApplicationType {
    deployment: Deployment;

    assert(value: any, msg?: string | undefined);

    memcached?: Memcached;
    couchbase?: { [ name: string ]: Bucket };
    redis: Redis & Singleton<Redis> & { clients: Map<string, Redis & Singleton<Redis>> };

    ossBucket: { [name: string]: OSS & OSSClient };

    circuitBreaker: CircuitBreaker;

    downGrader: DownGrader;

    sessionStore: {
      async get(key: string, maxAge: number, options?: { ctx: Context }): Promise<any>;
      async set(key: string, value: any, maxAge?: number, options?: { ctx: Context }): Promise<void>;
      async destroy(key: string, options?: { ctx: Context }): Promise<void>;
    };
  }

  interface Context extends ExtendContextType, Egg.Context {
    assert(value: any, msg?: string | undefined);

    session: any;
  }
}
