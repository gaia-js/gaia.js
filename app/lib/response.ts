import { Context } from 'egg';
import Schema from './schema';
import { enumerable } from '../object/BasePropertiesObject'

export default class GaiaResponse extends Schema {
  /**
   * @deprecated 避免污染输出数据
   */
  @enumerable(false)
  status: number;

  /**
   * @deprecated 避免污染输出数据
   */
  @enumerable(false)
  type?: string;

  // eslint-disable-next-line no-useless-constructor
  constructor(data: any, ctx?: Context) {
    super(data, ctx);

  }

  async output(ctx: Context) {
    ctx.type = this.type || 'json';
    this.status && (ctx.status = this.status);
    ctx.body = await this.dump();
    if (ctx.body) {
      ctx.fullbody = true;
    }
  }

  async dump(): Promise<any> {
    return this.toJSON();
  }
}
