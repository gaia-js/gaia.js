import { Context } from 'egg';
import BasePropertiesObject from '../object/BasePropertiesObject';
import { enumerable } from '../object/BasePropertiesObject';

export default abstract class Schema extends BasePropertiesObject {
  @enumerable(false)
  private _data: any;

  constructor(data: any, ctx?: Context) {
    super(data, ctx);
    Object.defineProperty(this, '_data', {
      enumerable: false,
      value: data,
    })
  }

  async getField(name: string) {
    const data = this._data && this._data[name];
    return data && (typeof data === 'function' ? await(data as Function)() : data instanceof Promise ? await data : data);
  }
}
