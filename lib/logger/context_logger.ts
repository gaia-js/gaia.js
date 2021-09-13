import { Logger, EggContextLogger } from 'egg-logger';
import { Context } from 'egg';
const callsites = require('callsites');

function contextFormatter(meta) {
  return meta.date + ' ' + meta.level + ' ' + meta.pid + ' ' + meta.paddingMessage + ' ' + meta.message;
}

class ContextLogger extends EggContextLogger {
  _logger: Logger;
  ctx: Context;

  // constructor(ctx: Context, logger: Logger) {
  //   super(ctx, logger);

  // }
}

[ 'error', 'warn', 'info', 'debug' ].forEach(level => {
  const LEVEL = level.toUpperCase();
  ContextLogger.prototype[level] = function(...params: any[]) {
    const meta: any = {
      ctx: this.ctx,
      formatter: contextFormatter,
      paddingMessage: this.paddingMessage,
    };

    if (params && params.length > 0 && typeof params[0] === 'object') {
      if (!params[0].hasOwnProperty('file')) {
        const sites = callsites();
        params[0].file = sites[1].getFileName() + ':' + sites[1].getLineNumber();
      }
    } else {
      const sites = callsites();
      meta.file = sites[1].getFileName() + ':' + sites[1].getLineNumber();
    }

    this._logger.log(LEVEL as any, params, meta);
  };
});

export default ContextLogger;
