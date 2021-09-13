import { Context, Request } from 'egg';
import { ValidateOptions } from '../lib/request';

import AdminUser from '../object/admin/user';
// import { RouterOptions } from './router/blueprint';

export default {
  async auth(options?: ValidateOptions): Promise<boolean> {
    const ctx = (this as any as Request).ctx;

    if (options && options.admin) {
      if (!options || options.auth_required) {
        if (!await ctx.service.adminAuth.requireAuth(options)) {
          return false;
        }

        (ctx.app as any).assert(ctx.user, 'should has user');
      }
    } else if (!options || options.auth_required) {
      return await ctx.service.auth.requireAuth(options);
    }

    return true;
  },

  async validate(options?: ValidateOptions): Promise<boolean> {
    const ctx = (this as any as Request).ctx as any as Context;

    if (options && options.intranet_rpc) {
      if (!ctx.isFromIntranet()) {
        ctx.service.error.throwBusinessError({ ...ctx.app.errorCodes.ACCESS_DENIED, extra: { from: ctx.client_ip } });
        return false;
      }
    }

    if (options && options.admin) {
      if (!ctx.isFromOffice()) {
        ctx.service.error.throwBusinessError({ ...ctx.app.errorCodes.ACCESS_DENIED, extra: { from: ctx.client_ip } });
        return false;
      }
    }

    if (!await this.auth(options)) {
      ctx.service.error.throwBusinessError(ctx.app.errorCodes.NO_AUTH);
      return false;
    }

    if (options && options.auth_required && options.admin) {
      if (!ctx.user || !(ctx.user instanceof AdminUser) || !(await (ctx.user as AdminUser).hasPermission(this as any as Request))) {
        ctx.service.error.throwBusinessError(ctx.app.errorCodes.PERMISSION_DENIED);
        return false;
      }
    }

    return true;
  },

  // get method() {
  //   return (this as any as Request).ctx.method;
  // },

  // get url() {
  //   return (this as any as Request).ctx.URL;
  // },

  get pathname() {
    return (this as any as Request).URL.pathname;
  },

  getProperty(name: string) {
    const req = (this as any as Request);
    return (req.query && req.query[ name ]) || (req.body && req.body[ name ]);
  },

  getAsNumber(name: string) {
    return Number(this.getProperty(name));
  },

  isMobile() {
    const req = (this as any as Request);

    return /(android|ios|iphone|ipad|ipod)/i.test(req.get('user-agent'));
  },

  isWeixin() {
    const req = (this as any as Request);

    return /micromessenger/i.test(req.get('user-agent'));
  },

  isCli() {
    const req = (this as any as Request);

    return !/(chrome|safari)/i.test(req.get('user-agent'));
  },
};

