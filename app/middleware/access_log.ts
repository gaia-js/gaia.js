import { Context } from 'egg';
import { Stream } from 'stream';
import { RouterOptions } from '../lib/router/blueprint';

/**
 */
export default function accessLogHandler() {
  return (bpOption?: RouterOptions) => {
    return async (ctx: Context, next: any) => {
      try {
        try {
          if (!ctx.app.config.disableAccessLog && ctx.url !== '/ping') {
            ctx.logInfo({ type: 'access' });
          }
        } catch (err) {
          // omit
        }

        await next();
      } finally {
        if (!ctx.app.config.disableAccessLog && ctx.url !== '/ping') {
          ctx.logInfo({
            // level: ctx.body && typeof ctx.body === 'object' && typeof ctx.body.code !== 'undefined' && ctx.body.code !== 0 ? 'NOTICE' : 'INFO',
            level: 'INFO',
            type: 'response',
            msg: typeof ctx.body === 'object' ? ctx.body.msg || ctx.body.message : '',
            profile: ctx.service.profiler.dump('medium'),
            detail: {
              body: ctx.body instanceof Stream ? '<stream>' : ((typeof ctx.body === 'object' ? JSON.stringify(ctx.body && ctx.body.data ? ctx.body.data : ctx.body) : ctx.body && ctx.body.toString()) || '').substr(0, 200)
            },
          });
        }
      }
    };
  };
}
