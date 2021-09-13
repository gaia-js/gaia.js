import { EventEmitter } from 'events';
import { Kafka, Producer as KafkaJSProducer, logLevel, TopicMessages, LogEntry, KafkaConfig, ProducerConfig, ProducerBatch } from 'kafkajs';
import { Application } from 'egg';
import { sleep } from '../utils';
import * as assert from 'assert';
import * as rhea from 'rhea-cli';
import { BusinessError } from '../../errors';
import { Logger } from 'egg-logger';
const debug = require('debug')('gaia:kafka');

enum STATE {
  INIT,
  CONNECTING,
  CONNECTED,
}

const MAX_MESSAGE_SIZE = 1048576;

export default class KafkaProducer extends EventEmitter {
  private state: STATE;
  // private client: kafka.KafkaClient;
  private _kafkaProducer: KafkaJSProducer | undefined;
  private readonly app: Application;

  private readonly options: KafkaConfig;
  private readonly producerConfig: ProducerConfig;

  private _logger: Logger;

  constructor(brokerHost: string, app: Application, options?: Partial<KafkaConfig>, producerConfig?: Partial<ProducerConfig>) {
    super();

    this.app = app;

    (app && app.assert || assert)(brokerHost && typeof brokerHost === 'string', 'broker host not configured');

    this.options = {
      clientId: this.app.name,
      brokers: brokerHost.split(',').map(v => v.trim()),
      logLevel: logLevel.WARN,
      // sessionTimeout: 15000,
      // requestTimeout: 10000,
      // protocol: [ 'roundrobin' ],
      // fromOffset: 'latest',
      logCreator: (level => (msg: LogEntry) => {
        rhea.submit('error', { type: 'kafka_log' }, 1);
        console.error('send kafka failed', msg);
        // TODO: 可能会因为通过kafka发送的日志失败导致循环发送
        this.logger[ msg.label.toLowerCase() ]({ type: `kafka-${msg.namespace}`, msg: msg.log.message, detail: { ...msg.log } });
      }),
      ...options,
    };

    this.producerConfig = {
      allowAutoTopicCreation: true,
      ...producerConfig,
    };
  }

  get kafkaProducer(): KafkaJSProducer {
    if (this._kafkaProducer === undefined) {
      const kafka = new Kafka(this.options);

      const producer = kafka.producer(this.producerConfig);

      this._kafkaProducer = producer;
    }

    return this._kafkaProducer;
  }

  private async connect() {
    if (this.state === STATE.CONNECTED) {
      return;
    }

    if (this.state === STATE.CONNECTING) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error('Timeout while connecting kafka broker'));
        }, 3000);

        this.once('connected', connected => {
          clearTimeout(timer);

          if (connected) {
            resolve();
          } else {
            reject(new Error('failed to connect kafka broker'));
          }
        });
      });

      return;
    }

    let connected = true;
    try {
      this.state = STATE.CONNECTING;

      await this.kafkaProducer.connect();

      this.state = STATE.CONNECTED;
    } catch (err) {
      this.logger.error({ msg: 'connect failed', err });

      this.state = STATE.INIT;

      connected = false;
    }

    // @ts-ignore
    this.app && this.app.beforeClose(async () => {
      const producer = this.kafkaProducer;
      if (producer) {
        (this._kafkaProducer as any) = null;

        await producer.disconnect();
      }
    });

    this.emit('connected', connected);
  }

  private async _send(messages: TopicMessages[], options?: Exclude<ProducerBatch, keyof { topicMessages: any }>) {
    await this.connect();

    const res = await this.kafkaProducer.sendBatch({ ...(options || {}), topicMessages: messages });

    if (!res || res.some(item => item.errorCode)) {
      this.logger.error({ type: 'kafka_producer', msg: 'failed to produce kafka message', detail: { messages, res } });

      throw new BusinessError({ msg: 'send failed' });
    }
  }

  async send(
    messages: { topic: string; messages: string | object | (string | object)[] }[],
    options: { retry?: number; omitError?: boolean; timeout?: number } = { retry: 3, omitError: false }): Promise<any> {
    if (messages.length === 0) {
      return;
    }

    const topicMessages: TopicMessages[] = [];

    messages.forEach(item => {
      const topicMessage: TopicMessages = { topic: item.topic, messages: [] };

      if (Array.isArray(item.messages)) {
        item.messages.forEach(message => {
          const value = typeof message === 'object' ? JSON.stringify(message) : message;
          if (value.length > MAX_MESSAGE_SIZE) {
            this.logger.error({ type: 'kafka_producer', msg: 'kafka message too large', detail: { topic: item.topic, size: value.length, message: `${value.substring(0, 100)}...`} });
          }

          topicMessage.messages.push({ value });
        });
      } else {
        const value = typeof item.messages === 'object' ? JSON.stringify(item.messages) : item.messages;
        if (value.length > MAX_MESSAGE_SIZE) {
          this.logger.error({ type: 'kafka_producer', msg: 'kafka message too large', detail: { topic: item.topic, size: value.length, message: `${value.substring(0, 100)}...`} });
        }

        topicMessage.messages.push({ value });
      }

      topicMessages.push(topicMessage);
    });

    options = { retry: 3, omitError: false, ...(options || {}) };

    for (let i = 0; ; i++) {
      try {
        await this._send(topicMessages, options && options.timeout ? { timeout: options.timeout } : undefined);
        return;
      } catch (err) {
        if (options.omitError) {
          debug('kafka send error:', err);
          return;
        }

        if (i < (options.retry || 0)) {
          this.logger.error({ type: 'kafka_producer', msg: `kafka producer sends message failed, retrying(${i + 1}/3)...`, err, detail: { messages } });

          await sleep(500);
          continue;
        }

        // TODO: 应该考虑落盘
        this.logger.error({ type: 'kafka_producer', level: 'CRIT', msg: 'kafka producer sends message failed', err, detail: { messages } });
        throw err;
      }
    }
  }

  get logger() {
    return this._logger || this.app.logger;
  }

  set logger(logger: Logger) {
    this._logger = logger;
  }
}
