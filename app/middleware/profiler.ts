import { Context } from 'egg';
import { RouterOptions } from '../lib/router/blueprint';

export default function profiler(): any {
  return (bpOption?: RouterOptions) => {
    return async (ctx: Context, next: () => Promise<any>) => {
      ctx.app.incrConnectionCount();
      let timer: any = setTimeout(() => {
        ctx.logError({ type: 'slowreq_long', msg: 'not finished in 15s', profile: ctx.service.profiler.dump('medium') });
        clearTimeout(timer);
        timer = null;
      }, 15000);

      const profileItem = ctx.service.profiler.createItem('controller', { operator: (bpOption && bpOption.path) || ctx.request.path });
      ctx._profiled = true;
      try {
        await next();
      } finally {
        if (profileItem.end() > 1000) {
          profileItem.addTag('timeout', 'timeout');

          ctx.logWarn({ type: 'slowreq', msg: `spent ${profileItem.last()}ms`, profile: ctx.service.profiler.dump('medium'), detail: { spent: profileItem.duration } });
        }

        ctx.service.profiler.addItem(profileItem);
        timer && clearTimeout(timer);

        try {
          if (ctx.isFromOffice()) {
            const profileStat = ctx.service.profiler.dump('minimize');
            ctx.set('X-Profiler', Object.keys(profileStat).map(key => key.substr(0, 4) + ':' + profileStat[key]).join(',').substr(0, 200));
          }
        } catch (err) {
          // ignore it
        }

        if (ctx.service.profiler) {
          ctx.service.profiler.submit();
        }

        ctx.app.decrConnectionCount();

        // ctx.app.cleanContext && ctx.app.cleanContext(ctx);
      }
    };
  };
}
