import { CacheRepository, BaseCacheService, CacheSetOptions } from '../../lib/BaseCacheService';
import { Context } from 'egg';
import RuntimeRepository from '../../lib/cache/runtime';

export default class Runtime extends BaseCacheService {
  constructor(ctx: Context) {
    super(ctx);
  }

  get cacheRepository(): CacheRepository {
    if (!this.ctx.runtimeCache) {
      this.ctx.runtimeCache = new RuntimeRepository(this.ctx.logger);
    }

    return this.ctx.runtimeCache;
  }

  clear() {
    (this.cacheRepository as RuntimeRepository).clear();
  }

  async mget(keys: [string]): Promise<Map<string, any>> {
    return (this.cacheRepository as RuntimeRepository).mget(keys);
  }

  async mset(values: Map<string, any>, options: CacheSetOptions = {}): Promise<void> {
    return (this.cacheRepository as RuntimeRepository).mset(values, options);
  }
}
