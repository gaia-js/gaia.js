import BaseService from '../lib/BaseService';

// 1Mb字节数
const MAX_MESSAGE_SIZE = 1048576;

export default class KafkaProducerService extends BaseService {
  async send(messages: { topic: string; messages: string | object | (string | object)[] }[], brokerName = 'default') {
    const kafkaProducer = this.ctx.app.getProducer(brokerName);
    this.ctx.assert(kafkaProducer, `cannot get producer of ${brokerName}`);
    try {
      if (!kafkaProducer) {
        throw new Error(`cannot find producer  of ${brokerName}`);
      }

      const item = this.ctx.service.profiler.createItem('kafka', { operator: 'produce', topic: messages[0] && messages[0].topic });

      messages.forEach(msg => {
        if (Array.isArray(msg.messages)) {
          msg.messages = msg.messages.map(message => {
            const value = typeof message === 'object' ? JSON.stringify(message) : message;
            if (value.length > MAX_MESSAGE_SIZE) {
              item.addTag('overload', 'overload');

              this.ctx.logError({ type: 'kafka_producer', msg: 'kafka message too large', detail: { brokerName, topic: msg.topic, size: value.length, message: `${value.substring(0, 100)}...`} });
            }

            return value;
          });
        } else {
          const value = typeof msg.messages === 'object' ? JSON.stringify(msg.messages) : msg.messages;
          if (value.length > MAX_MESSAGE_SIZE) {
            item.addTag('overload', 'overload');

            this.ctx.logError({ type: 'kafka_producer', msg: 'kafka message too large', detail: { brokerName, topic: msg.topic, size: value.length, message: `${value.substring(0, 100)}...`} });
          }

          msg.messages = value;
        }
      });

      await kafkaProducer.send(messages);

      if (item.last() > 100) {
        item.addTag('timeout', 'timeout');
      }

      this.service.profiler.addItem(item);

      this.ctx.logInfo({ type: 'kafka_producer', msg: 'kafka producer message sent', detail: { brokerName, messages } });

      return true;
    } catch (err) {
      this.service.profiler.addItem('error', { type: 'kafka', operator: 'produce' });

      this.ctx.logCritical({ type: 'kafka_producer', msg: 'kafka producer failed to send message', err, detail: { error: err, brokerName, messages } });

      return false;
    }
  }

  async sendOneMessage(topic: string, message: any, brokerName = 'default') {
    return this.send([{
      topic,
      messages: typeof message === 'object' || Array.isArray(message) ? JSON.stringify(message) : message,
    }], brokerName);
  }
}
