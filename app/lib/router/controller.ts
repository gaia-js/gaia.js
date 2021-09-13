import { Controller, Context } from 'egg';
import { BusinessError } from '../../errors';
import GaiaRequest from '../request';
import GaiaResponse from '../response';

export default class BaseController extends Controller {
  constructor(ctx: Context) {
    super(ctx);
  }

  async beforeRequest(routeResolver: any, req: GaiaRequest): Promise<true | GaiaResponse | BusinessError> {
    return true;
  }

  async afterRequest(routeResolver: any, req: GaiaRequest, resp: GaiaResponse) {
    //
  }
}
