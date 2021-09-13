import * as assert from 'assert';
import { sleep } from '../../app/lib/utils';
import { gaiaTester } from '../bootstrap';

gaiaTester('kafka', it => {
  it('consumer', async ctx => {
    it.app.config.kafka.consumerEnabled = true;
    const starter = it.app.startKafkaConsumer();
    it.app.config.kafka.consumerEnabled = false;

    await starter.then(async () => {
      await sleep(100);

      // send kafka message
      const res = await Promise.all([
        ctx.service.kafkaProducer.send([ {
          topic: 'gaiajs.test',
          messages: JSON.stringify({
            name: 'test',
          }),
        } ]),
        ctx.service.kafkaProducer.send([ {
          topic: 'gaiajs.test',
          messages: [ {
            name: 'test2',
          } ],
        } ]),
        ctx.service.kafkaProducer.send([ {
          topic: 'gaiajs.test',
          messages: {
            name: 'test3',
          },
        } ]),
      ]);

      assert(res.every(r => r), 'producer message sent');

      assert(await ctx.service.kafkaProducer.sendOneMessage('gaiajs.test', { name: 'test4' }), 'producer message sent');

      // 测试环境 端到端到延迟率 有时很长很长 1分钟都到不了
      // await sleep(1000);
      // assert(ctx.service.kafkaConsumerTest.count >= 4, `consumed ${ctx.service.kafkaConsumerTest.count}`);
    }).catch(err => {
      // assert(false, 'failed to start kafka consumer: ' + err.message);
      throw err;
    });
  })

  // it('producer', async ctx => {
  //   // try {
  //   //   await ctx.service.kafkaProducer.send([{
  //   //     topic:"fighting.order.was.paid.test",
  //   // tslint:disable-next-line: max-line-length
  //   //     messages:"{\"userId\":2320060,\"lessonKind\":1,\"orderId\":\"57744668106732660_60\",\"courseIds\":[732],\"sectionIds\":[{\"id\":7320101},{\"id\":7320102},{\"id\":7320103},{\"id\":7320104},{\"id\":7320105},{\"id\":7320106},{\"id\":7320107},{\"id\":7320108},{\"id\":7320109},{\"id\":7320110},{\"id\":7320111},{\"id\":7320112},{\"id\":7320113},{\"id\":7320114},{\"id\":7320201},{\"id\":7320202},{\"id\":7320203},{\"id\":7320204},{\"id\":7320205},{\"id\":7320206},{\"id\":7320207},{\"id\":7320208},{\"id\":7320209},{\"id\":7320210},{\"id\":7320211},{\"id\":7320212},{\"id\":7320301},{\"id\":7320302},{\"id\":7320303},{\"id\":7320304},{\"id\":7320305},{\"id\":7320306},{\"id\":7320307},{\"id\":7320308},{\"id\":7320401},{\"id\":7320402},{\"id\":7320403},{\"id\":7320501},{\"id\":7320502},{\"id\":7320503},{\"id\":7320504},{\"id\":7320505},{\"id\":7320506},{\"id\":7320507},{\"id\":7320508},{\"id\":7320509},{\"id\":7320510},{\"id\":7320511}],\"payPrice\":168,\"productId\":\"5d7a229b4124217ea01cdc4b\",\"productName\":\"苏科版初一秋季培优班\",\"assignId\":0,\"buyTime\":\"Fri Dec 27 2019 19:38:01 GMT+0800 (CST)\",\"familyId\":0}"
  //   //   }], 'bigData');

  //   //   assert(true, 'producer message sent');
  //   // } catch (err) {
  //   //   assert(false, 'error occurred: ' + err.message);
  //   // }
  // });
});
