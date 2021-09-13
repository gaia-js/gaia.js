import GaiaResponse from '../lib/response';
import { RouteableModule } from '../lib/router/routers';

export default {
  auth_required: false,
  routeOptions: {
    ignoreAuth: true,
  },

  async get(this: RouteableModule) {
    const response = new GaiaResponse(this.ctx.app.name, this.ctx);
    response.type = 'text';

    return response;
  },
};
