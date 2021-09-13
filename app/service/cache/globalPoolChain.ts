import CachePoolChain from './poolChain';
import { Context } from 'egg';

export default class GlobalPoolChain extends CachePoolChain {
  constructor(ctx: Context) {
    super(ctx);

    this.cachePool = [ ctx.service.cache.globalRuntime as any, ctx.service.cache.couchbase as any ];
  }
}
