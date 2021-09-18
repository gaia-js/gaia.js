import { Kafka, Consumer as KafkaJSConsumer, KafkaMessage, logLevel, LogEntry } from 'kafkajs';
import { promisify } from 'util';
import * as chan from 'chan';
const debug = require('debug')('gaia:kafka/consumer');
// const hessian = require('hessian.js');
import { Application, Context } from 'egg';
import { EventHandler } from '../event/producer';
import { BusinessError } from '../../errors';
import ParallelExecutor from 'parallel-executors';
import { timeoutable } from '../utils';
import { deepFindObject } from '../obj_util';

export type KafkaEventName = string;

const EVENT_PREFIX = 'KAFKA_EVENT-';
const PREPARE_EVENT_PREFIX = 'KAFKA_PREPARE_EVENT-';

function eventName(name: KafkaEventName, topic: string) {
  return Symbol.for(`${EVENT_PREFIX}${name}:${topic}`);
}

function prepareEventName(name: KafkaEventName, topic: string) {
  return Symbol.for(`${PREPARE_EVENT_PREFIX}${name}:${topic}`);
}

interface KafkaConsumerConfig {
  host: string; // zookeeper地址
  kafkaHost: string;
  groupId: string;
  topics: string | string[];
  serialize: 'json' | 'Message_hessian' | undefined;
  options: {};
  handlerCount: number;
  disableAccessLog: boolean;
  workers?: number;
  fromBeginning?: boolean;
}

interface IKafkaMessagePrepareValue {
  ignore?: boolean;
  userid?: string | number;
}

class Consumer {
  private readonly app: Application;
  private readonly name: string;
  private readonly config: KafkaConsumerConfig;
  private consumer: KafkaJSConsumer | null;
  private ch: any;
  private worker: ParallelExecutor<{ topic: string; partition: number; message: KafkaMessage }>;

  constructor(app: Application, name: string, config: KafkaConsumerConfig) {
    this.app = app;
    this.name = name;
    this.config = config;
  }

  async start() {
    const kafka = new Kafka({
      clientId: this.app.name,
      brokers: (this.config.kafkaHost || this.config.host).split(',').map(v => v.trim()),
      // sessionTimeout: 15000,
      // requestTimeout: 10000,
      // protocol: [ 'roundrobin' ],
      // fromOffset: 'latest',
      ...(this.config.options || {}),
      logLevel: logLevel.WARN,
      logCreator: (level => (msg: LogEntry) => {
        if (msg.log.message.startsWith('Response Heartbeat') || msg.log.message === 'The group is rebalancing, re-joining') {
          return;
        }

        this.app.logger[ msg.label.toLowerCase() ]({ type: `kafka-${msg.namespace}`, msg: msg.log.message, detail: { ...msg.log } });
      }),
    });

    const consumer = kafka.consumer({
      groupId: this.config.groupId || `${this.app.name}-${this.name}-${this.app.config.env}`,
      maxInFlightRequests: 32,
      sessionTimeout: 120000,
      heartbeatInterval: 10000,
    });

    await consumer.connect();

    const ch = chan();
    const worker = new ParallelExecutor<{ topic: string; partition: number; message: KafkaMessage }>(
      (async function* () {
        while (!ch.done()) {
          const value = await promisify(ch)();
          if (value) {
            yield value;
          }
        }
      })(),
      {
        workers: this.config.workers || 5,
        executor: async message => {
          await this.handleMessage(message);
        },
      });

    // tslint:disable-next-line: no-floating-promises
    worker.execute();

    // @ts-ignore
    this.app.beforeClose(async () => {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      await this.stop();
    });

    this.ch = ch;
    this.worker = worker;
    this.consumer = consumer;

    await Promise.all((Array.isArray(this.config.topics) ? this.config.topics : [ this.config.topics ]).map(topic => consumer.subscribe({ topic, fromBeginning: this.config.fromBeginning || false })));

    // tslint:disable-next-line: no-floating-promises
    consumer.run({
      partitionsConsumedConcurrently: 3,
      eachMessage: async ({ topic, partition, message }) => {
        await promisify(ch({
          topic,
          partition,
          message: {
            ...message,
            key: message.key?.toString(),
            value: message.value?.toString(),
          },
        }))();
      },
    });

    if (!this.app.config.disableAccessLog) {
      debug('kafka consumer启动成功', { name: this.name, host: this.config.kafkaHost || this.config.host, topics: this.config.topics });
      // this.app.logger.info({ type: 'kafka_consumer', msg: 'kafka连接成功', detail: { host: this.config.host, topics: this.config.topics } });
    }

    return consumer;
  }

  decodeMessage(message: string): any {
    if (!this.config.serialize || this.config.serialize === 'json') {
      return JSON.parse(message);
    } else if (this.config.serialize === 'Message_hessian' || this.config.serialize === 'hessian') {
      const buffer = Buffer.from(message, 'binary');
      try {
        // eslint-disable-next-line no-bitwise
        if ((buffer.readInt32LE(0) & 0x0000ffff) === 0x0000c0ea || (buffer.readInt32LE(0) & 0x0000ffff) === 0x0000fdfd) { // MAGIC
          const index = buffer.indexOf('K:B:C', 0, 'ascii'); // KEEP_BACK_COMPATIBILITY，依赖于Message设置了这个type
          if (index > 0) {
            // const sliceEnd = index + 5 + 2 + buffer.readUInt8(index + 5 + 1);
            const sliceEnd = buffer.indexOf('}', index + 5 + 2, 'ascii') + 1;
            if (sliceEnd >= index + 5 + 2) {
              const body = buffer.slice(index + 5 + 2, sliceEnd).toString('ascii');
              return JSON.parse(body);
            }
          }
        }
      } catch (err) {
        // 忽略错误，尝试json decode，基本也是百分之百失败
      }

      // 尝试一下json解析
      return JSON.parse(message);
    }

    throw new BusinessError({ msg: `${this.config.serialize} not supported` });
  }

  async stop() {
    if (this.consumer) {
      const consumer = this.consumer;

      this.consumer = null;

      try {
        await timeoutable(async () => { await consumer.disconnect(); }, 1000)();
      } catch (err) {
        // omit timeout
      }

      if (this.ch) {
        const ch = this.ch;
        ch.close();
        this.ch = null;
      }

      try {
        await this.worker.waitFinished(5000);
      } catch (err) {
        this.app.logger.error({ level: 'NOTICE', type: 'kafka_consumer', msg: `kafka consumer '${this.name}' stopped with error`, err });
      }
    }
  }

  async handleMessage(message: { topic: string; partition: number; message: KafkaMessage & { key?: string; value?: string } }) {
    if (!message.message?.value) {
      return;
    }

    const ctx: Context = this.app.createAnonymousContext({ headers: { host: '' }, origin: '', protocol: 'kafka', method: 'POST', host: '', hostname: '', url: message.topic, body: message } as any);
    ctx.request.body = message;

    const prepareValue: IKafkaMessagePrepareValue = {};
    let logValue = {};

    const profileItem = ctx.service.profiler.createItem('kafka', { operator: 'consumer', topic: message.topic });
    try {
      const kafkaMessageValue: any = this.decodeMessage(message.message.value);

      if ((await ctx.service.kafkaConsumer.prepareMessage(kafkaMessageValue, message.topic, this.name)) === false) {
        return;
      }

      await ctx.event.fire(prepareEventName(this.name, message.topic), prepareValue, kafkaMessageValue, message.topic, this.name);
      if (prepareValue.ignore === true) {
        return;
      }

      logValue = { ...(prepareValue.userid ? { userid: prepareValue.userid } : {}) };

      if (!ctx.app.config.disableAccessLog && !this.config.disableAccessLog) {
        ctx.logInfo({ type: 'kafka_consumer-access', ...logValue, topic: message.topic, detail: { message } });
      }

      await ctx.service.kafkaConsumer.handle(kafkaMessageValue, message.topic, this.name);

      await ctx.event.fire(eventName(this.name, message.topic), kafkaMessageValue, message.topic, this.name);
    } catch (err) {
      ctx.logCritical({ type: 'kafka_consumer-error', ...logValue, msg: 'handle kafka message failed', err, detail: { message, consumer: this.config } });
    } finally {
      if (profileItem.last() > 1000) {
        profileItem.addTag('timeout', 'timeout');

        ctx.logNotice({ type: 'kafka_consumer-slowreq', ...logValue, msg: 'handle kafka message too slowly', profile: ctx.service.profiler.dump('medium'), detail: { message, consumer: this.config } });
      }

      ctx.service.profiler.addItem(profileItem);
    }

    this.app.cleanContext(ctx);
  }
}

export interface IKafkaMessageConsumerOptions {
  ignore?: ((this: Context, message: any, topic: string, name: string) => boolean);
  user?: string | ((message: any, topic: string, name: string) => string | { id: string | number });
}

export default class KafkaConsumer {
  private readonly app: Application;
  private readonly consumers: Map<string, Consumer>;

  constructor(app: Application) {
    this.app = app;

    if (this.app.config.kafka && this.app.config.kafka.consumer && this.app.config.kafka.consumerEnabled) {
      this.consumers = new Map<string, Consumer>();
      const consumerConfigs = this.app.config.kafka.consumer.topics ? { default: this.app.config.kafka.consumer } : this.app.config.kafka.consumer;
      Object.keys(consumerConfigs).forEach(name => {
        this.consumers.set(name, new Consumer(this.app, name, consumerConfigs[ name ]));
      });
    }
  }

  static eventName(name: KafkaEventName, topic: string) {
    return eventName(name, topic);
  }

  static subscribe(app: Application, name: KafkaEventName, topic: string | string[], handler: EventHandler, options?: IKafkaMessageConsumerOptions) {
    app.event.subscribe((Array.isArray(topic) ? topic : [ topic ]).map(t => prepareEventName(name, t)), async (ctx: Context, event: symbol, prepareValue: IKafkaMessagePrepareValue, message: any, topicOfEvent: string, nameOfEvent: string) => {
      if (prepareValue.ignore === undefined || prepareValue.ignore) {
        if (options?.ignore) {
          prepareValue.ignore = options.ignore.call(ctx, message, topicOfEvent, nameOfEvent);
        } else {
          prepareValue.ignore = false;
        }
      }

      if (nameOfEvent === name && topicOfEvent === topic && options) {
        if (options.user) {
          if (typeof options.user === 'string') {
            const user = deepFindObject(message, options.user).obj || undefined;
            if (user) {
              prepareValue.userid = `${user}`;
            }
          } else if (typeof options.user === 'function') {
            const user = options.user(message, topicOfEvent, name);
            if (user) {
              if (typeof user === 'string') {
                prepareValue.userid = user;
              } else {
                ctx.assert(user.id, 'user object should has `id` field');
                ctx.user = user;
              }
            }
          }
        }
      }
    });

    app.event.subscribe((Array.isArray(topic) ? topic : [ topic ]).map(t => this.eventName(name, t)), async (ctx: Context, event: symbol, ...params: [ any, string, string ]) => {
      if (options?.ignore && options.ignore.call(ctx, ...params) === true) {
        return;
      }

      return handler(ctx, event, ...params);
    });
  }

  async start() {
    if (this.consumers) {
      await Promise.all([ ...this.consumers.values() ].map(consumer => consumer.start()));
    }
  }

  async stop() {
    this.consumers && await Promise.all([ ...this.consumers.values() ].map(consumer => consumer.stop()));
  }
}
