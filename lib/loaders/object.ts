import * as path from 'path';
import * as is from 'is-type-of';
import { Context } from 'egg';
import AppWorkerLoader from '../loader';

export const OBJECT_PATH_NAME = Symbol.for('gaia@objectPathName');

export default {
  loadObject(this: AppWorkerLoader, opt: any) {
    const app = this.app;

    this.timing.start('Load Object');

    opt = Object.assign({
      inject: this.app,
      caseStyle: 'upper',
      override: true,
      directory: this.getLoadUnits().map(unit => path.join(unit.path, 'app/object')),
    }, opt);

    this.app.loader.loadToApp(opt.directory, 'object', opt);

    app.loader.loadToContext(opt.directory, 'object', {...opt,
      filter(objClass) {
        return is.class(objClass); /* && objClass.prototype instanceof BasePropertiesObject */
      },

      initializer(clz, options) {
        if (!clz.hasOwnProperty(OBJECT_PATH_NAME)) {
          clz[OBJECT_PATH_NAME] = options.pathName;
        }

        return class {
          protected ctx: Context;

          static get [OBJECT_PATH_NAME]() {
            return options.pathName;
          }

          constructor(ctx: Context) {
            // this.ctx = ctx;
            Object.defineProperty(this, 'ctx', {
              enumerable: false,
              configurable: true,
              value: ctx,
            });
          }

          create(...params: any[]) {
            if (clz.create) {
              return clz.create(...params, this.ctx);
            }

            const obj = new clz(...params, this.ctx);
            // obj.ctx = this.ctx;
            Object.defineProperty(obj, 'ctx', {
              enumerable: false,
              configurable: true,
              value: this.ctx,
            });
            return obj;
          }

          // tslint:disable-next-line: no-reserved-keywords
          get class() {
            return clz;
          }
        };
      }});

    this.timing.end('Load Object');
  },
};
