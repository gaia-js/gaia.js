import { deepFindObject } from '../obj_util';

export default function service(servicePath?: string, options?: {}) {
  return (target: any, propertyKey: string) => {
    if (!servicePath) {
      servicePath = propertyKey.replace(/Service$/, '').replace(/_/g, '.');
    }

    process.nextTick(() => {
      import('../bootstrap').then(({ default: bootstrap } ) => {
        if (bootstrap.app) {
          const ctx = bootstrap.app.createAnonymousContext();
          bootstrap.app.assert(deepFindObject(ctx.service, servicePath!).obj, `cannot locate service: ${servicePath} in ${target.pathName || target.constructor.name}.${propertyKey}`);
        } else {
          console.error('bootstrap app not initialized');
        }
      });
    });

    Object.defineProperty(target, propertyKey, {
      enumerable: false,
      configurable: false,
      get() {
        return deepFindObject(this.ctx.service, servicePath!).obj;
      },
    });
  };
}
