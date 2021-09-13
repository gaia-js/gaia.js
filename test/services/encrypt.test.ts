import * as assert from 'assert';
import { tester } from '../bootstrap';
import { Context } from 'egg';

tester('test/services/encrypt.test.ts', async it => {
  it('normal', async (ctx: Context) => {
    const key = 'abcdefg12345678';

    const data = '12345678900987654321';
    const algorithm = 'aes-256-cbc';

    const [ encrypted, iv ] = await ctx.service.encrypt.encrypt(data, key, { algorithm });

    assert(data === await ctx.service.encrypt.decrypt(encrypted, key, { algorithm, iv }), 'should be equal');

    assert(typeof await ctx.service.encrypt.decrypt(encrypted, key + '1', { algorithm, iv }) === 'undefined', 'should not decrypt');
    assert(typeof await ctx.service.encrypt.decrypt('1' + encrypted, key, { algorithm, iv }) === 'undefined', 'should not decrypt');
    // assert(ctx.service.encrypt.decrypt(encrypted + '1', key) !== data, 'should not be equal');
    assert(typeof await ctx.service.encrypt.decrypt(data, key, { algorithm, iv }) === 'undefined', 'should not decrypt');
  });
});
