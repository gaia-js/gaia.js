import * as assert from 'assert';
import { gaiaTester as tester } from '../bootstrap';
import { Context } from 'egg';
import { PassThrough } from 'stream';
import { randomString } from '../../app/lib/string';

tester('test/services/gridfs.test.ts', async it => {
  it('put', async (ctx: Context) => {
    const srcContent = 'test content ' + await randomString(32);

    const id = await ctx.service.gridfs.put(Buffer.from(srcContent), 'gaiajs.test_content.txt', { conn: 'gfs' });
    assert(id, 'should put');

    const reader = await ctx.service.gridfs.get(id, { conn: 'gfs' });

    const content = await new Promise((resolve, reject) => {
      let buffer = '';

      const forBuffer = new PassThrough();
      forBuffer.on('data', chunk => {
        buffer += chunk.toString();
      }).on('error', err => {
        reject(err);
      }).on('close', () => {
        resolve(buffer);
      }).on('finish', () => {
        resolve(buffer);
      });
      reader.pipe(forBuffer);
    });

    assert(content === srcContent);

    await ctx.service.gridfs.remove(id, { conn: 'gfs' });
  });
});
