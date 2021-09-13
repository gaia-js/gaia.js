import { Application, Context } from 'egg';
import * as grpc from '@grpc/grpc-js';
import GaiaResponse from '../../response';
import { BusinessError } from '../../../errors';
import { timeoutable } from '../../utils';
import { LOG_DATA as CTX_LOG_DATA } from '../../../extend/context';
import * as _ from 'lodash';
import { promisify } from 'util';
import grpcProto from './proto';

const composer = require('koa-compose');

let _instance: GrpcProvider;

export class GrpcError extends Error {

}

export type GrpcRouter = (ctx: Context) => Promise<void>;

export type GrpcMiddlewareFunction = (ctx: Context, next?: (ctx: Context) => Promise<void>) => Promise<void>;

export interface LOG_DATA extends CTX_LOG_DATA {
  detail?: {
    req?: any;//grpc.Request;
  };
}

export type LogFilter = (log: LOG_DATA) => void;

export interface MethodOptions {
  timeout?: number;
  logFilters?: LogFilter[];
  middlewares?: GrpcMiddlewareFunction[];
}

function logFilterInstaller(options?: MethodOptions)  {
  return async (ctx: Context, next) => {
    ctx.installLogFilter(log => {
      if (log.request) {
        log.request.service = ctx.grpcRequest.service;
        log.request.method = ctx.grpcRequest.method;
        log.request.params = ctx.grpcRequest.params;
      }
    });

    if (options?.logFilters) {
      options.logFilters.forEach(item => ctx.installLogFilter(item));
    }

    await next();
  };
}

function accessLogMiddleware(req) {
  return async (ctx: Context, next: (ctx: Context) => Promise<void>) => {
    if (!ctx.app.config.disableAccessLog) {
      ctx.logInfo({ type: 'grpc_provider-access', detail: { req } });
    }

    try {
      await next(ctx);
    } finally {
      ctx.logInfo({
        level: ctx.body && typeof ctx.body === 'object' && typeof ctx.body.code !== 'undefined' && ctx.body.code !== 0 ? 'WARN' : 'INFO',
        type: 'grpc_provider-response',
        msg: typeof ctx.body === 'object' ? ctx.body.msg : '',
        profile: ctx.service.profiler.dump('medium'),
        detail: {
          req,
          body: ((typeof ctx.body === 'object' ? JSON.stringify(ctx.body && ctx.body.data ? ctx.body.data : ctx.body) : ctx.body && ctx.body.toString()) || '').substr(0, 200)
        },
      });
    }
  };
}

function errorLogMiddleware() {
  return async (ctx: Context, next: (ctx: Context) => Promise<void>) => {
    try {
      await next(ctx);
    } catch (err) {
      if (err instanceof BusinessError) {
        ctx.logError({ level: 'NOTICE', type: 'grpc_provider-error', msg: err.message, }, err);

        ctx.body = await ctx.service.error.dumpError(err);
      // } else if (err instanceof GrpcError) {
      //   throw err;
      } else {
        ctx.logError({ level: 'CRIT', type: 'grpc_provider-crash', err, msg: err instanceof Error && err.message || 'unknown error' });

        // throw new GrpcError(ErrorCode.SERVER_EXECUTION_ERROR, error instanceof Error && err.stack || '', err);
      }

      throw err;
    }
  }
}

function profileMiddleware(req) {
  return async (ctx: Context, next: (ctx: Context) => Promise<void>) => {
    const profileItem = ctx.service.profiler.createItem('grpc_provider', { service: req.service, method: req.method });

    try {
      await next(ctx);
    } catch (err) {
      profileItem.addTag('error', 'error');
      throw err;
    } finally {
      if (profileItem.end() > 1000) {
        profileItem.addTag('timeout', 'timeout');

        ctx.logWarn({ type: 'slowreq_grpc_provider', msg: `spent ${profileItem.last()}ms`, profile: ctx.service.profiler.dump('medium'), detail: { spent: profileItem.duration } });
      }

      ctx.service.profiler.addItem(profileItem);

      // tslint:disable-next-line: no-floating-promises
      ctx.service.profiler.submit();
    }
  }
}
export class GrpcProvider {
  _app: Application
  _grpcServer: grpc.Server;

  _registeredRouter: {
    [ key: string ]: {
      packageName: string;
      service: string;
      fn: GrpcMiddlewareFunction[];
      middlewares: { [ method: string ]: GrpcMiddlewareFunction[] };
    };
  };

  constructor(app?: Application) {
    app && (this.app = app);

    this._registeredRouter = {};
  }

  static get instance(): GrpcProvider {
    if (!_instance) {
      _instance = new GrpcProvider();
    }

    return _instance;
  }

  get app() {
    return this._app;
  }

  set app(app: Application) {
    if (!this._app) {
      this._app = app;

      if (app) {
        app.beforeStart(async () => {
          try {
            if (!app.config.grpc?.disableServer && !((app as any).options && (app as any).options.disableGrpcServer)) {
              await this.start();
            }
          } catch (err) {
            if (!app.deployment.testing()) {
              throw err;
            } else {
              app.logger.error({ msg: 'cannot start grpc server' }, err);
            }
          }
        });

      // app.beforeClose(async () => {
      //   await this.close();
      // });
      }
    }
  }

  use(fn: GrpcMiddlewareFunction, packageName: string, service: string, method?: string) {
    const key = `${packageName}:${service}`;
    if (!this._registeredRouter[key]) {
      this._registeredRouter[ key ] = {
        packageName,
        service,
        middlewares: {},
        fn: [],
      };
    }

    if (method) {
      if (!this._registeredRouter[key].middlewares[method]) {
        this._registeredRouter[key].middlewares[method] = [ fn ];
      } else {
        this._registeredRouter[key].middlewares[method].push(fn);
      }
    } else {
      this._registeredRouter[key].fn.push(fn);
    }
  }

  get grpcServer() {
    if (!this._grpcServer) {
      this._grpcServer = new grpc.Server();
    }

    return this._grpcServer;
  }

  buildImplement(fn: (ctx: Context) => Promise<void>, packageName: string, service: string, method: string): grpc.UntypedHandleCall {
    return async (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
      // tslint:disable-next-line: prefer-type-cast
      const req = call.request;

      const ctx = this.app.createAnonymousContext({
        headers: {
          host: '',
          accept: 'application/json',
          'x-real-ip': call.getPeer(),
          'x-request-id': call.metadata.get('requestId'),
          // 'x-grpc-params': JSON.stringify(req.params),
        },
        ip: call.getPeer(),
        origin: '',
        protocol: 'grpc',
        method: 'POST',
        host: '',
        hostname: '',
        url: `${packageName}.${service}/${method}`,
        body: req,
      } as any);

      Object.defineProperty(req, 'ctx', {
        enumerable: false,
        writable: false,
        configurable: false,
        value: ctx,
      });

      Object.defineProperty(ctx, 'grpcRequest', {
        enumerable: false,
        writable: false,
        configurable: false,
        value: req,
      });

      ctx.status = 404;

      try {
        await fn(ctx);
        // const response = ctx.body && ctx.body instanceof GrpcResponse ? ctx.body : new GrpcResponse(ctx.body, ctx);
        callback(null, ctx.body);
      } catch (err) {
        callback(Object.assign(err instanceof Error ? err : new Error(`${err}`), {
          code: 13, // grpc.Status.INTERNAL,
          details: err instanceof Error && err.toString() || `${err}`,
        }));
      }
    }
  }

  async start() {
    if (!this._registeredRouter) {
      return;
    }

    for (const item of Object.values(this._registeredRouter)) {
      if (!grpcProto.hasService(item.packageName, item.service)) {
        continue;
      }

      const implementation: grpc.UntypedServiceImplementation = {};

      for (const method of Object.keys(item.middlewares)) {
        implementation[method] = this.buildImplement(composer([ ...item.fn, ...(item.middlewares[method]) ]), item.packageName, item.service, method);
      }

      this.grpcServer.addService(grpcProto.getService(item.packageName, item.service), implementation);
    }

    const listen = `${this.app.config.grpc?.address || '0.0.0.0'}:${this.app.config.grpc?.port || 50051}`;
    await promisify(this.grpcServer.bindAsync.bind(this.grpcServer))(listen, grpc.ServerCredentials.createInsecure());

    this.grpcServer.start();

    this.app.logger.info({ level: 'INFO', type: 'grpc', msg: `grpc provider started on ${listen}` });
  }

  async close() {
    try {
      await promisify(this.grpcServer.tryShutdown.bind(this.grpcServer))();
    } catch (err) {
      this.app.logger.info({ level: 'INFO', type: 'grpc', err, msg: `trying close grpc provider failed` });

      this.grpcServer.forceShutdown();
    }
  }

  expose(packageName: string, service: string) {
    const provider = this;

    // tslint:disable-next-line: no-function-expression
    return function classDecorator<T extends { new(...args: any[]): {} }>(constructor: T) {
      const exposedMethods = (constructor as any).exposedMethods;
      if (exposedMethods) {
        for (const method of Object.keys(exposedMethods)) {
          provider.use(async (ctx: Context) => {
            const controller = new constructor(ctx);

            // 取到最原始的参数并复制，防止被中间件意外修改
            const request = _.cloneDeep(ctx.grpcRequest);
            const desc: { func: string; options?: MethodOptions } = exposedMethods[ method ];

            let resp: GaiaResponse | any = undefined;

            await timeoutable(composer([
              logFilterInstaller(desc.options),
              accessLogMiddleware(_.cloneDeep(ctx.grpcRequest)),
              errorLogMiddleware(),
              profileMiddleware(ctx.grpcRequest),
              ...(desc.options?.middlewares || []),
              async () => {
                resp = await controller[ desc.func ](request);
            } ]), desc.options && desc.options.timeout || 30000)(ctx);

            if (resp) {
              if (resp instanceof GaiaResponse) {
                await resp.output(ctx);
              } else {
                ctx.body = resp;
              }
            }
          }, packageName, service, method);
        }
      }

      return constructor;
    };
  }

  method(options?: MethodOptions): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void;

  method(method?: string | MethodOptions, options?: MethodOptions) {
    return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
      if (!target.constructor.exposedMethods) {
        target.constructor.exposedMethods = {};
      }

      if (typeof method === 'object') {
        options = method;
        method = propertyKey;
      }

      target.constructor.exposedMethods[ method || propertyKey ] = { func: propertyKey, options };
    };
  }

  async stats() {
    return {
      // state: this.grpcServer.state,
      // started: this.grpcServer.started,
      // clientsCount: this.grpcServer.clientsCount,
      // address: getIp(),
      // port: this.grpcServer.port,
      // applicationId: this.grpcServer.applicationId,
      // applicationName: this.grpcServer.applicationName,
      // // providers: Object.values(this._registeredRouter).map(provider => `${provider.service}#${provider.version}`),
      // providers: await this.grpcServer.registry.stats(),
      // // nodeRegistered: await this.grpcServer.registry.nodeRegistered(),
    };
  }

}

export class BaseGrpcService {
  ctx: Context;

  constructor(ctx: Context) {
    this.ctx = ctx;
  }
}

export default GrpcProvider.instance;
