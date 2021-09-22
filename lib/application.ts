import { Context, Application as EggApplication } from 'egg';
import * as path from 'path';
// const os = require('os');
const dns = require('dns');

const debug = require('debug');

import * as rhea from 'rhea-cli';
import chalk from 'chalk';

// import { Stage } from '../app/lib/deployment';

import AppWorkerLoader from './loader';
import { wrapLogger } from './logger';

import { Bootstrap } from '../app/lib/bootstrap';
import * as _ from 'lodash';
import { LOG_DATA } from '../app/lib/rpc/http/logFilters';
import Deployment, { Stage } from '../app/lib/deployment';
import { RequestOptions, HttpClientResponse } from 'urllib';

const EGG_PATH = Symbol.for('egg#eggPath');
const EGG_LOADER = Symbol.for('egg#loader');
const LOGGERS = Symbol('EggApplication#loggers');
const BOOTSTRAP = Symbol('gaia@bootstrap');

const DOWNGRADE = Symbol.for('gaia@downgrade');
const DEPLOYMENT = Symbol.for('gaia@deployment');

// const hostname = os.hostname();

if (!('toJSON' in Error.prototype)) {
  // eslint-disable-next-line no-extend-native
  Object.defineProperty(Error.prototype, 'toJSON', {
    // eslint-disable-next-line object-shorthand
    value: function() {
      const alt: { [ key: string ]: any } = {};

      Object.getOwnPropertyNames(this)
        .forEach(key => {
          alt[ key ] = this[key];
        });

      return alt;
    },
    configurable: true,
    writable: true,
  });
}

export default class GaiaApplication extends EggApplication {
  // _kafkaLogger: any;
  constructor(options = {}) {
    super(options);

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const app = this;

    let updateTimer;
    this.beforeStart(() => {
      if (!app.deployment.isProduction() && (app.config.debugger || app.config.env === 'local')) {
        if (typeof app.config.debugger === undefined || app.config.debugger) {
          debug.enable(app.config.debugger || 'gaia:*');
        }
      }

      if (app.config.rhea) {
        rhea.init(app.config.rhea.server, app.config.rhea.port, app.config.rhea.name || app.name);
      } else {
        console.error(chalk.bgYellow(chalk.black('rhea config not found')));
      }

      app.coreLogger.debug('gaia loaded');

      app.initHttpClient();

      if (app.redis) {
        app.configSession();
      } else {
        console.warn(chalk.bgYellow(chalk.black('session module is not enabled while redis is not available')));
      }

      updateTimer = setInterval(() => {
        rhea.submit('conn', {}, app.connectionCount);
        // eslint-disable-next-line no-bitwise
        rhea.submit('mem', {}, process.memoryUsage().heapUsed >> 20);
      }, 1000);
      updateTimer.unref();
    });

    this.beforeClose(async () => {
      await rhea.shutdown();
      clearInterval(updateTimer);
    });

    this.ready(async () => {
      this.config.kafka?.consumer && this.config.kafka?.consumerEnabled && setTimeout(() => {
        this.startKafkaConsumer().catch(err => {
          this.logger.error({ level: 'CRIT', msg: 'fail to start kafka consumer', err });
        });
      }, 3000);
    });
  }

  dumpTiming() {

  }

  get [EGG_PATH]() {
    // 返回 framework 路径
    return path.dirname(__dirname);
  }

  // 覆盖 Egg 的 Loader，启动时使用这个 Loader
  get [EGG_LOADER]() {
    return AppWorkerLoader;
  }

  assert(value: boolean|any, message?: string) {
    if (!value) {
      const error = new Error(`assertion failed: ${message || ''}`);
      this.logger.error({ type: 'assert', level: 'CRIT', msg: 'assertion failed: ' + message, detail: { error } }, error);
      if (!this.deployment.isProduction()) {
        throw error;
        // assert(value, message);
      }
    }
  }

  isProd(): boolean {
    return this.deployment.stage === Stage.Prod;
  }

  get deployment(): Deployment {
    if (!this[DEPLOYMENT]) {
      this[DEPLOYMENT] = new Deployment(this as any);
    }

    return this[DEPLOYMENT];
  }

  get bootstrap() {
    if (!this[BOOTSTRAP]) {
      this[BOOTSTRAP] = Bootstrap.initialize(this);
    }

    return this[BOOTSTRAP];
  }

  get downGrader() {
    if (!this[ DOWNGRADE ]) {
      const DownGrader = require('../app/lib/downgrader').default;
      this[ DOWNGRADE ] = new DownGrader(this);
    }

    return this[ DOWNGRADE ];
  }

  get loggers() {
    if (!this[ LOGGERS ]) {
      const loggers = super.loggers;

      loggers.forEach((logger, name) => wrapLogger(logger, name, this as any));
      this[ LOGGERS ] = loggers;
    }
    return this[ LOGGERS ];
  }

  handleRequest(ctx: Context, ...params: any[]) {
    // @ts-ignore
    const ret = super.handleRequest(ctx, ...params);

    if (ret instanceof Promise) {
      if (ret.finally) {
        ret.finally(() => {
          this.cleanContext(ctx);
        });
      }
    } else {
      this.cleanContext(ctx);
    }

    return ret;
  }

  // tslint:disable-next-line: max-func-body-length
  initHttpClient() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const app = this;

    app.httpclient.on('request', (req: any) => {
      if (!req.args.profileItem) {
        const url: string = req.url.replace(/(https?:\/\/)([^\/]+)/i, req.args.headers && req.args.headers.host && ('$1' + req.args.headers.host) || '$1$2').replace(/(\?.*)$/, '');
        const item = req.ctx.service.profiler.createItem('http', {
          url,
        });

        req.args.profileItem = item;
      }

      req.args.profileItem.resetStart();

      if (this.deployment.isProduction()) {
        req.args.lookup = (hostname: string, options: any, callback: any) => {
          return dns.lookup(
            hostname,
            {...(options || {}),
            family: 4},
            callback
          );
        };
      }

      req.args.timing = true;
      req.args.timeout || (req.args.timeout = [ 3000, 5000 ]);

      if (req.ctx) {
        req.args.headers = {
          'X-Client-App': req.ctx.app.name,
          'X-Request-Id': req.ctx.guid,
          ...(req.args.headers || {})
        };
      }
    });

    // tslint:disable-next-line: cyclomatic-complexity
    app.httpclient.on('response', (result: {
      ctx: Context;
      req: {
        url: string;
        args: RequestOptions & {
          profileItem?: rhea.Item;
          profileDesc?: any;
          profileSlow?: number;
          logFilter?: ((log: any) => void)[];
        };
      };
      res?: HttpClientResponse<any> & { timing: number };
    }) => {
      const item = result.req.args.profileItem;

      if (item) {
        const profileSlow = result.req.args.profileSlow || 300;

        const logFilter = (log: LOG_DATA) => {
          if (result.req.args.logFilter) {
            result.req.args.logFilter.forEach(filter => filter(log));
          }

          return log;
        };

        const req =  {
          method: result.req.args.method,
          data: result.req.args.data && (result.req.args.data instanceof Buffer ? (result.req.args.data as Buffer).toString() : (typeof result.req.args.data === 'object' ? JSON.stringify(result.req.args.data) : result.req.args.data)),
          headers: result.req.args.headers,
        };

        if (item.last() > profileSlow) {
          item.addTag('timeout', 'timeout');
        }

        if (result.ctx) {
          result.ctx.service.profiler.addItem(item);
        } else {
          rhea.addItem(item);
        }

        if (result.res) {
          result.ctx &&
            item.last() > profileSlow &&
            // eslint-disable-next-line no-bitwise
            result.ctx.logger[item.last() > profileSlow << 1 ? 'error' : 'warn']({
              type: `slowreq_${item.name}`,
              msg: `slow request spent ${item.last()} ms`,
              detail: logFilter({
                url: result.req.url,
                // data: result.req.args.data,
                ...(result.req.args.profileDesc || {}),
                req,
                spent: item.last(),
                timing: result.res.timing,
                headers: result.res.headers,
              }),
            });

          if (result.res.status !== 200 && result.ctx) {
            result.ctx.service.profiler.addItem('error', { type: item.name });

            result.ctx.logError({
              type: item.name,
              msg: result.res.status === -1 || result.res.status === -2 ? 'response timeout' : `possible invalid http response (${result.res.status})`,
              detail: logFilter({
                ...(result.req.args.profileDesc || {}),
                req,
                res: { ...(result.res), data: undefined },
                data: result.res && _.cloneDeep(result.res.data),
              }),
            });
          }
        } else {
          if (result.ctx) {
            result.ctx.service.profiler.addItem('error', { type: item.name });

            result.ctx.logCritical({
              type: item.name,
              msg: 'no response',
              detail: logFilter({
                req,
                ...(result.req.args.profileDesc || {}),
              }),
            });
          }
        }
      }
    });
  }

  configSession() {
    const name = this.config.sessionRedis?.name || this.config.session?.redis;
    this.assert(this.redis.get(name || 'default') ?? (!name && ((this.config.redis.clients && this.redis.get(Object.keys(this.config.redis.clients)[ 0 ])) || this.redis)) , `redis instance [${name}] not exists`);

    const ONE_DAY = 1000 * 60 * 60 * 24;

    this.sessionStore = {
      get: async (key: string, maxAge: number, options: { ctx: Context }) => {
        const result = await options.ctx.service.redis.connectionOf(name).get(key);
        return result && JSON.parse(result);
      },
      set: async (key: string, value: any, maxAge: number, options: { ctx: Context }) => {
        await options.ctx.service.redis.connectionOf(name).set(key, JSON.stringify(value), 'PX', typeof maxAge === 'number' ? maxAge : ONE_DAY );
      },
      destroy: async (key: string, options: { ctx: Context }) => {
        await options.ctx.service.redis.connectionOf(name).del(key);
      },
    };

  }
}
