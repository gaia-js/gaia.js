import BaseService from '../lib/BaseService';
// const debug = require('debug')('gaia:kafka.consumer');

export default class KafkaConsumer extends BaseService {
  async ignore(message: any, topic: string, name: string) {
    return false;
  }

  async handle(message: any, topic: string, name: string) {
    // debug(`kafka message arrived: name(${name}) topic(${topic}): `, JSON.stringify(message));
  }

  async prepareMessage(message: any, topic: string, name: string) {
    if (await this.ignore(message, topic, name)) {
      return false;
    }

    return true;
  }
}
