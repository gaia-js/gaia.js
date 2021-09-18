import { Application, Context } from 'egg';
import { EventEmitter } from 'events';
import { Redis } from 'ioredis';
import { Stage } from './deployment';
import { IKafkaMessageConsumerOptions } from './kafka/consumer';
import ObjectProfiler from './object_profiler';
import { deepFindObject } from './obj_util';
import { createClient } from './redis';

declare global {
  namespace NodeJS {
    interface Global {
      _bootstrap: Bootstrap;
    }
  }
}


// let _bootstrap: Bootstrap;

// export interface ScheduleInfo {
//   cron: string;
//   interval: string;
//   type: 'worker'|'all';
//   env: string[];
//   disable: boolean;
//   immediate: boolean;
// }

export class Bootstrap {
  readonly app: Application

  private constructor(app?: Application) {
    app && Object.defineProperty(this, 'app', {
      enumerable: false,
      writable: false,
      configurable: true,
      value: app,
    });
  }

  static initialize(app?: Application) {
    if (!global._bootstrap) {
      global._bootstrap = new Bootstrap(app);
    } else if (app) {
      Object.defineProperty(global._bootstrap, 'app', {
        enumerable: false,
        writable: false,
        configurable: true,
        value: app,
      });
    }

    return global._bootstrap;
  }

  static instance() {
    return this.initialize();
  }

  beforeStart() {
    return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
      this.app.beforeStart(() => {
        descriptor.value.call(target, this.app);
      });
    };
  }

  ready() {
    return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
      this.app.ready(() => {
        descriptor.value.call(target, this.app);
      });
    };
  }

  // schedule(scheduleInfo: Partial<ScheduleInfo>) {
  //   return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
  //     this.app.ready(() => {
  //       this.app.runSchedule
  //     });
  //   };
  // }

  kafkaMessageConsumer(kafkaName: string, topicName: string | string[], options?: Partial<IKafkaMessageConsumerOptions>) {
    return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
      this.app.beforeStart(() => {
        this.app.assert(target.pathName, '未知的kafka consumer挂载');
        this.app.subscribeKafkaMessage(kafkaName, topicName, async (ctx: Context, message: any, topic: string, name: string) => {
          const { obj: service } = deepFindObject(ctx, target.pathName);
          // 使用 descriptor.value， 而不是 service[propertyKey] 使得执行不会被扩展到子类上
          // 如果没有显式地申明执行就不执行，毕竟decorator是标注在具体方法上的
          return await descriptor.value.call(service, message, topic, name);
        }, options);
      });
    };
  }

  event(eventName: symbol) {
    return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
      this.app.beforeStart(() => {
        this.app.assert(target.pathName, '未知的event subscriber挂载');
        this.app.event.subscribe(eventName, async (ctx: Context, event: symbol, ...params) => {
          const service = target.pathName ? deepFindObject(ctx, target.pathName).obj : null;
          return await descriptor.value.call(service, event, ...params);
        });
      });
    };
  }

  onRedisPubSub(pattern: string, name?: string) {
    const emitter = new EventEmitter();
    let client: Redis;

    this.app.ready(() => {
      client = createClient(this.app, name, { noCluster: true }) as Redis;

      client.once('ready', async () => {
        client.on('pmessage', async (pattern: string, channel: string, message: any) => {
          emitter.emit('message', pattern, channel, message);
        });

        await client.psubscribe(pattern);
      });

      if (this.app.deployment.stage !== Stage.Unittest) {
        this.app.beforeClose(() => {
          client && client.disconnect();

          emitter.removeAllListeners('message');
        });
      }
    });

    return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
      emitter.on('message', async (pattern: string, channel: string, message: any) => {
        try {
          const ctx = this.app.createAnonymousContext({
            origin: '',
            protocol: 'pubsub',
            method: 'POST',
            host: '',
            hostname: '',
            url: `redisPubsub/${channel}`,
            body: {
              pattern, channel, message,
            }
          } as any);

          let receiver: any;

          if (target.pathName) {
            receiver = target.pathName ? deepFindObject(ctx, target.pathName).obj : null;
          } else if (target.constructor && target.constructor.instance && target.constructor.instance instanceof target.constructor) {
            receiver = target.constructor.instance;
          }

          if (!receiver) {
            receiver = ctx;
          }

          await descriptor.value.call(receiver, message, channel, pattern);
        } catch (error) {
          this.app.logger.error({ type: 'redis_pubsub', msg: 'handle pubsub message failed', detail: { pattern, channel, message, error } });
        }
      });
    };
  }

  profiler(options?: Partial<{ name?: string; tags?: { [key: string]: string; }; timeout: number }>) {
    return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
      const oldValue = target[propertyKey];
      this.app.assert(typeof oldValue === 'function', 'profiler target should be a function');
      Object.defineProperty(target, propertyKey, {
        configurable: true,
        value: function(...args: any[]) {
          return ObjectProfiler.promise(oldValue.call(target, ...args), options && options.name || propertyKey, options && options.tags || {}, { ...options, ctx: target.ctx });
        }
      });
    };
  }
}

export const bootstrap = Bootstrap.instance();
export default bootstrap;
