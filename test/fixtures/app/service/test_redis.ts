import BaseService from '../../../../app/lib/BaseService';
import bootstrap from '../../../../app/lib/bootstrap';

let lastMessage: any;
export default class TestRedisService extends BaseService {
  @bootstrap.onRedisPubSub('test_pubsub')
  async onPubsub(message: any, channel: string, pattern: string) {
    lastMessage = message;

    console.log('onPubsub', pattern, channel, message);
  }

  publish(message: any) {
    return this.ctx.service.redis.connectionOf().publish('test_pubsub', message);
  }

  get lastMessage() {
    return lastMessage;
  }
}
