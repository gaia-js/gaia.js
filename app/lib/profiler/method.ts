import { Context } from 'egg';
import { Item } from 'rhea-cli';
import { getRheaClient } from 'rhea-cli/lib/rhea_cli';

export default function method<T extends { new(...args: any[]): {} } = any>(name?: string, tags?: { [K: string]: string }, options?: { timeout: number }) {
  return (target: T, propertyKey: string, descriptor: PropertyDescriptor) => {
    const oldValue: Function = target[propertyKey];

    descriptor.value = (...params: any[]) => {
      const ctx: Context | undefined = (target as any).ctx as Context;
      const itemName = name || target.constructor.name;
      tags = { ...(tags || {}), operator: propertyKey };

      const profileItem = ctx ? ctx.service.profiler.createItem(itemName, tags) : new Item(itemName, tags);

      try {
        return oldValue.apply(target, params);
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