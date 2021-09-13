// import { RouteableModule } from '../../..';
// import GaiaResponse from '../../lib/response';
// import { ResultStatus } from '../../service/ping_health';

// export default {
//   auth_required: false,
//   intranet_rpc: true,
//   routeOptions: {
//     ignoreAuth: true,
//   },

//   get: async function (this: RouteableModule) {
//     const result = await this.ctx.service.pingHealth.check();
//     const response = new GaiaResponse(result.result === ResultStatus.ok ? 'ok' : JSON.stringify(result.detail), this.ctx);
//     response.status = result.result < ResultStatus.fail ? 200 : 500;
//     response.type = 'text';

//     return response;
//   },
// };
