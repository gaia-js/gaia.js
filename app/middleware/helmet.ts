import { Application, Context } from "egg";

import * as helmet from 'helmet';
import { promisify } from 'util';

export default (mwOptions?: any, app?: Application) => {
  // tslint:disable-next-line: no-function-expression
  const koaHelmet = function (options?: any) {
    const helmetPromise = promisify(helmet.call(null, {...(app?.config.helmetOptions || {}),
      ...(options || {})
    }));

    const middleware = async (ctx: Context, next: () => Promise<void>) => {
      return helmetPromise(ctx.req, ctx.res).then(next);
    };
    middleware._name = 'helmet';
    return middleware;
  };

  // tslint:disable-next-line: no-function-expression
  Object.keys(helmet).forEach(function (helmetMethod) {
    // tslint:disable-next-line: no-function-expression
    koaHelmet[helmetMethod] = function () {
      const methodPromise = promisify(helmet[helmetMethod].apply(null, arguments));

      return (ctx: Context, next: () => Promise<void>) => {
        return methodPromise(ctx.req, ctx.res).then(next);
      };
    };
    Object.keys(helmet[helmetMethod]).forEach((methodExports) => {
      koaHelmet[helmetMethod][methodExports] = helmet[helmetMethod][methodExports];
    });
  });

  return koaHelmet;
};
