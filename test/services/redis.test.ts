import * as assert from 'assert';
// import { promisify } from 'util';
import { sleep } from '../../app/lib/utils';
import { gaiaTester } from '../bootstrap';

gaiaTester('redis', async it => {
  it('lock', async ctx => {
    let locked = false;
    let resolved = false;

    await ctx.service.redis.del('locker_test_key');
    assert((await ctx.service.redis.get('locker_test_key')) === null, 'locker should not exist');

    ctx.service.redis.lock('locker_test_key', async () => {
      locked = true;

      await sleep(500);

      locked = false;
    }, { wait: 2, expire: 60 }).then(() => {
      resolved = true;
    }).catch(err => {
      assert(false, 'failed to execute: ' + err.message);
    });

    // 可能需要多点时间，redis连接可能还没有建立
    await sleep(200);

    assert(locked, 'should locked');

    assert(await ctx.service.redis.get('locker_test_key'), 'should has lock key');

    let executed = false;
    await ctx.service.redis.lock('locker_test_key', async () => {
      assert(!locked);

      await sleep(1000);

      executed = true;
    }, { wait: 3, expire: 60 });

    assert(executed, 'should execute');

    assert(resolved, 'previous task should executed');
  });

  it('pubsub', async ctx => {
    await ctx.service.testRedis.publish('pubsub message');

    await sleep(1000);

    assert(ctx.service.testRedis.lastMessage === 'pubsub message', 'should receive');
  })
});
