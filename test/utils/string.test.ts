import * as assert from 'assert';
import { tester } from '../bootstrap';
import { Context } from 'egg';

import { sensitivePhone } from '../../app/lib/string';

tester('test/utils/string.test.ts', async (it) => {
  it('phone', async (ctx: Context) => {
    assert(sensitivePhone('12345678901', 3) === '123*****901');
    assert(sensitivePhone('1') === '1');
    assert(sensitivePhone('') === '');
    assert(sensitivePhone(null as any) === null);
  });
});
