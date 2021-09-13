// tslint:disable: max-classes-per-file

import { Context } from 'egg';
import BaseService from '../../lib/BaseService';
import { LOG_DATA } from '../../lib/rpc/http/logFilters';
import * as _ from 'lodash';
import grpcProto from '../../lib/rpc/grpc/proto';
import { promisify } from 'util';
import { ServerError } from '../../errors';

export type RequestOptions = Partial<{
  circuitBreaker?: boolean;
  circuitOptions?: Partial<{
    group: string;
    timeout: number;
    circuitDuration?: number;
    isPromise?: boolean;
    notBrakeTimeout: boolean;
    fallback: () => Promise<any>;
    isFailure: (err: Error) => boolean;
  }>;
  logFilter?: Array<(log: LOG_DATA) => void>;
}>;

export class ApiError extends Error {
  response: any

  constructor(msg: string, res: any) {
    super(msg);

    this.response = res;
  }
}

export class ApiResult<T = any> {
  result?: T;

  get success(): boolean {
    return true;
  }

  get errorInfo(): string {
    return '';
  }

  getData() {
    return this.result;
  }
}

export type IApiResult<T> = ApiResult<T> & {[K in keyof T]: T[K]};

export class GrpcInvoker<TRequestOptions extends RequestOptions = RequestOptions> {
  ctx: Context

  protected _packageName: string;
  protected _service: string;
  protected _address: string;
  protected _methodName: string;
  protected _options: TRequestOptions;

  constructor(ctx: Context) {
    Object.defineProperty(this, 'ctx', {
      enumerable: false,
      writable: false,
      value: ctx,
    });
  }

  packageName(packageName: string) {
    this._packageName = packageName;
    return this;
  }

  service(service: string) {
    this._service = service;
    this.ctx.assert(grpcProto.hasService(this._packageName, this._service), `${this._packageName}.${service} not found`);
    return this;
  }

  address(address: string) {
    this._address = address;
    return this;
  }

  retry(retry: number) {
    this._options = {...(this._options || {}),  retry};
    return this;
  }

  options(options?: TRequestOptions) {
    if (!options) {
      return this;
    }

    if (options.circuitOptions) {
      options.circuitOptions = {...(this._options.circuitOptions || {}), ...options.circuitOptions};
    }

    this._options = {...(this._options || {}), ...options};
    return this;
  }

  methodName(methodName: string) {
    this._methodName = methodName;
    return this;
  }

  logFilter(log: LOG_DATA) {
    log = _.cloneDeep(log);

    this._options.logFilter?.forEach(filter => {
      filter(log);
    });

    return log;
  }

  // tslint:disable-next-line: cyclomatic-complexity
  async invoke<T = any, TReq = any>(req: TReq): Promise<T> {
    const headers: { [ name: string ]: string | string[] } = {};
    for (const name of Object.keys(this.ctx.headers)) {
      if ([ 'host', 'content-length', 'content-type', 'accept-encoding' ].indexOf(name.toLowerCase()) === -1) {
        if (name.toLocaleLowerCase() === 'x-real-ip') {
          headers['X-Client-Ip'] = headers[name];
          continue;
        } else if (name.toLowerCase() === 'x-forwarded-for') {
          headers['X-Forwarded-For-O'] = headers[name];
          continue;
        }

        headers[name] = this.ctx.headers[name]!;
      }
    }

    if (!headers['x-request-id']) {
      headers['x-request-id'] = this.ctx.guid;
    }

    headers['x-request-by'] = this.ctx.app.name;

    // if (this._options.circuitBreaker) {
    //   this._options.circuitOptions = {
    //     group: 'api',
    //     timeout: 2000,
    //     circuitDuration: 30000, // 熔断30秒后重新尝试
    //     isPromise: true,
    //     notBrakeTimeout: true,
    //     isFailure: () => {
    //       return false;
    //     }, ...(this._options.circuitOptions || {})};
    // }

    // const options = {...(this._options || {})};
    // [ 'circuitBreaker' ].forEach(name =>  delete options[ name ]);

    const item = this.ctx.service.profiler.createItem('grpc');

    try {
      const client = grpcProto.newClient(this._packageName, this._service, this._address || 'localhost:50051');

      if (!client[this._methodName]) {
        throw new ServerError({ msg: 'method not found' });
      }

      const response = await promisify(client[this._methodName].bind(client))(req);

      return response;
    } catch (err) {
      item.addTag('error', err instanceof Error ? err.name : 'error');

      this.ctx.logCritical({ type: `grpc_call-error`, msg: `failed to call ${this._packageName}.${this._service}.${this._methodName}`, err, detail: { req } });

      throw err;
    } finally {
      if (item.last() > 500) {
        item.addTag('timeout', 'timeout');
      }

      this.ctx.service.profiler.addItem(item);
    }
  }
}

export default class GrpcService extends BaseService {
  invoker(packageName: string, service: string, methodName?: string, options?: RequestOptions) {
    let invoker = new GrpcInvoker(this.ctx);

    invoker = invoker.packageName(packageName).service(service);
    if (methodName) {
      invoker = invoker.methodName(methodName);
    }

    if (options) {
      invoker = invoker.options(options);
    }

    return invoker;
  }
}
