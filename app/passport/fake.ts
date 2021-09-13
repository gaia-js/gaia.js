import { Application, Context } from 'egg';

import { Strategy } from 'passport';

module.exports = (app: Application) => {
  return new class extends Strategy {
    async authenticate(req: any, options?: any) {
      const ctx = req.ctx as Context;
      try {
        const bpOptions = options && options.bpOptions;
        if (ctx.app.config.fakeLoginUser && (!bpOptions || bpOptions.auth_required) && !ctx.app.deployment.isProduction()) {
          // const user = await ctx.service.user.loginUser.load(Number(ctx.app.config.fakeLoginUser));
          // if (user) {
          //   this.success(user);
          //   return;
          // }
        }

        this.fail();
      } catch (e) {
        this.error(e);
      }
    }
  }();
};
