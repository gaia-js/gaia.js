const util = require('util');
const callsites = require('callsites');
const is = require('is-type-of');
import levels from './level';

// function getIp(req) {
//   let ip = req.get('x-forwarded-for'); // 获取代理前的ip地址
//     if (ip && ip.split(',').length > 0) {
//         ip = ip.split(',')[ 0 ];
//     } else {
//         ip = req.ip;
//     }
//     const ipArr = ip.match(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g);
//     return ipArr && ipArr.length > 0 ? ipArr[ 0 ] : '127.0.0.1';
// }

// tslint:disable-next-line: cyclomatic-complexity
export function formatMeta(level: string, args: any[], meta: any, logger: any) {
  meta = meta || {};

  if (args.length > 0) {
    if (is.object(args[0])) {
      Object.assign(meta, args[0]);
      args = Array.prototype.slice.call(args, 1);
    } else if (typeof args[0] === 'string') {
      meta.msg = util.format.apply(util, args);
    }
  }

  if (meta.ctx) {
    meta.ctx.service.profiler.addItem('log', { type: 'file' });
  } else {
    // rhea.submit('log');
  }

  meta.type || (meta.type = logger.options.loggerName || '');
  meta.app || (meta.app = logger.app.name);
  meta.deployment || (meta.deployment = logger.app.config.env);
  meta.env || (meta.env = logger.app.config.env);
  meta._indexed_app || (meta._indexed_app = logger.app.indexed_app_name);
  meta.level || (meta.level = typeof level === 'string' ? (level === 'INFO' ? 'VERBOSE' : level.toUpperCase()) : 'NOTICE');

  const sites = callsites();
  if (!meta.file && sites.length > 4) {
    meta.file = sites[4].getFileName() + ':' + sites[4].getLineNumber();
  }

  meta.timestamp = new Date().toISOString();

  try {
    const message = JSON.parse(meta.message);
    if (message) {
      Object.assign(meta, message);
      delete meta.message;
    }
  } catch (e) {
    //
  }

  if (meta.ctx) {
    meta = meta.ctx.formatLog(meta);
  }

  if (meta.profile) {
    meta.profile = JSON.stringify(meta.profile, null, 2);
  }

  if (meta.paddingMessage) {
    delete meta.paddingMessage;
  }

  meta.levelValue = levels[typeof meta.level === 'string' ? meta.level : 'INFO'] || levels.VERBOSE;
  if (meta.type === 'response' || meta.type === 'kafka_consumer-access') {
    meta.levelValue = levels.DEBUG;
  } else if (meta.levelValue ===  levels.INFO && typeof meta.type === 'string' && meta.type.endsWith('access')) {
    meta.levelValue = levels.VERBOSE;
  }

  return meta;
}
