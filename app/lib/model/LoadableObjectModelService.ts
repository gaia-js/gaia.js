import { Context } from 'egg';
import * as assert from 'assert';
import * as md5 from 'md5';
import { ObjectProperties } from '../../object/BasePropertiesObject';
import BaseModelObject, { KeyType } from '../../object/BaseModelObject';
import ObjectModelService, { ObjectClass, LoadOptions, LoadAs, ObjectModelOptions } from './ObjectModelService';
import * as is from 'is-type-of';

export type LoadMethodFunc<KT, T> = ((id: KT) => Promise<ObjectProperties<T> | null>);
export type LoadMultiMethodFunc<KT, T> = ((ids: KT[]) => Promise<Map<KT, ObjectProperties<T>>>);

export type LoadWithMethodFunc<T> = ((...params: any[]) => Promise<ObjectProperties<T> | null>);
export type LoadMultiWithMethodFunc<T> = ((...params: any[]) => Promise<ObjectProperties<T>[] | null>);

export interface RPCObjectModelOptions<T, KT> extends ObjectModelOptions<T> {
  objectCreator?: (properties: ObjectProperties<T>, ctx: Context) => any;
  objectModelClass?: ObjectClass<T>;
  loadMethod?: string | LoadMethodFunc<KT, T>;
  loadMultiMethod?: string | LoadMultiMethodFunc<KT, T>;
  expires?: number;
}

export default abstract class LoadableObjectModelService<T extends BaseModelObject<KT>, KT = KeyType> extends ObjectModelService<KT, T> {
  protected loadMethod: string | LoadMethodFunc<KT, T> | undefined
  protected loadMultiMethod: string | LoadMultiMethodFunc<KT, T> | undefined
  protected objectCreator: (properties: ObjectProperties<T>, ctx: Context) => any | undefined
  protected objectModelClass: ObjectClass<T> | undefined
  protected _modelName: string | undefined // 用作缓存前缀

  constructor(ctx: Context, options: Partial<RPCObjectModelOptions<T, KT>>) {
    super(ctx, options);

    const { loadMethod, loadMultiMethod } = Object.assign({ expires: 7 * 86400 }, options || {});

    this.loadMethod = loadMethod;
    this.loadMultiMethod = loadMultiMethod;

    this._modelName = this.constructor.name;
  }

  cachePrefix() {
    return `model:${this._modelName}:`;
  }

  async request(method: string | LoadMethodFunc<KT, T>, ...params: any[]): Promise<ObjectProperties<T> | null | undefined> {
    if (typeof method === 'function') {
      // @ts-ignore
      return await method(...params);
    }

    assert(false, 'load method not implemented');
  }

  async requestMulti(method: string | LoadMultiMethodFunc<KT, T>, ...params: any[]): Promise<Map<KT, ObjectProperties<T>>> {
    if (typeof method === 'function') {
      // @ts-ignore
      return await method(...params);
    }

    assert(false, 'load method not implemented');
    return new Map<KT, ObjectProperties<T>>();
  }

  async fetchOne(id: KT): Promise<ObjectProperties<T> | null | undefined> {
    if (this.loadMethod) {
      return await this.request(this.loadMethod, id);
    } else if (this.loadMultiMethod) {
      const res = await this.requestMulti(this.loadMultiMethod, [ id ]);
      return res && res.get(id);
    }

    return Promise.reject(new Error('loadMethod not specified'));
  }

  async fetchMany(ids: KT[]) {
    if (this.loadMultiMethod) {
      return await this.requestMulti(this.loadMultiMethod, ids);
    } else if (this.loadMethod) {
      const results = new Map<KT, ObjectProperties<T> | null>();
      (await Promise.all(ids.map(id => this.request(this.loadMethod as string, id)))).forEach((item, index) => {
        if (typeof item !== 'undefined') {
          results.set(ids[index], item);
        }
      });

      return results;
    }

    return Promise.reject(new Error('loadMethod not specified'));
  }

  protected async flushWith(loadMethod: string, params: any[]) {
    await this.cachePoolChain.remove(loadMethod + ':' + md5(JSON.stringify(params)), { prefix: this.cachePrefix() + 'with:' });
  }

  protected async loadWith(
    loadMethod: string | LoadWithMethodFunc<T>,
    params: any[],
    options: Partial<LoadOptions<T> & { prefix: string; skipSaveObjectCache: false; resolveResult: (res: any) => Promise<ObjectProperties<T>> }> = {}) {
    let obj: T | undefined;

    options || (options = {});

    const loadMethodName = typeof loadMethod === 'function' ? '' : loadMethod;
    const id = await this.cachePoolChain.load<KT | null | undefined>(loadMethodName + ':' + md5(JSON.stringify(params)), async () => {
      let properties = await this.request(loadMethod, ...params).catch(err => {
        this.ctx.logError({ msg: `cannot load with ${loadMethod}`, error: err, detail: { params } }, err);
        return undefined;
      });

      if (options.resolveResult) {
        properties = await options.resolveResult(properties);
      }

      if (properties) {
        obj = this.createObject(properties, { loadFromDb: true });
        if (!options.skipSetCache && !options.skipSaveObjectCache) {
          // tslint:disable-next-line: no-floating-promises
          this.saveCache(obj);
        }

        return obj.id;
      }

      return properties as any as KT;
    }, { prefix: this.cachePrefix() + (options.prefix ? options.prefix + ':' : '') + 'with:', skipCache: this.disableCache || options.skipCache || false, ...options });

    return obj || (id && await this.load(id, options) || null);
  }

  protected async loadMultiWith(
    loadMultiMethod: string | LoadMultiWithMethodFunc<T>,
    params: any[],
    options: Partial<LoadOptions<T> & {
      skipSaveObjectCache: boolean;
      prefix: string;
      resolveResult: (res: any) => Promise<ObjectProperties<T>[]> | {
        [ key: string ]: ObjectProperties<T>;
      };
    }> = { loadAs: LoadAs.array }) {
    let objs: (T | null)[] | undefined;

    const loadMultiMethodName = typeof loadMultiMethod === 'function' ? '' : loadMultiMethod;
    const ids: KT[] = await this.cachePoolChain.load<any>(loadMultiMethodName + ':' + md5(JSON.stringify(params)), async () => {
      let res: any = await this.request(loadMultiMethod as any, ...params).catch(err => {
        this.ctx.logCritical({ msg: `cannot request with ${loadMultiMethod}`, detail: { params, err } }, err);
        return undefined;
      }) as any as ObjectProperties<T>[];

      if (options.resolveResult) {
        res = await options.resolveResult(res);
      }

      const ids: KT[] = [];
      if (res && is.array(res)) {
        objs = [];
        res.forEach((element: any) => {
          if (element) {
            const obj = this.createObject(element, { loadFromDb: true });
            if (!options.skipSetCache && !options.skipSaveObjectCache) {
              // tslint:disable-next-line: no-floating-promises
              this.saveCache(obj);
            }

            (objs as (T | null)[]).push(obj);
            ids.push(obj.id);
          } else {
            (objs as (T | null)[]).push(null);
          }
        });

        return ids;
      } else if (res && is.object(res)) {
        objs = [];
        for (const name of Object.keys(res)) {
          if (res[name] && typeof res[name] === 'object') {
            const obj = this.createObject(res[ name ], { loadFromDb: true });
            if (!options.skipSetCache && !options.skipSaveObjectCache) {
              // tslint:disable-next-line: no-floating-promises
              this.saveCache(obj);
            }

            objs.push(obj);
            ids.push(obj.id);
          } else {
            objs.push(null);
          }
        }

        return ids;
      }

      this.ctx.logCritical({ msg: `request with ${loadMultiMethod} returns invalid result`, detail: { params, res } });
      // return Promise.reject(new Error('invalid result: '+JSON.stringify(res)));
      return ids;
    }, { skipCache: this.disableCache || false, ...options, prefix: this.cachePrefix() + (options.prefix ? options.prefix + ':' : '') + 'with:' }).catch(err => {
      this.ctx.logError({ msg: `cannot load with ${loadMultiMethod}`, error: err, detail: { params, options } }, err);
    });

    if (typeof ids === 'undefined') {
      return [];
    }

    if (typeof objs !== 'undefined') {
      return objs;
    }

    return this.loadMultiAsArray(ids, options);
  }
}
