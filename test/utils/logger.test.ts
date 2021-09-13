import { assert } from "console";
import { KafkaTransport } from "../../lib/logger";
import { tester } from "../bootstrap";

tester(__filename, async it => {
  it.app.ready().then(() => {
    it.app.loggers.forEach((logger, name) => logger.set('kafka', new KafkaTransport({
        enable: true,
        broker: '10.8.40.36:9092,10.8.40.15:9092',
        topic: 'jsonlog',
        app: it.app, loggerName: name })));
  });

  it('kafka', async ctx => {
    ctx.logInfo({ type: 'gaia_test', msg: 'gaia unittest ' });

    assert(true, 'logger');

    ctx.logger.info({ msg: 'test msg' });
  });
});
