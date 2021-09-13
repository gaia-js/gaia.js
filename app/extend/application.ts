import { Application, Context } from 'egg';
import KafkaProducer from '../lib/kafka/producer';
import * as assert from 'assert';
import EventProducer from '../lib/event/producer';
import KafkaConsumer, { IKafkaMessageConsumerOptions, KafkaEventName } from '../lib/kafka/consumer';
import errorCodes from '../errors/codes';
import CircuitBreaker from '../lib/circuit_breaker';
import TaskManager from '../lib/task/task_manager';
import ContextLogger from '../../lib/logger/context_logger';
import GlobalRuntimeRepository from '../lib/cache/global_runtime';
import { Singleton } from '../../typings/app';
import { Redis } from 'ioredis';
import { list as redisCommandList } from 'redis-commands';
import * as rhea from 'rhea-cli';
import Profiler from '../lib/profiler/profiler';

const KAFKA_PRODUCER = Symbol.for('gaia@kafkaProducer');
const KAFKA_CONSUMER = Symbol.for('gaia@kafkaConsumer');

let connectionCount = 0;


const ERROR_CODES = Symbol.for('gaia@errorCodes');
const CIRCUIT_BREAKER = Symbol.for('gaia@circuitBreaker');
const TASK_MANAGER = Symbol.for('gaia@taskManager');

const GLOBAL_CACHE = Symbol.for('gaia@globalCache');

const PROFILER = Symbol.for('gaia@profiler');

export default {
  get connectionCount(): number {
    return connectionCount;
  },

  incrConnectionCount(): number {
    return connectionCount++;
  },

  decrConnectionCount() {
    return connectionCount--;
  },

  cleanContext(ctx: Context) {
    ctx.service.cache && ctx.service.cache.runtime && ctx.service.cache.runtime.clear();
    ctx.cleanModelHooks && ctx.cleanModelHooks();
  },

  getProducer(brokerName: string = 'default'): KafkaProducer {
    const app: Application = this as any;

    if (!this[KAFKA_PRODUCER] || !this[KAFKA_PRODUCER][brokerName]) {
      if (!this[KAFKA_PRODUCER]) {
        this[KAFKA_PRODUCER] = {};
      }

      let kafkaConfig: any /*KafkaConsumerConfig*/ = app.config.kafka && ((app.config.kafka.producer && app.config.kafka.producer[brokerName]) || app.config.kafka[brokerName]);
      if (!kafkaConfig && brokerName === 'default' && (app.config.kafka && app.config.kafka.hasOwnProperty('host'))) {
        kafkaConfig = app.config.kafka;
      }
      assert(kafkaConfig, `Kafka Config not found!`);
      this[KAFKA_PRODUCER][brokerName] = new KafkaProducer(kafkaConfig.host, this as any);
    }

    return this[KAFKA_PRODUCER][brokerName];
  },

  get producer(): KafkaProducer {
    return this.getProducer();
  },

  get event(): typeof EventProducer {
    return EventProducer;
  },

  async startKafkaConsumer() {
    if (!this[ KAFKA_CONSUMER ]) {
      const app: Application = this as any;

      if (app.config.kafka?.consumer && app.config.kafka?.consumerEnabled) {
        const consumer = new KafkaConsumer(app);
        const starter = consumer.start()
          .catch(error => {
            (this as any).logger.log({ level: 'CRIT', msg: 'start kafka consumer failed', error });
          });

        this[ KAFKA_CONSUMER ] = this[ KAFKA_CONSUMER ];

        return starter;
      }

      throw new Error('consumer disabled or not configured');
    }

    return this[ KAFKA_CONSUMER ];
  },

  subscribeKafkaMessage(name: KafkaEventName, topic: string | string[], handler: (ctx: Context, message: any, topic: string, name: string) => Promise<boolean | void>, options?: IKafkaMessageConsumerOptions) {
    KafkaConsumer.subscribe(this as any, name, topic, async (ctx: Context, event: symbol, message: any, topicOfEvent: string, nameOfEvent: string) => {
      return nameOfEvent === name && (Array.isArray(topic) ? topic.includes(topicOfEvent) : (topicOfEvent === topic)) && await handler(ctx, message, topicOfEvent, name);
    }, options);
  },

  get errorCodes(): typeof errorCodes {
    if (!this[ERROR_CODES]) {
      this[ERROR_CODES] = errorCodes;
    }

    return this[ERROR_CODES];
  },

  get indexed_app_name() {
    const app = this as any as Application;
    return app.name;
  },

  get circuitBreaker(): CircuitBreaker {
    if (!this[CIRCUIT_BREAKER]) {
      this[CIRCUIT_BREAKER] = new CircuitBreaker(this as any);
    }

    return this[CIRCUIT_BREAKER];
  },

  get taskManager(): TaskManager {
    if (!this[TASK_MANAGER]) {
      this[TASK_MANAGER] = new TaskManager(this as any);
    }

    return this[TASK_MANAGER];
  },

  get ContextLogger() {
    return ContextLogger;
  },

  get globalCache(): GlobalRuntimeRepository {
    if (!this[ GLOBAL_CACHE ]) {
      this[ GLOBAL_CACHE ] = new GlobalRuntimeRepository(this as any as Application);
    }

    return this[ GLOBAL_CACHE ];
  },

  createProfileProxy<T extends object>(target: T, itemName: string, tags: { [key: string]: string }, options?: { timeout?: number, methods?: string[]} ): T {
    return new Proxy(target, {
      get(target: T, propKey: string) {
        if (typeof target[propKey] === 'function' && (!options || !options.methods || options.methods.indexOf(propKey) !== -1)) {
          return function(...params: any) {
            const result = target[ propKey ](...params);
            if (result && result.then) {
              return (async () => {
                const profileItem = new rhea.Item(itemName, { operator: propKey, ...(tags || {}) });
                try {
                  return await result;
                } finally {
                  if (profileItem.last() > (options && options.timeout || 100)) {
                    profileItem.addTag('timeout', 'timeout');
                  }

                  rhea.addItem(profileItem);
                }
              })();
            }

            return result;
          };
        }

        return target[propKey];
      },
    });
  },

  getRedis(name?: string) {
    const app: Application = this as unknown as Application;

    const redis = (app.redis as unknown as Singleton<Redis>).get(name || 'default') ||
      (!name &&
        ((app.config.redis.clients && (app.redis as unknown as Singleton<Redis>).get(Object.keys(app.config.redis.clients)[ 0 ])) ||
        app.redis));

    return redis && this.createProfileProxy(redis, 'redis', {}, { methods: redisCommandList });
  },

  get profiler() {
    if (!this[PROFILER]) {
      this[PROFILER] = new Profiler(this as unknown as Application);
    }

    return this[PROFILER];
  }
}
