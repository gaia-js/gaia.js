import * as assert from 'assert';
import { gaiaTester as tester } from '../bootstrap';
import { Context } from 'egg';

tester('test/services/process.test.ts', async it => {
  it('exec process', async (ctx: Context) => {
    const { code, stdout, stderr } = await ctx.service.process.exec('ls', [__filename]);

    assert(code === 0 && stdout === `${__filename}\n` && stderr === '', 'should ls');
  });
});
