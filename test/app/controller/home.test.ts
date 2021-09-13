'use strict';

import * as assert from 'assert';
import { sleep } from '../../../app/lib/utils';
import { gaiaTester as tester } from '../../bootstrap';

tester('test/app/controller/home.test.ts', async it => {
  it('should assert', async ctx => {
    const pkg = require(`${ctx.app.baseDir}/package.json`);
    assert(ctx.app.config.keys.startsWith(pkg.name));
  });

  it('GET /', async (ctx, app) => {
    await app.httpRequest()
      .get('/')
      .expect(200)
      .expect('{"success":true,"code":0,"user":null}');
  });

  it('GET /ping', async (ctx, app) => {
    await app.httpRequest()
      .get('/ping')
      .expect(ctx.app.name)
      .expect(200);
  });

  it('GET /ping/health', async (ctx, app) => {
    await app.httpRequest()
      .get('/ping/health')
      // .expect('ok')
      .expect(200);
  });

  it('GET /error', async (ctx, app) => {
    await app.httpRequest()
      .get('/error').query('msg=13')
      .accept('json')
      .expect(200)
      .expect('{"success":false,"code":100,"msg":"error: 13"}');
  });

  it('GET /404', async (ctx, app) => {
    await app.httpRequest()
      .get('/404')
      .expect(404);
  });

  it('GET /validate', async (ctx, app) => {
    await app.httpRequest()
      .get('/validate')
      .expect(401);
  });

  it('GET /validate', async (ctx, app) => {
    //app.mockService()
    await app.httpRequest()
      .get('/validate')
      .expect(200)
      .expect({
        success: true,
        code: 0,
        user: { name: 'name' }
      });
  }, { user: { name: 'name' } });

  it('downgrade', async (ctx, app) => {
    await app.httpRequest()
      .get('/downgradable')
      .expect(200)
      .expect('{"success":true,"code":0}');

    await (app as any).downGrader.downGrade('get:/downgradable');
    await sleep(500);

    await app.httpRequest()
      .get('/downgradable')
      .expect(503)
      .expect('{"success":false,"code":903,"msg":"服务暂时不可用"}')
  });
});
