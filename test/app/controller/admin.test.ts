'use strict';

// import * as assert from 'assert';
// import { sleep } from '../../../app/lib/utils';
import { gaiaTester as tester } from '../../bootstrap';

tester('test/app/controller/admin.test.ts', async it => {
  it('get admin login page', async (ctx, app) => {
    await app.httpRequest()
      .get('/admin/')
      .expect(404);
  });

  // async function initAdmin(ctx: Context) {
  //   const count = await ctx.service.admin.user.countAll();
  //   const permissionCount = await ctx.service.admin.permissionNode.countAll();
  //   const roleCount = await ctx.service.admin.role.countAll();
  //   if (!count && !permissionCount && !roleCount) {
  //     await ctx.service.admin.permissionNode.create({ _id: 'all', name: '所有权限', rules: [ '.*' ] });
  //     await ctx.service.admin.permissionNode.create({ _id: 'super', name: '超级权限', rules: [ '^(GET|POST):/admin/super/.*' ] });
  //     await ctx.service.admin.permissionNode.create({ _id: 'system', name: '系统管理权限', rules: [ '^(GET|POST):/admin/system/.*' ] });
  //     await ctx.service.admin.role.create({ _id: 'super', name: '超级管理员', allow: [ 'all', 'super' ] });
  //     await ctx.service.admin.role.create({ _id: 'system', name: '系统管理员', allow: [ 'all', 'system' ], deny: [ 'super' ] });
  //     await ctx.service.admin.role.create({ _id: 'admin', name: '管理员', allow: [ 'all' ], deny: [ 'super', 'system' ] });
  //     await ctx.service.admin.user.create({ _id: 'yonggang.zhang', username: 'yonggang.zhang', roles: [ 'super' ] as any });
  //   }
  // }

  // it('auth user', async (ctx, app) => {
  //   await initAdmin(ctx);

  //   app.mockService('admin.auth.casSso', 'authUser', () => {
  //     return ctx.service.admin.user.loadWithUserName('yonggang.zhang');
  //   });

  //   await app.httpRequest()
  //     .get('/admin/system/status')
  //     .expect(200);


  //   app.mockService('admin.auth.casSso', 'authUser', () => {
  //     return ctx.object.Admin.User.create({ _id: 'some_user' });
  //   });

  //   await app.httpRequest()
  //     .get('/admin/system/status')
  //     .expect(403);
  // });
});
