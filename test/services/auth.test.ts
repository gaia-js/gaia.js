// import * as assert from 'assert';
import { assert } from 'console';
import { ObjectID } from 'mongodb';
import { tester } from '../bootstrap';

tester('test/services/auth.test.ts', async it => {
  it('issue', async ctx => {
    ctx.app.config.token_key = 'abcdefg123456789';

    const userId = new ObjectID().toHexString();
    const token = await ctx.service.auth.issueToken(userId);

    assert(token, 'should issue token');

    assert((await ctx.service.auth.validateToken(token)) === userId, 'validate token');
  });
});
