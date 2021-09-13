import 'reflect-metadata';
import { Application, Context, Controller } from 'egg';

import GaiaRequest, { RequestClass, ValidateOptions, MiddlewareFunction } from '../request';
import GaiaResponse from '../response';
import GaiaError, { BusinessError, ServerError } from '../../errors';
import { registerRoute } from './routers';
import * as is from 'is-type-of';
import * as utils from 'egg-core/lib/utils';
import * as composer from 'koa-compose';
// import * as methods from 'methods';

// type Methods =  = 'get' | 'post' | 'delete' | 'del' | 'put' | 'head' | 'options' | 'patch' | 'trace' | 'connect';

enum Methods {
  get = 'get',
  post = 'post',
  delete = 'delete',
  del = 'del',
  put = 'put',
  head = 'head',
  options = 'options',
  patch = 'patch',
  trace = 'trace',
  connect = 'connect',
}

export interface ControllerOptions {
  prefix: string; // 会给所有action加上路径前缀 `${controller.prefix}${controller.path || controller.pathName}${action.path || action.name}`
  path: string; // 指定controller的基路径，未指定将默认为pathName
  middleware: ((options?: RouterOptions) => MiddlewareFunction)[];
  downGradable: boolean | string; // 开启或者使用指定降级模块名称开启降级
}

export interface GaiaMiddleware {
  options: {};
  mw: (options?: RouterOptions) => MiddlewareFunction;
  mwOptions: { core: boolean };
}

export interface RouterOptions<T extends GaiaRequest = GaiaRequest> extends ValidateOptions {
  name?: string;
  method?: string;
  path?: string | RegExp;
  maxExecution?: number; // 最长执行秒数
  request_type?: RequestClass<T>;
}

let _instance: BluePrint;

export const BLUEPRINT_OPTIONS = Symbol.for('gaia@BluePrintOptions');

function logFilterInstaller(options?: RouterOptions)  {
  return async (ctx: Context, next) => {
    if (options?.logFilters) {
      options.logFilters.forEach(item => ctx.installLogFilter(item));
    }

    await next();
  };
}

function composeBlueprintMiddleware(middlewares: MiddlewareFunction[], options?: RouterOptions, Controller?: any) {
  const executor = composer(middlewares);

  return async function(this: Context | Controller, ctx: Context) {
    if (Controller) {
      if (this instanceof Controller) {
        ctx.controller = this;
      } else {
        ctx.controller = new Controller(ctx);
      }
    }

    await executor(ctx, async () => { });
  };
}

function buildRequestMiddleware(options?: RouterOptions) {
  return async (ctx: Context, next) => {
    let req!: GaiaRequest;
    try {
      if (options && options.request_type) {
        req = new options.request_type({...(ctx.query || {}), ...(ctx.request.body || {})}, ctx);
      } else {
        req = new GaiaRequest({...(ctx.query || {}), ...(ctx.request.body || {})}, ctx);
      }

      ctx.apiReq = req as any;

    } catch (err) {
      ctx.service.profiler.addItem('error', { type: 'request' });
      throw err;
    }

    if (options && typeof options.auth_required !== 'undefined') {
      req.auth_required = options.auth_required;
    }

    await next();
  };
}

function buildControllerActionFilter(action: (ctx: Context, req: GaiaRequest) => Promise<void>, actionName: string) {
  return (options?: RouterOptions) => {
    return async (ctx: Context, next, options) => {
      const controller = ctx.controller;
      const req = ctx.apiReq;

      let resp: GaiaResponse | BusinessError | undefined = undefined;
      try {
        if (controller.beforeRequest) {
          const filterResp = await controller.beforeRequest(action, req, actionName);
          if (typeof filterResp === 'boolean') {
            if (!filterResp) {
              if (ctx.status === 404) {
                resp = ctx.service.error.createBusinessError({  code: 403, msg: 'request denied' }) as any;
              }

              return;
            }
          } else if (typeof filterResp === 'object') {
            resp = filterResp;
          }

          if (resp) {
            if (resp instanceof GaiaResponse) {
              await resp.output(ctx);
            } else if (resp instanceof BusinessError) {
              await ctx.service.error.outputError(resp);
            } else {
              ctx.body || (ctx.body = resp);
            }

            return;
          }
        }

        resp = await next();
      } catch (err) {
        if (err instanceof BusinessError) {
          ctx.service.profiler.addItem('error', { type: 'business', code: err.code });

          // ctx.logNotice({ type: 'business_error', msg: err.msg }, err);

          await ctx.service.error.outputError(err);
        } else if (err instanceof ServerError) {
          ctx.service.profiler.addItem('error', { type: 'server', code: err.code });

          ctx.logCritical({ type: 'server_error', msg: err.msg }, err);

          await ctx.service.error.outputError(err);
        } else {
          throw err;
        }
      } finally {
        controller.afterRequest && await controller.afterRequest(action, ctx.apiReq, resp);
      }
    };
  };
}

function buildControllerMiddleware(action: (ctx: Context, req: GaiaRequest) => Promise<void>) {
  return (options?: RouterOptions) => {
    return async (ctx: Context, next, options) => {
      const controller = ctx.controller;
      const req = ctx.apiReq;

      return await action.call(controller, ctx, req as unknown as GaiaRequest);
    };
  };
}

export class BluePrint {
  app: Application;

  constructor(app?: Application) {
    if (app) {
      Object.defineProperty(this, 'app', {
        enumerable: false,
        configurable: true,
        value: app,
      });
    }

    Object.keys(Methods).forEach(method => {
      this[ method ] = <T extends GaiaRequest>(options?: string | RegExp /*RouterOptions<T> | string | RegExp | RequestClass<T>*/, opts?: RouterOptions<T>) => {
        return this.action<T>(options, { method, ...(opts || {})});
      };
    });
  }

  static initialize(app?: Application) {
    if (!_instance) {
      _instance = new BluePrint(app);
    } else if (app && !_instance.app) {
      Object.defineProperty(_instance, 'app', {
        configurable: false,
        writable: false,
        enumerable: false,
        value: app,
      });
    }

    return _instance;
  }

  static get instance(): BluePrint {
    return this.initialize();
  }

  action<T extends GaiaRequest = GaiaRequest>(path?: string | RegExp, opts?: RouterOptions<T>): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void;
  // tslint:disable-next-line: unified-signatures
  action<T extends GaiaRequest = GaiaRequest>(requestType?: RequestClass<T>, opts?: RouterOptions<T>): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void;
  action<T extends GaiaRequest = GaiaRequest>(options?: RouterOptions<T>): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void;
  action<T extends GaiaRequest = GaiaRequest>(pathOrRequestTypeOrOptions?: RouterOptions<T> | string | RegExp | RequestClass<T>, opts?: RouterOptions<T>) {
    // tslint:disable-next-line: no-object-literal-type-assertion
    return this.point<T>(<RouterOptions<T>>{
      ...(typeof pathOrRequestTypeOrOptions === 'string' || pathOrRequestTypeOrOptions instanceof RegExp ?
        { path: pathOrRequestTypeOrOptions }
        : (is.class(pathOrRequestTypeOrOptions) ?
          { request_type: pathOrRequestTypeOrOptions } : (pathOrRequestTypeOrOptions || {}))),
      ...(opts || {})
    });
  }

  auth_required(required = true) {
    return (target: any, propertyKey: string /*, descriptor: PropertyDescriptor*/) => {
      target[ propertyKey ][ BLUEPRINT_OPTIONS ] = {...(target[ propertyKey ][ BLUEPRINT_OPTIONS ] || {}),  auth_required: required};
    };
  }

  request_type<T extends GaiaRequest = GaiaRequest>(requestType: RequestClass<T>) {
    return (target: any, propertyKey: string /*, descriptor: PropertyDescriptor*/) => {
      target[ propertyKey ][ BLUEPRINT_OPTIONS ] = {...(target[ propertyKey ][ BLUEPRINT_OPTIONS ] || {}),  requestType};
    };
  }

  option<T extends GaiaRequest = GaiaRequest>(options: RouterOptions<T>) {
    return (target: any, propertyKey: string /*, descriptor: PropertyDescriptor*/) => {
      target[ propertyKey ][ BLUEPRINT_OPTIONS ] = {...(target[ propertyKey ][ BLUEPRINT_OPTIONS ] || {}), ...options};
    };
  }

  // tslint:disable-next-line: max-func-body-length
  point<T extends GaiaRequest = GaiaRequest>(options: RouterOptions<T>) {
    // tslint:disable-next-line: cyclomatic-complexity max-func-body-length
    return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
      const originResolver = descriptor.value.originResolver || descriptor.value;
      const Controller = target.constructor;

      let requestType = options && options.request_type;
      if (!requestType) {
        const types = Reflect.getMetadata('design:paramtypes', target, propertyKey);
        if (types && types.length > 0 && types[0].prototype && GaiaRequest.prototype.isPrototypeOf(types[0].prototype)) {
          options.request_type = requestType = types[0];
        }
      }

      if (!options.path && (requestType && requestType.path)) {
        options.path = (requestType && requestType.path) // ||
          // (target.pathName && (options.path = (target.pathName as string).substr('controller.'.length).replace('.', '/') + '/' + propertyKey) ||
          // (target.constructor && target.constructor.name && target.constructor.name.match(/(.*)Controller/) && (options.path = '/' + camelToUnderScore(target.constructor.name.match(/(.*)Controller/)[1]) + '/' + propertyKey)));
      }

      (this.app as any).assert(options.path &&
        (requestType ||
        (options.path ? options.path instanceof RegExp || typeof options.path === 'string' && options.path.startsWith('/') : true)),
        `path should starts with / in ${target.pathName || target.constructor.name}.${propertyKey}: ${JSON.stringify(options)}`
      );

      descriptor.value = async function(this: Controller, ctx: Context, req: GaiaRequest) {
        const controller = this;

        if (!ctx) {
          ctx = this.ctx;
        }

        if (!req && ctx) {
          req = ctx.apiReq as unknown as GaiaRequest;
        }

        if (req && !await req.validate(options)) {
          return;
        }

        let resp: GaiaResponse | GaiaError | BusinessError | ServerError | undefined;

        const resolvePromise = (async () => {
          try {
            resp = await originResolver.call(controller, req);
          } catch (err) {
            throw err;
          }

          if (resp) {
            if (resp instanceof GaiaResponse) {
              await resp.output(ctx);
            } else if (resp instanceof BusinessError) {
              await ctx.service.error.outputError(resp);
            } else if (resp instanceof ServerError) {
              await ctx.service.error.outputError(resp);
            } else {
              ctx.body || (ctx.body = resp);
            }
          }

          if (ctx.status === 404 && typeof ctx.body === 'undefined') {
            ctx.logNotice({ msg: 'no response data produced in controller handler' });

            ctx.status = 200;
            ctx.body = '';
          }
        })();

        let timer: any;
        try {
          await Promise.race([ resolvePromise, new Promise((resolve, reject) => {
            timer = setTimeout(async () => {
              resp = ctx.service.error.createBusinessError(ctx.app.errorCodes.NO_RESPONSE) as unknown as BusinessError;
              await ctx.service.error.outputError(resp);
              resolve(resp);
            }, (options.maxExecution || ctx.app.config.maxExecution || 60) * 1000);
          }) ]);
        } finally {
          if (timer) {
            clearTimeout(timer);
          }
        }

        return resp;
      };

      options = descriptor.value[BLUEPRINT_OPTIONS] = { auth_required: true, ...(originResolver.hasOwnProperty(BLUEPRINT_OPTIONS) ? originResolver[BLUEPRINT_OPTIONS] : {}), ...(options || {})};

      const src = target[propertyKey][BLUEPRINT_OPTIONS] || {};
      for (const key in src) {
        if (key === 'extensions') {
          Object.assign(options[key], src[key]);
        } else {
          options[key] = src[key];
        }
      }

      if (!options.method) {
        options.method = (requestType && requestType.method) || 'get';
      }

      descriptor.value.originResolver = originResolver;
      target[ propertyKey ].accessorName = descriptor.value.accessorName = options.name || (requestType && requestType.accessorName) || (target.pathName && (options.name = (target.pathName as string).substr('controller.'.length) + '.' + propertyKey)) || (target.constructor.name + '.' + propertyKey);
      descriptor.value.path = options.path;
      // this.app.assert(this.app, 'app has no value before gaiajs framework loader loaded');

      const routeOptions = descriptor.value[BLUEPRINT_OPTIONS] ? { ignoreAuth: !descriptor.value[BLUEPRINT_OPTIONS].auth_required, gaia_ext: descriptor.value[BLUEPRINT_OPTIONS] } : undefined;

      const gaiaMiddlewares: any[] = ((this.app as any).gaiaMiddlewares || []);

      const methodMiddleware = [ ...(options && options.middlewares || []) ];

      if (options.downGradable) {
        methodMiddleware.unshift(this.app.downGrader.middleware(options.method! + ':' + (typeof options.downGradable === 'string' ? options.downGradable : descriptor.value.path)) as any);
      }

      process.nextTick(() => {
        const controllerOptions = target.controllerOptions as ControllerOptions;

        let controllerMiddleware = controllerOptions?.middleware || [];

        if (controllerOptions?.downGradable) {
          controllerMiddleware.unshift(this.app.downGrader.middleware(typeof controllerOptions.downGradable === 'string' ? controllerOptions.downGradable : target.pathName?.replace(/controller\./, '') || target.constructor.name) as any);
        }

        const middlewares: any[] = [
          logFilterInstaller,
          ...(gaiaMiddlewares.filter(item => item.mwOptions.core).map(item => item.mw)),
          ...([ buildRequestMiddleware ]),
          ...(gaiaMiddlewares.filter(item => !item.mwOptions.core).map(item => item.mw)),
          ...controllerMiddleware,
          ...methodMiddleware,
          ...([ buildControllerActionFilter(descriptor.value, propertyKey) ]),
          ...([ buildControllerMiddleware(descriptor.value) ]),
        ];

        this.app.assert(options.path, `path should not be empty: ${descriptor.value.accessorName}`);

        registerRoute(options.method!,
          descriptor.value.accessorName,
          options.path!,
          composeBlueprintMiddleware(middlewares.map(mw => utils.middleware(mw(options))), options, Controller),
          { routeOptions, supressWarning: true, controller: target, actionName: propertyKey });
        });
    };
  }

  url<T extends GaiaRequest>(route: ((...params: any[]) => Promise<GaiaResponse | void>) | RequestClass<T> | string, params: any = undefined) {
    return this.app.router.url(typeof route === 'string' ? route : (route as any).accessorName, params);
  }

  controller<T extends { new(...args: any[]): {} }>(options?: Partial<ControllerOptions>) {
    return function classDecorator<T extends { new(...args: any[]): {} }>(constructor: T) {
      Object.defineProperty(constructor.prototype, 'controllerOptions', {
        enumerable: false,
        value: options
      });
      return constructor;
    }
  }
}

// export interface BluePrint {
  // get<T extends GaiaRequest = GaiaRequest>(options?: RouterOptions | string | RegExp | RequestClass<T>, opts?: RouterOptions): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void;
  // post<T extends GaiaRequest = GaiaRequest>(options?: RouterOptions | string | RegExp | RequestClass<T>, opts?: RouterOptions): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void;
  // put<T extends GaiaRequest = GaiaRequest>(options?: RouterOptions | string | RegExp | RequestClass<T>, opts?: RouterOptions): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void;
  // delete<T extends GaiaRequest = GaiaRequest>(options?: RouterOptions | string | RegExp | RequestClass<T>, opts?: RouterOptions): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void;
  // head<T extends GaiaRequest = GaiaRequest>(options?: RouterOptions | string | RegExp | RequestClass<T>, opts?: RouterOptions): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void;
  // options<T extends GaiaRequest = GaiaRequest>(options?: RouterOptions | string | RegExp | RequestClass<T>, opts?: RouterOptions): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void;
// }

type BluePrintMethods = {
  [ key in keyof typeof Methods ]: <T extends GaiaRequest = GaiaRequest>(pathOrRequestTypeOrOptions?: string | RegExp | RequestClass<T> | RouterOptions<T>, opts?: RouterOptions<T>) => (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void;

  // [ key in Methods ]:
  // (<T extends GaiaRequest = GaiaRequest>(path?: string | RegExp, opts?: RouterOptions<T>) => (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void)
  // | (<T extends GaiaRequest = GaiaRequest>(requestType?: RequestClass<T>, opts?: RouterOptions<T>) => (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void)
  // | (<T extends GaiaRequest = GaiaRequest>(options?: RouterOptions<T>) => (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void);
};

export declare interface BluePrint extends BluePrintMethods {

}

const bp = BluePrint.instance;

export default bp;
