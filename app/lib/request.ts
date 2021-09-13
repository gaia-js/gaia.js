import { Context } from 'egg';
import BasePropertiesObject, { ObjectProperties, enumerable } from '../object/BasePropertiesObject';
import AdminUser from '../object/admin/user';
import { RouterOptions } from './router/blueprint';
import { LOG_DATA } from '../extend/context';

export type MiddlewareFunction = (ctx: Context, next: () => Promise<void>) => Promise<void>;

export type LogFilter = (log: LOG_DATA) => void;

export interface ValidateOptions {
  /**
   * 是否要求验证用户，使用ctx.service.auth.authUser()来验证
   */
  auth_required?: boolean;

  /**
   * 是否限制仅限管理员调用，使用ctx.service.adminAuth.authUser()来验证
   */
  admin?: boolean;

  /**
   * 验证用户。已废弃，使用passport代替
   */
  user_auth?: boolean;

  /**
   * 是否限制只有内网（区别于办公网）才能调用
   */
  intranet_rpc?: boolean;

  /**
   * 可扩展选项。关于用户鉴权的选项应该使用passport，其他应该首选考虑使用middlewares选项
   */
  extensions?: any;

  /**
   * 指定passport来验证用户，默认为['cookie', 'sessionKey']，对admin默认为['adminCasSso']
   */
  passport?: string[];

  /**
   * 指定admin验证方式，在app/service/admin/auth/中实现
   */
  adminAuth?: string[];

  /**
   * 以默认或指定的模块名称开启降级
   */
  downGradable?: boolean | string;

  /**
   * 自定义的middleware
   */
  middlewares?: Array<((options?: RouterOptions) => MiddlewareFunction)>;

  /**
   * 可以用来对日志中记录的数据进行脱敏
   */
  logFilters?: LogFilter[];
}

export type RequestClass<T extends GaiaRequest = GaiaRequest> = { new(...args: any[]): T, accessorName?: string, path?: string | RegExp, method?: string}

export default class GaiaRequest extends BasePropertiesObject {
  @enumerable(false)
  auth_required: boolean|undefined

  constructor(params: ObjectProperties<any>, ctx: Context) {
    super(params, ctx);

    Object.defineProperty(this, 'ctx', {
      enumerable: false,
      configurable: true,
      value: ctx,
    });
  }

  static buildRequest<T extends GaiaRequest = GaiaRequest>(ctx: Context, requestType?: RequestClass<T>): T {
    requestType = (requestType || GaiaRequest) as RequestClass<T>
    const req = new requestType(Object.assign({}, ctx.query || {}, ctx.request.body || {}), ctx);
    req.ctx || Object.defineProperty(req, 'ctx', {
      enumerable: false,
      configurable: true,
      value: ctx,
    });

    return req;
  }

  async auth(options?: ValidateOptions): Promise<boolean> {
    if (options && options.admin) {
      if (!this.hasOwnProperty('auth_required') || this.auth_required) {
        if (!await this.ctx.service.adminAuth.requireAuth(options)) {
          return false;
        }

        (this.ctx.app as any).assert(this.ctx.user, 'should has user');
      }
    } else if ((this.hasOwnProperty('auth_required') && this.auth_required) || (options && options.auth_required)) {
      return await this.ctx.service.auth.requireAuth(options);
    }

    // const user = await this.ctx.service.auth.authUser(this.ctx.request, options);
    // if (user && !this.ctx.user) {
    //   this.ctx.user = user as any;
    // }

    return true;
  }

  async validate(options?: ValidateOptions): Promise<boolean> {
    if (options && options.intranet_rpc) {
      if (!this.ctx.isFromIntranet()) {
        this.ctx.service.error.throwBusinessError({ ...this.ctx.app.errorCodes.ACCESS_DENIED, extra: { from: this.ctx.client_ip } });
        return false;
      }
    }

    if (options && options.admin) {
      if (!this.ctx.isFromOffice()) {
        this.ctx.service.error.throwBusinessError({ ...this.ctx.app.errorCodes.ACCESS_DENIED, extra: { from: this.ctx.client_ip } });
        return false;
      }
    }

    if (!await this.auth(options)) {
      this.ctx.service.error.throwBusinessError(this.ctx.app.errorCodes.NO_AUTH);
      return false;
    }

    if (this.auth_required && options && options.admin) {
      if (!this.ctx.user || !(this.ctx.user instanceof AdminUser) || !(await (this.ctx.user as AdminUser).hasPermission(this))) {
        this.ctx.service.error.throwBusinessError(this.ctx.app.errorCodes.PERMISSION_DENIED);
        return false;
      }
    }

    return true;
  }

  get method() {
    return this.ctx.method;
  }

  get url() {
    return this.ctx.URL;
  }

  get pathname() {
    return this.ctx.URL.pathname;
  }

  get(name: string) {
    return this.getProperty(name as any);
  }

  getAsNumber(name: string) {
    return Number(this.get(name));
  }
}
