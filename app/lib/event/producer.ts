import * as assert from 'assert';
import { Context } from 'egg';

export interface FireOptions {

}

export type EventHandler = (ctx: Context, event: symbol, ...params: any[]) => Promise<boolean | void>;

const eventHandlers: Map<Symbol, EventHandler[]> = new Map();

export default class EventProducer {
  ctx: Context;

  constructor(ctx: Context) {
    Object.defineProperty(this, 'ctx', {
      value: ctx,
      enumerable: false,
      writable: false,
    });
  }

  private handlers(event: symbol): EventHandler[] {
    return eventHandlers.get(event) || [];
  }

  static subscribe(event: symbol | symbol[], handler: EventHandler) {
    if (!Array.isArray(event)) {
      event = [ event ];
    }

    event.forEach(e => {
      let handlers = eventHandlers.get(e);
      if (!handlers) {
        handlers = [];
        eventHandlers.set(e, handlers);
      }

      assert(handlers.indexOf(handler) === -1, `event handler for ${e.toString()} already registered`);

      handlers.push(handler);
    });
  }

  async fire(event: symbol, ...params: any[]): Promise<(boolean|void)[]> {
    return await Promise.all(this.handlers(event).map(handler => handler(this.ctx, event, ...params)));
  }
}
