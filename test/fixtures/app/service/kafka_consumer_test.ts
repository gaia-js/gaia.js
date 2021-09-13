import BaseService from "../../../../app/lib/BaseService";
import bootstrap from "../../../../app/lib/bootstrap";

let count = 0;
export default class KafkaConsumerTestService extends BaseService {
  @bootstrap.kafkaMessageConsumer('default', 'gaiajs.test')
  async onMessage(message: any, topic: string) {
    count++;
  }

  get count() {
    return count;
  }
}
