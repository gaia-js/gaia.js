import * as glob from 'glob';
import * as path from 'path';
import * as fs from 'fs';
import * as is from 'is-type-of';
import * as assert from 'assert';

import chalk from 'chalk';

const co = require('co');

import { Application/*, Router*/ } from 'egg';
import { Context } from 'egg';

import GaiaRequest, { MiddlewareFunction, RequestClass } from '../request';
import GaiaResponse from '../response';
import { BusinessError } from '../../errors/index';
import { ControllerOptions } from './blueprint';
import { camelToUnderScore } from '../string';


type Middleware = MiddlewareFunction;

export interface RouterOptions {
  name?: string | undefined;
  actionName?: string;
  path?: string;
  auth_required?: boolean;
  intranet_rpc?: boolean;
  admin?: boolean;
  request_type?: RequestClass;
}

let registeredRouters: {
  [key: string]: {
    method: string;
    name?: string | undefined;
    actionName?: string;
    path?: string | RegExp;
    middleware: Middleware;
    routeOptions?: any;
    controller?: {
      pathName?: string;
      controllerOptions?: ControllerOptions;
    } | undefined;
  }
} = {}

export interface RouteableModule<RequestType = GaiaRequest> {
  ctx: Context;
  req: RequestType;
}

function _registerRoute(method: string, name: string | undefined, path: string | RegExp, middleware: Middleware, options?: { supressWarning?: boolean; skipIfExists?: boolean; routeOptions?: any; actionName?: string; controller?: { pathName?: string; controllerOptions?: ControllerOptions; } | undefined ; }) {
  assert(method && [ 'get', 'post', 'put', 'delete', 'head', 'options' ].indexOf(method.toLowerCase()) !== -1, `invalid route method: ${method} of ${name}`);

  if (registeredRouters[ method + ':' + path ] && (!options || !options.supressWarning)) {
    console.warn(chalk.bgYellow(chalk.black(`route of [${method}] '${name}' has already been registered`)));
  }

  if (options && registeredRouters[ method + ':' + path ] && options.skipIfExists) {
    return;
  }

  registeredRouters[ method + ':' + path.toString() ] = {
    method: method.toLowerCase(),
    name,
    path,
    middleware,
    // routeOptions: options && options.routeOptions || undefined,
    // controllerOptions: options?.controllerOptions,
    ...(options || {})
  };
}

export function registerRoute(method: string, name: string | undefined, path: string | RegExp, middleware: any, options?: { supressWarning?: boolean; skipIfExists?: boolean; routeOptions?: any; actionName?: string; controller?: { pathName?: string; controllerOptions?: ControllerOptions; }; }) {
  _registerRoute(method, name, path, middleware, options);
}

function addRouter(/*router: Router, */method: string, path: string, routerMiddleware: (request: GaiaRequest) => GaiaResponse, options: RouterOptions & { routeOptions?: any } = {}, skipIfExists: boolean = true, controller?: { controllerOptions?: ControllerOptions }) {
  _registerRoute(method, options && options.name, path, async function(this: Context) {
    const ctx = this;

    if (is.generatorFunction(routerMiddleware)) routerMiddleware = co.wrap(routerMiddleware);
    const apiReq: GaiaRequest = this.apiReq = GaiaRequest.buildRequest(this, options.request_type) as any;
    if (!await apiReq.validate(options)) {
      return;
    }

    const resp: any = routerMiddleware.call({ ctx: this, apiReq }, apiReq);
    if (resp) {
      async function doResponse(resp: GaiaResponse, ctx: Context) {
        await resp.output(ctx);
      }

      async function handleError(err: Error, ctx: Context) {
        if (err instanceof BusinessError) {
          // ctx.logNotice({ type: 'business_error', msg: err.msg, error: err }, err);
          ctx.service.profiler.addItem('error', { type: 'business', code: err.code });

        } else {
          ctx.service.profiler.addItem('error', { type: 'fatal' });

          throw err;
        }
      }

      if (resp instanceof Promise) {
        await resp.then(async resp => {
          if (resp && resp instanceof GaiaResponse) {
            await doResponse(resp, this);
          }
        }).catch(async err => {
          await handleError(err, ctx);
        });
      } else if (resp instanceof GaiaResponse) {
        await doResponse(resp, this);
      } else if (resp instanceof Error) {
        await handleError(resp, ctx);
      }
    }
  }, { skipIfExists, routeOptions: options.routeOptions, controller });
}

function scanFolder(app: Application, dir: string/*, router: Router*/, skipIfExists: boolean = true) {
  function fileToUrlPath(file: string): string {
    let root = path.dirname('/' + file);
    root !== '/' && (root = (root + '/'));
    return `${root}${path.basename(file, path.extname(file))}`;
  }

  glob.sync('**/*.@(ts|js)', { cwd: dir, nodir: true }).forEach(file => {
    const fullPath = path.resolve(dir, file);
    if (!app.loader.resolveModule(fullPath)) {
      return;
    }

    if (file.endsWith('.d.ts')) {
      return;
    }

    if (file.endsWith('.ts')) {
      // 有js的时候忽略同名的ts
      const jsFile = path.resolve(path.dirname(fullPath), path.basename(file, '.ts') + '.js');
      if (fs.existsSync(path.resolve(dir, jsFile))) {
        return;
      }
    }

    let routerExports: any = require(fullPath);
    routerExports.default && (routerExports = routerExports.default);
    if (is.function(routerExports) && !is.class(routerExports)) {
      routerExports = {
        get: routerExports
      };
    }

    if (is.object(routerExports)) {
      routerExports.name || (routerExports.name = path.basename(file, path.extname(file)).replace('/', '.'));

      ['get', 'post', 'put', 'delete', 'head', 'options'].forEach(method => {
        routerExports[method] && is.function(routerExports[method]) && addRouter(/*router, */method, routerExports.path || fileToUrlPath(file), routerExports[method], routerExports, skipIfExists);
      });
    } else {
      console.info(`router for '${file}' is not auto generated`);
    }
  });
}

export function buildRouters(app: Application) {
  // const { router } = app;

  app.loader.getLoadUnits().filter(unit => unit.type === 'framework').map(unit => path.join(unit.path, 'app/routers')).forEach(routePath => {
    scanFolder(app, routePath/*, router*/);
  });

  app.loader.getLoadUnits().filter(unit => unit.type === 'app').map(unit => path.join(unit.path, 'app/routers')).forEach(routePath => {
    scanFolder(app, routePath/*, router*/, false);
  });

  // @TODO: 如果通过传统的routers注册的，应该不使用blueprint或者router以免挂载多个handler middleware
  Object.entries(registeredRouters).forEach(([_, item]) => {
    let path = item.path;
    if (!path && item.actionName && item.controller) {
      let basePath: string | undefined;
      if (item.controller.controllerOptions && item.controller.controllerOptions.path) {
        basePath = item.controller.controllerOptions.path;
      } else if (item.controller.pathName) {
        basePath = '/' + (item.controller.pathName as string).substr('controller.'.length).replace('.', '/');
      } else if (item.controller.constructor && item.controller.constructor.name && item.controller.constructor.name.match(/(.*)Controller/)) {
        basePath = '/' + camelToUnderScore(item.controller.constructor.name.match(/(.*)Controller/)![1]);
      }

      if (basePath) {
        path = basePath + '/' + item.actionName;
      }
    }

    app.assert(path, 'cannot resolve path of route');

    if (path && item.controller?.controllerOptions?.prefix) {
      path = item.controller?.controllerOptions?.prefix + path;
    }

    path && app.router[ item.method ](item.name, path instanceof RegExp ? path : path.replace(/(\/+)/g, '/'), item.middleware);

    if (item.routeOptions && item.name) {
      const routeLayer = app.router.route(item.name);
      routeLayer.opts = Object.assign(routeLayer.opts || {}, item.routeOptions);
    }
  });

  // registeredRouters = {};
}
