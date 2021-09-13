'use strict';

import * as assert from 'assert';
import { gaiaTester as tester } from '../../bootstrap';
import * as supertest from 'supertest';

tester('test/app/controller/home.test.ts', async it => {
  it('session', async (ctx, app) => {
    const agent = supertest.agent(app.callback());

    let result = await agent.get('/session');
    assert(result.status === 200, 'should get');

    const visited = result.body.visited;

    result = await agent.get('/session');
    assert(result.status === 200 && result.body.visited === visited + 1, 'should get');

    result = await agent.get('/clear_session');
    assert(result.status === 200, 'clear session');

    result = await agent.get('/session');
    assert(result.status === 200 && result.body.visited === 0, 'should get');
  })
});
