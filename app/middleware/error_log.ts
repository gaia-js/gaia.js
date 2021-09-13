import { Context } from 'egg';
import { BusinessError } from '../errors/index';
import { RouterOptions } from '../lib/router/blueprint';

export default function errorHandler(): any {
  return (bpOption?: RouterOptions) => {
    // tslint:disable-next-line: cyclomatic-complexity
    return async (ctx: Context, next: () => Promise<any>) => {
      try {
        await next();
      } catch (err) {
        if (err instanceof BusinessError) {
          ctx.service.profiler.addItem('error', { type: 'business', code: err.code, operator: bpOption && bpOption.request_type && bpOption.request_type.path || ctx.request && ctx.request.path });

          if (err.detail || err.extra) {
            ctx.logInfo({ type: 'business_error', msg: err && (err.msg || err.message) || 'unknown error', err });
          }
        } else {
          ctx.service.profiler.addItem('error', { type: 'controller_crash', operator: bpOption && bpOption.request_type && bpOption.request_type.path || ctx.request && ctx.request.path });

          // 写入错误日志
          // tslint:disable-next-line: max-line-length
          ctx.logCritical({ type: 'controller_crash', msg: err && (typeof err === 'object' && ((err as any).msg || (err as any).message)) || err || 'unknown error occurred', err, detail: { params: ctx.data } });
        }

        if (err instanceof Error) {
          await ctx.service.error.outputError(err);
        } else {
          throw err;
        }
      }
    };
  };
}
