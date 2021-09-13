import * as assert from 'assert';
import { tester } from '../bootstrap';
import { Context } from 'egg';

tester('test/services/sensitive.test.ts', async it => {
  it('normal', async (ctx: Context) => {
    ctx.app.config.userEncryptToken = 'abcdefg123456789';

    const encrypted = await ctx.service.sensitive.encryptMobile('13901234567');
    assert((await ctx.service.sensitive.decryptMobile(encrypted)) === '13901234567', 'should decrypt');

    assert(ctx.service.sensitive.maskingMobile('13901234567', 4) === '139****4567');
  });
});
