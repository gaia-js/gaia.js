import * as assert from 'assert';
import { gaiaTester as tester } from '../bootstrap';

tester('test/utils/redis.test.ts', async it => {
  it('add', async ctx => {
    await ctx.service.redis.set('test_key', 'test_value');
    assert((await ctx.service.redis.get('test_key')) === 'test_value');
    await ctx.service.redis.del('test_key');

    await ctx.service.redis.hset('test_key', 'key1', '1');
    assert(await ctx.service.redis.hget('test_key', 'key1') === '1');
    await ctx.service.redis.del('test_key');
  });
});
