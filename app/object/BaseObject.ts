import { Context } from 'egg';

export default class BaseObject {
  ctx: Context;

  constructor(ctx?: Context) {
    Object.defineProperty(this, 'ctx', {
      configurable: true,
      enumerable: false,
      writable: true,
      value: ctx,
    });

    // TODO 避免覆盖属性，以后升级版本再支持
    // Object.defineProperties(this, {
    //   app: {
    //     configurable: true,
    //     enumerable: false,
    //     writable: true,
    //     value: ctx?.app,
    //   },
    //   config: {
    //     configurable: true,
    //     enumerable: false,
    //     writable: true,
    //     value: ctx?.app?.config,
    //   },
    //   service: {
    //     configurable: true,
    //     enumerable: false,
    //     writable: true,
    //     value: ctx?.service,
    //   },
    // });
  }
}
