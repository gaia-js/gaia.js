import { Controller } from 'egg';
import GaiaRequest from '../request';
import bpAdmin from './admin_blueprint';
import { BLUEPRINT_OPTIONS, RouterOptions } from './blueprint';

export abstract class AdminBaseController extends Controller {
  async beforeRequest(routeResolver: any, req: GaiaRequest) {
    if (!this.ctx.user) {
      if (!req.hasOwnProperty('auth_required') || req.auth_required) {
        const bpOptions = routeResolver[ BLUEPRINT_OPTIONS ] as RouterOptions;
        await this.ctx.service.adminAuth.startAuth(bpOptions as any);
        return false;
      }
    }

    return true;
  }
}

export default bpAdmin;
