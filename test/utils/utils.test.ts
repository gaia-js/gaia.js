import * as assert from 'assert';
import { tester } from '../bootstrap';
import { Context } from 'egg';

import { timeoutable, sleep, versionCompare, TimeoutError } from '../../app/lib/utils';
import { randomString } from '../../app/lib/string';
import { gunzip, gzip } from '../../app/lib/gzip';

tester('test/utils/utils.test.ts', async (it) => {
  it('versionCompare', async (ctx: Context) => {
    assert(versionCompare('1.0.0', '1.0.0') === 0);
    assert(versionCompare('1.2.0', '1.0.0') > 0);
    assert(versionCompare('1.12.0', '1.3.0') > 0);
    assert(versionCompare('2.0.0', '1.0.0') > 0);
    assert(versionCompare('1.12.0', '1.21.0') < 0);
    assert(versionCompare('1.4.0', '2.1.0') < 0);
  });

  it('timeout', async ctx => {
    await assert.rejects(timeoutable(sleep, 1000)(3000, false), err => err instanceof TimeoutError, 'should timeout');

    try {
      await timeoutable(sleep, 3000)(1000);
    } catch (err) {
      assert(false);
    }
  });

  it('gzip/gunzip', async ctx => {
    const src = Buffer.from(await randomString());
    assert(src.length > 0, 'get random string');

    assert(src.compare(await gunzip(await gzip(src))) === 0, 'should decompress compressed data');
  });
});
