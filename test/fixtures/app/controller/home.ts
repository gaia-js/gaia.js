import bp from "../../../../app/lib/router/blueprint";
import BaseController from '../../../../app/lib/router/controller'
import { obscureBodyPhone } from '../../../../app/lib/router/logFilters';
@bp.controller({ downGradable: true })
export default class HomeController extends BaseController {
  @bp.get('/', { auth_required: false })
  async index() {
    return this.ctx.success({ user: this.ctx.user });
  }

  @bp.get('/error', { auth_required: false })
  async error() {
    throw this.ctx.service.error.createBusinessError({ msg: `error: ${this.ctx.query.msg}` });
  }

  @bp.get('/validate')
  async validate() {
    return this.ctx.success({ user: this.ctx.user });
  }

  @bp.get('/downgradable', { auth_required: false, downGradable: true })
  async downgradable() {
    return this.ctx.success({});
  }

  @bp.get('/session', { auth_required: false, logFilters: [ obscureBodyPhone('phone') ] })
  async session() {
    this.ctx.session.visited = (this.ctx.session.visited ?? -1) + 1;

    return this.ctx.success({ visited: this.ctx.session.visited});
  }

  @bp.get('/clear_session', { auth_required: false })
  async clearSession() {
    this.ctx.session = null;

    return this.ctx.success();
  }
}
