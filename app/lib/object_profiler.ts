import { Item } from 'rhea-cli';
import { getRheaClient } from 'rhea-cli/lib/rhea_cli';
import { Context } from 'egg';

export default class ObjectProfiler<T extends object> {
  private obj: T;
  private ctx: Context;

  constructor(obj: T, itemName: string, tags: { [key: string]: string }, methods: string[], ctx: Context) {
    Object.defineProperties(this, {
      ctx: {
        enumerable: false,
        configurable: false,
        get() {
          return ctx;
        },
      },
      obj: {
        enumerable: false,
        configurable: false,
        get() {
          return obj;
        },
      },
    });

    for (const method of methods) {
      this[method] = this.profileOperator(method, itemName, tags);
    }
  }

  private profileOperator(name: string, itemName: string, tags: { [key: string]: string }) {
    return async (...params: any) => {
      const profileItem = this.ctx.service.profiler.createItem(itemName, Object.assign(tags || {}, { operator: name }));
      try {
        return await this.obj[name].call(this.obj, ...params);
      } catch (err) {
        // this.ctx.logError({
        //   msg: `${itemName}.${name} failed`,
        //   detail: Object.assign({ operator: name, params }, tags || {}),
        // }, err);
        throw err;
      } finally {
        if (profileItem.last() > 100) {
          profileItem.addTag('timeout', 'timeout');
        }
        this.ctx.service.profiler.addItem(profileItem);
      }
    };
  }

  // tslint:disable-next-line: function-name
  static createProfileProxy<T extends object>(target: T, itemName?: string, tags?: { [key: string]: string }, ctx?: Context, options?: { timeout?: number; methods?: string[]; excludes?: string[] }): T {
    return new Proxy(target, {
      // tslint:disable-next-line: no-reserved-keywords
      get(target: T, propKey: string) {
        if (typeof target[propKey] === 'function'
          && (!options || !options.methods || options.methods.includes(propKey))
          && (!options || !options.excludes || !options.excludes.includes(propKey))) {
          // tslint:disable-next-line: no-function-expression
          return function(...params: any) {
            if (!itemName) {
              itemName = target.constructor.name;
            }

            tags = { ...(tags || {}), operator: propKey };

            const profileItem = ctx ? ctx.service.profiler.createItem(itemName, tags) : new Item(itemName, tags);
            try {
              return target[ propKey ].apply(target, params);
            } catch (err) {
              profileItem.addTag('error', err instanceof Error ? err.name : 'error');
              throw err;
            } finally {
              if (profileItem.last() > (options && options.timeout || 100)) {
                profileItem.addTag('timeout', 'timeout');
              }

              if (ctx) {
                ctx && ctx.service.profiler.addItem(profileItem);
              } else {
                getRheaClient()?.addItem(profileItem);
              }
            }
          };
        }

        return target[propKey];
      },
    });
  }

  // tslint:disable-next-line: no-reserved-keywords function-name
  static for<T extends object>(obj: T, itemName: string, tags: { [key: string]: string }, methods: string[], ctx: Context): T {
    return this.createProfileProxy(obj, itemName, tags, ctx, { methods });
  }

  // tslint:disable-next-line: function-name
  static async promise<T = any>(p: Promise<T>, itemName: string, tags: { [key: string]: string }, options?: Partial<{ ctx: Context; timeout: number }>): Promise<T> {
    return (async () => {
      const profileItem = options && options.ctx ? options.ctx.service.profiler.createItem(itemName, tags) : new Item(itemName, tags);
      try {
        return await p;
      } catch (err) {
        profileItem.addTag('error', err instanceof Error ? err.name : 'error');
        throw err;
      } finally {
        if (profileItem.last() > (options && options.timeout || 100)) {
          profileItem.addTag('timeout', 'timeout');
        }

        if (options && options.ctx) {
          options && options.ctx && options.ctx.service.profiler.addItem(profileItem);
        } else {
          getRheaClient()?.addItem(profileItem);
        }
      }
    })();
  }
}
