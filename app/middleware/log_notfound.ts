import { Context } from 'egg';

export default function authHandler() {
  return async (ctx: Context, next: () => Promise<void>) => {
    try {
      await next();
    } finally {
      if (ctx.status === 404 && !ctx.body) {
        // if (!ctx.blueprinting) {
        ctx.service.profiler.addItem('controller', { operator: ctx.request.path /* '404' */ });

        if (!ctx.app.config.disableAccessLog && ctx.url !== '/ping') {
          ctx.logNotice({ type: 'access-notice', msg: '404 Not Found' });
        }

        if (ctx.service.profiler) {
          ctx.service.profiler.submit();
        }
        // }
      }
    }
  };
}
