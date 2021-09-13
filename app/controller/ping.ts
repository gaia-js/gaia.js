import { Controller } from 'egg';
import bp from '../lib/router/blueprint';
import PingHealthService, { ExamineResult, ResultStatus } from '../service/ping_health';
import service from '../lib/di/service';

export default class PingController extends Controller {
  // @bp.get('/ping', { auth_required: false })
  // async index() {
  //   const response = new GaiaResponse(this.ctx.app.name);
  //   response.type = 'text';

  //   return response;
  // }

  @service()
  pingHealth: PingHealthService;

  @bp.get('/ping/health', { auth_required: false })
  async health() {
    if (!this.ctx.isFromIntranet() && !this.ctx.isFromOffice()) {
      this.ctx.service.error.throwBusinessError({ code: 403, msg: `access denied from ${this.ctx.client_ip}`, status: 403 });
    }

    let status = ResultStatus.ok;

    const result = await this.pingHealth.check();

    function formatResult(result: ExamineResult) {
      if (result.result > status) {
        status = result.result;
      }

      if (!result.detail) {
        return ResultStatus[result.result];
      }

      if (result.detail) {
        switch (typeof result.detail) {
          case 'string':
            return `${ResultStatus[result.result]}: ${result.detail}`;
            break;

          case 'object':
            if (result.detail instanceof Error) {
              return `${ResultStatus[result.result]}: ${result.detail.message}`;
            } else {
              const detail = {};

              for (const item of Object.keys(result.detail)) {
                detail[item] = result.detail[item] && formatResult(result.detail[item]);
              }

              return detail;
            }
            break;

          default:
            return ResultStatus[result.result];
        }
      }
    }

    this.ctx.type = 'text';
    this.ctx.status = status < ResultStatus.fail ? 200 : 500;
    return formatResult(result);
  }
}
