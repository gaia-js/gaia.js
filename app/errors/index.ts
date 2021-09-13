import { Context } from 'egg';
import codes from './codes';

const ERROR_CODE_NORMAL = 100;

export const enum Level {
  debug = 0,
  info = 10,
  notice = 20,
  warn = 30,
  error = 40,
  critical = 50,
}

export default class GaiaError extends Error {
  level?: Level;

  constructor(msg: any) {
    super(msg)

    if (!this.stack) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

// 严重错误，输出友好的错误信息
export class ServerError extends GaiaError {
  code: number;
  msg: string;
  detail?: any;
  status?: number;
  // previousError?: Error;

  constructor(error: { code?: number; msg: string; status?: number }, detail?: Error | any) {
    super(error.msg);

    this.status = error.status || 200;
    this.code = error.code || ERROR_CODE_NORMAL;
    this.msg = error.msg;
    this.detail = detail;

    if (detail instanceof Error) {
      // this.previousError = detail;

      this.stack = [ this.stack!.split('\n').slice(0, 2).join('\n'), 'previous error: ', detail.stack].join('\n');
    }
  }

  dump(): any {
    return {
      code: this.code,
      info: this.msg,
    };
  }

  async output(ctx: Context) {
    await ctx.service.error.outputError(this);
  }

  // toJSON() {
  //   return this.dump();
  // }
}

/**
 * switch 的default 保护
 * http://gitlab.17zuoye.net/17zuoye/gaia.js/issues/6
 */
export class UnreachableError extends ServerError {
  constructor(unreachable: never) {
    super({ code: 500, msg: `unreachable error: ${unreachable}` });
  }
}

/**
 * 正常业务错误
 * extra 字段会展开后输出到前端，同时也会记录到日志中
 * detail 字段会记录到日志，但不会输出到前端
 * */
export class BusinessError extends GaiaError {
  code: number;
  msg: string;
  detail?: any;
  extra?: any;
  status?: number;
  constructor(error: { code?: number; msg: string; status?: number; extra?: any; detail?: any }) {
    super(error.msg);
    this.status = error.status || 200;
    this.code = error.code || ERROR_CODE_NORMAL;
    this.msg = error.msg;
    this.extra = error.extra;
    this.detail = error.detail;
  }

  static get NO_AUTH(): BusinessError {
    return new BusinessError(codes.NO_AUTH);
  }

  static get SERVER_ERROR(): BusinessError {
    return new BusinessError(codes.SERVER_ERROR);
  }

  dump(): any {
    return {
      code: this.code,
      info: this.msg,
      ...(this.extra ? (typeof this.extra === 'object' ? this.extra : { extra: this.extra }) : {}),
    };
  }

  async output(ctx: Context) {
    await ctx.service.error.outputError(this);
  }

  // toJSON() {
  //   return this.dump();
  // }
}
