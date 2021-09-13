const util = require('util');
// const callsites = require('callsites');
const is = require('is-type-of');
// const Transport = require('egg-logger/lib/transports/transport');
import { Transport, EggLoggerOptions, EggCustomLogger } from 'egg-logger';
import { formatMeta } from './formatter';
import KafkaProducer from '../../app/lib/kafka/producer';
import { wrapLogger } from '../logger';
const utils = require('egg-logger/lib/utils');
const rhea = require('rhea-cli');
const os = require('os');
const debug = require('debug')('gaia:kafka_logger');

const hostname = os.hostname();

export default class KafkaTransport extends Transport {
  private kafkaProducer: KafkaProducer;

  private loggingCount: number;
  // private logSum: number;
  private active: number;
  private options: EggLoggerOptions & { topic: string; app: any };

  constructor(options: any) {
    options = {
      level: 'INFO',
      json: true,
      eol: '', ...(options || {}) };

    super(options);

    this.kafkaProducer = new KafkaProducer(
      options.broker,
      this.app,
      { retry: { maxRetryTime: 1, } },
      { transactionTimeout: 200, maxInFlightRequests: 256, retry: { maxRetryTime: 1, } }
    );

    process.nextTick(() => {
      const logger = new EggCustomLogger(this.app.getLogger('logger').options);
      wrapLogger(logger, 'kafka_logger', this.app);
      logger.delete('kafka');
      this.kafkaProducer.logger = logger;
    });

    this.loggingCount = 0;
    // this.logSum = 0;

    this.active = 86400;

    // 上报瞬时日志上报积压情况
    const timer = setInterval(() => {
      // 如果一天都没有一个log的话，就不上报了，也许这个实例已经没用了
      if (this.active <= 0) {
        clearInterval(timer);
      }

      this.active--;
      rhea.submit('kafka_logging', {}, this.loggingCount);
    }, 1000);

    timer.unref();
  }

  get app() {
    return this.options.app;
  }

  log(level: string, args: any[], meta: any) {
    this.active = 86400;
    // this.logSum++;

    // 防止积压，丢弃来不及存的日志
    if (this.loggingCount > 1024) {
      meta && meta.ctx && meta.ctx.service.profiler.addItem('error', { type: 'kafka_full' });
      return;
    }

    meta = formatMeta(level, args, meta, this);

    meta.hostname = hostname;

    if (args.length > 0) {
      if (is.object(args[0])) {
        Object.assign(meta, args[0]);
        args = Array.prototype.slice.call(args, 1);
      } else if (typeof args[0] === 'string') {
        meta.type || (meta.type = 'message');
        meta.msg = util.format(...args);
      }
    }

    if (this.loggingCount > 784) {
      if (!meta.type || ([ 'INFO', 'VERBOSE', 'DEBUG' ].indexOf(meta.level) >= 0 && [ 'access', 'response', 'kafka_consumer-access' ].indexOf(meta.type) >= 0)) {
        meta.ctx && meta.ctx.service.profiler.addItem('error', { type: 'kafka_full' });
        return;
      }
    }

    if (meta.ctx) {
      meta.ctx.service.profiler.addItem('log', { type: 'kafka' });
    } else {
      // rhea.submit('log');
    }

    [ 'profile', 'detail', 'request' ].forEach(name => {
      if (meta[ name ] && (typeof meta[ name ] === 'object' || Array.isArray(meta[ name ]))) {
        meta[ name ] = JSON.stringify(meta[ name ], null, 2);
      }
    });

    meta = Object.assign({}, meta); // copy meta
    meta.toJSON = function () {
      delete this.message;
      return this;
    };

    delete meta.levelValue;
    delete meta.ctx;

    const messages: string = utils.format(meta.level || level, args, meta, this.options); // super.log(meta.level || level, args, meta) as any;

    this.loggingCount++;
    this.kafkaProducer.send([{
      topic: this.options.topic,
      messages,
    }], { omitError: true, timeout: 300 }).then(() => {
      this.loggingCount--;
    }).catch((err: any) => {
      debug('kafka logger failed', err);
      this.loggingCount--;
    });
  }
}
