'use strict';

import { ConsoleTransport as BaseConsoleTransport, ConsoleTransportOptions, LoggerLevel } from 'egg-logger';
import { logLevel } from 'kafkajs';
// const BaseConsoleTransport = require('egg-logger/lib/transports/transport');
const { formatMeta } = require('./formatter');
const utils = require('egg-logger/lib/utils');
const chalk = require('chalk');
// const levels = require('./level');
// const levels = require('egg-logger/lib/level');
import levels from './level';

// tslint:disable-next-line: cyclomatic-complexity
function consoleLogFormatter(meta: any) {
  const output = [ `${meta.date} ${meta.level} ${meta.pid}` ];

  if (meta.type) {
    output.push(chalk[meta.levelValue >= levels.ERROR ? 'red' : 'blue'](`[${meta.type}]`));
  }

  if (meta.userid) {
    output.push(`(${chalk.green(meta.userid)})`);
  }

  if (meta.ctx && meta.ctx.url) {
    meta.ctx.request && meta.ctx.request.method && output.push(meta.ctx.request.method);
    output.push(meta.ctx && meta.ctx.url);
  }

  if (meta.msg || meta.type !== 'access') {
    output.push(chalk[meta.levelValue >= levels.CRIT ? 'red' : 'white'](`${meta.msg || meta.message || ''}`.substring(0, 500)));
  }

  const extra: string[] = [];
  extra.push(output.join(' '));

  if (meta.ctx && meta.type === 'access' && meta.ctx.request && meta.ctx.request.body && Object.keys(meta.ctx.request.body).length > 0) {
    extra.push('body: ' + JSON.stringify(meta.ctx.request.body).substring(0, 500));
  }

  if (meta.type.startsWith('slowreq')) {
    extra.push(meta.profile || JSON.stringify(meta.profile, null, 2));
  }

  if (meta.levelValue > levels.INFO && meta.detail) {
    extra.push(meta.detail);
    // extra.push(JSON.stringify(meta.detail));
  }

  if (meta.err || meta.error) {
    extra.push((meta.err || meta.error).stack);
  }

  return extra.join('\n');
}


export default class PrettyConsoleTransport extends BaseConsoleTransport {
  options: ConsoleTransportOptions & { logLevel: logLevel; app: any };

  constructor(options: any) {
    super({ level: levels.WARN, stderrLevel: 'ERROR', ...(options || {}), contextFormatter: consoleLogFormatter, formatter: consoleLogFormatter });

    // this.options.stderrLevel = utils.normalizeLevel(this.options.stderrLevel);
    // EGG_LOG has the highest priority
    if (process.env.EGG_LOG) {
      this.options.level = utils.normalizeLevel(process.env.EGG_LOG);
    }
  }

  // disable() {
  //   // this[ENABLED] = false;
  // }

  // get defaults() {
  //   return utils.assign(super.defaults, {
  //     level: 2, // WARN
  //     stderrLevel: 'ERROR',
  //     contextFormatter: consoleLogFormatter,
  //   });
  // }

  get app() {
    return this.options.app;
  }

  log(level: LoggerLevel, args: any[], meta: any) {
    meta = formatMeta(level, args, meta, this);

    const levelValue = meta.levelValue || levels[level === 'INFO' ? 'VERBOSE' : level] || levels.VERBOSE;
    if (levelValue < (this.options.logLevel || levels.VERBOSE)) {
      return;
    }

    if (meta.detail && (typeof meta.detail === 'object' || Array.isArray(meta.detail))) {
      meta.detail = JSON.stringify(meta.detail, null, 2);
    }

    if (meta.request && (typeof meta.request === 'object' || Array.isArray(meta.request))) {
      meta.request = JSON.stringify(meta.request, null, 2);
    }

    meta.formatter = consoleLogFormatter;
    // let msg: any = super.log(level, args, meta);
    let msg = utils.format(level, args, meta, this.options);

    if (this.app && this.app.deployment && this.app.deployment.developing()) {
      if (levelValue === levels.INFO) {
        msg = chalk.green(msg);
      } else if (levelValue > levels.INFO) {
        // msg = chalk.bgYellow(chalk.black(!err && msg && (`[${level || 'ERROR'}] ` + (typeof msg === 'string' ? msg : JSON.stringify(msg))) || '', err && err.stack || ''));
        msg = chalk.yellow(msg);
      }
    }

    if (levels[ level ] >= levels[ utils.normalizeLevel(this.options.stderrLevel) ] && levels[level] < levels.NONE) {
      process.stderr.write(msg);
    } else {
      process.stdout.write(msg);
    }
  }
}

export const ConsoleTransport = PrettyConsoleTransport;
