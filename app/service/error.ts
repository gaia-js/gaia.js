import BaseService from '../lib/BaseService';
import { BusinessError, ServerError } from '../errors';
import ErrorCodes from '../errors/codes';
import GaiaResponse from '../lib/response';

export default class ErrorService extends BaseService {
  createBusinessError(error: { code?: number; msg: string; status?: number; extra?: any; detail?: any }): BusinessError {
    return new BusinessError(error);
  }

  throwBusinessError(error: { code: number; msg: string; status?: number; extra?: any; detail?: any } | BusinessError) {
    throw error instanceof BusinessError ? error : (this.createBusinessError(error));
  }

  throwRequestValidateError(err: Error | unknown) {
    throw this.createBusinessError({ ...ErrorCodes.PARAMETER, extra: err });
  }

  dumpError(error: Error): any {
    if (error instanceof BusinessError) {
      const result = this.ctx.fail(error.code, error.msg, error.extra);

      return result && typeof result === 'object' && result.dump ? result.dump() : result;
    } else if (error instanceof ServerError) {
      const result = this.ctx.fail(error.code, error.msg);

      return result && typeof result === 'object' && result.dump ? result.dump() : result;
    }

    if (!this.app.deployment.isProduction() || this.ctx.isFromOffice()) {
      return this.ctx.fail(500, `系统错误: ${error.message}<br/>${error.stack}`);
    }

    return this.ctx.fail(500, '系统错误');
  }

  async outputError(error: Error) {
    if (error instanceof BusinessError) {
      this.ctx.status = error.status || 200;

      this.ctx.fullbody = true;
    } else if (error instanceof ServerError) {
      this.ctx.status = error.status || 200;

      this.ctx.fullbody = true;
    } else {
      this.ctx.status = 500;
    }

    const ret = this.dumpError(error);
    if (ret) {
      this.ctx.body = ret instanceof Promise ? (await ret) : ret;
    }

    let type = this.ctx.accepts2('html', 'text', 'json') as string|false;
    type = type || 'json';

    if (type !== 'json' && this.ctx.app.config.onerror && this.ctx.app.config.onerror[ type ]) {
      this.ctx.app.config.onerror[ type ](error, this.ctx);
      return;
    }

    // json
    this.ctx.set('Content-Type', 'application/json');
    if (typeof this.ctx.body === 'object') {
      if (this.ctx.body instanceof GaiaResponse) {
        this.ctx.body = await this.ctx.body.dump();
      } else {
        this.ctx.body = JSON.stringify(this.ctx.body);
      }
    }
  }
}
