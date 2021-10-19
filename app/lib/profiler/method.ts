import { Context } from 'egg';
import { Item } from 'rhea-cli';
import { getRheaClient } from 'rhea-cli/lib/rhea_cli';

export default function methodProfile<T extends { new(...args: any[]): {} } = any>(name?: string, tags?: { [K: string]: string }, options?: { timeout?: number, tags?: (params: any[]) => { [K: string]: string } }) {
  return (target: T, propertyKey: string, descriptor: PropertyDescriptor) => {
    const oldValue: Function = target[propertyKey];

    // tslint:disable-next-line: no-function-expression
    descriptor.value = function (...params: any[]) {
      const ctx: Context | undefined = ((this || target) as any).ctx as Context;
      const itemName = name || (this || target).constructor.name;
      tags = { ...(tags || {}), operator: propertyKey, ...(options && options.tags ? options.tags(params) : {}) };

      const profileItem = ctx ? ctx.service.profiler.createItem(itemName, tags) : new Item(itemName, tags);

      try {
        return oldValue.apply((this || target), params);
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
  };
}
