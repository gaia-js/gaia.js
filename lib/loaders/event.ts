import * as path from 'path';
import * as is from 'is-type-of';
import { Context } from 'egg';
import AppWorkerLoader from '../loader';

export const EVENT_PATH_NAME = Symbol.for('gaia@eventPathName');

export default {
  loadEvent(this: AppWorkerLoader, opt: any) {
    const app = this.app;

    this.timing.start('Load Event');

    opt = Object.assign({
      inject: this.app,
      caseStyle: 'camel',
      override: true,
      directory: this.getLoadUnits().map(unit => path.join(unit.path, 'app/event')),
    }, opt);

    // this.app.loader.loadToApp(opt.directory, 'event', opt);

    // if (!app.eventSink) {
    //   app.eventSink = {};
    // }

    app.loader.loadToContext(opt.directory, 'event', Object.assign(opt, {
      filter(objClass) {
        return is.class(objClass); /* && objClass.prototype instanceof BasePropertiesObject */
      },
      initializer(clz, options) {
        if (!clz.hasOwnProperty(EVENT_PATH_NAME)) {
          clz[ EVENT_PATH_NAME] = options.pathName;
        }

        return class {
          static get [ EVENT_PATH_NAME]() {
            return options.pathName;
          }

          ctx: Context

          constructor(ctx: Context) {
            // this.ctx = ctx;
            Object.defineProperty(this, 'ctx', {
              enumerable: false,
              configurable: true,
              value: ctx,
            });
          }

          create(...params) {
            const obj = new clz(...params);
            // obj.ctx = this.ctx;
            Object.defineProperty(obj, 'ctx', {
              enumerable: false,
              configurable: true,
              value: this.ctx,
            });
            return obj;
          }
        };
      },
    }));

    this.timing.end('Load Object');
  },
};
