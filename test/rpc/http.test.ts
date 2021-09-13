import * as assert from 'assert';
import { tester } from '../bootstrap';

tester('test/rpc/http.test.ts', async (it) => {
  it('http', async ctx => {
    const res = await ctx.service.rpc.http.get('https://www.17zuoye.com', {}, { followRedirect: true, dataType: 'text' });
    assert(res.httpResult.status === 200, 'http call');
  });
});
