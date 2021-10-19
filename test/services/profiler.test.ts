import { assert } from 'console';
import tester from '../bootstrap';

tester(__filename, it => {
  it('profile', async ctx => {
    await ctx.service.testProfiler.testMethod();

    assert(true, 'test method');

    await ctx.service.testProfiler.testMethod2();

    assert(true, 'test method');
  });
})
