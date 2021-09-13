import { CacheRepository, CacheSetOptions } from '../BaseCacheService';
import { Logger } from 'egg-logger';
import * as LRU from 'lru-cache';

const MAXSIZE = 2048;


export default class RuntimeRepository implements CacheRepository {
  protected logger?: Logger

  private objects: LRU<string, any>;
  private _oomWarned = false;

  constructor(logger?: Logger) {
    this.objects = new LRU(MAXSIZE);

    this.logger = logger;
  }

  available() {
    return true;
  }

  async get(key: string): Promise<any> {
    return this.objects.get(key);
  }

  async set(key: string, value: any) {
    if (this.objects.length > MAXSIZE) {
      if (!this._oomWarned) {
        this._oomWarned = true;
        this.logger && this.logger.info({ level: 'NOTICE', type: 'cache-warn', msg: 'runtime cache OOM: cannot set key and value', detail: { key, value } });
      }

      // return;
    }

    this.objects.set(key, value);
  }

  async remove(id: string) {
    this.objects.del(id);
  }

  async mget(keys: string[]): Promise<Map<string, any>> {
    const res = new Map();
    keys.forEach(key => {
      if (this.objects.has(key)) {
        res.set(key, this.objects.get(key));
      }
    });

    return res;
  }

  async mset(values: Map<string, any>, options: CacheSetOptions = {}): Promise<void> {
    values.forEach((value: any, key: string) => {
      this.objects.set((options && options.prefix ? options.prefix : '') + key, value);
    });
  }

  clear() {
    this.objects.reset();
  }

}
