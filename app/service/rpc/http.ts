// tslint:disable: max-classes-per-file

import { Context } from 'egg';
import BaseService from '../../lib/BaseService';
import BasePropertiesObject from '../../object/BasePropertiesObject';
import { RequestOptions2, HttpMethod, HttpClientResponse } from 'urllib';
import { LOG_DATA } from '../../lib/rpc/http/logFilters';
import * as _ from 'lodash';

export type RequestOptions = Partial<RequestOptions2 & {
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

export class ApiResult<T extends {[K: string]: any} = {[K: string]: any}> extends BasePropertiesObject {
  result?: string;

  info?: string;
  message?: string;

  private _httpResult: HttpClientResponse<T>

  get httpResult(): HttpClientResponse<T> {
    return this._httpResult;
  }

  set httpResult(value: HttpClientResponse<T>) {
    Object.defineProperty(this, '_httpResult', {
      enumerable: false,
      value,
    });
  }

  get success(): boolean {
    const data = this.getProperties();

    if (data) {
      if (data.hasOwnProperty('success')) {
        return data.success!;
      }

      if (data.hasOwnProperty('result') && typeof data.result === 'string') {
        return data.result === 'success';
      }

      return true;
    }

    return false;
  }

  get errorInfo(): string {
    return this.getProperty('info', '') as string || this.getProperty('message', '') as string;
  }
}

export type IApiResult<T> = ApiResult<T> & {[K in keyof T]: T[K]};

export class HttpRpcInvoker<TRequestOptions extends RequestOptions = RequestOptions> {
  ctx: Context

  protected _name: string;
  protected _host: string;
  protected _path: string;
  protected _options: TRequestOptions;
  protected _call_name: string;

  constructor(ctx: Context) {
    Object.defineProperty(this, 'ctx', {
      enumerable: false,
      writable: false,
      value: ctx,
    });

    this._name = 'http';
    this._call_name = 'http';

    this._options = {
      method: 'POST',
    } as TRequestOptions;
  }

  method(method: HttpMethod) {
    this.options({ method } as TRequestOptions);
    return this;
  }

  host(host: string) {
    this._host = host;
    return this;
  }

  name(name: string) {
    this.ctx.assert(name && this.ctx.app.config.rpc[name] && this.ctx.app.config.rpc[name].host, `${name} config not found`);
    this._name = name;
    this._host = this.ctx.app.config.rpc[name].host;
    return this;
  }

  path(path: string) {
    this._path = path;
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

  logFilter(log: LOG_DATA) {
    log = _.cloneDeep(log);

    this._options.logFilter?.forEach(filter => {
      filter(log);
    });

    return log;
  }

  // tslint:disable-next-line: cyclomatic-complexity max-func-body-length
  async invoke<T = any>(params?: any): Promise<IApiResult<T>> {
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

    params = typeof params === 'object' ? { ...(params || {}) } : params;

    const api = this._path;

    let url: string;
    if (this._host) {
      if (api.startsWith('/')) {
        url = this._host + api;
      } else {
        url = `${this._host}/${api}`;
      }
    } else {
      url = api;
    }

    headers['x-request-by'] = this.ctx.app.name;

    if (this._options.circuitBreaker) {
      this._options.circuitOptions = {
        group: 'api',
        timeout: 2000,
        circuitDuration: 30000, // 熔断30秒后重新尝试
        isPromise: true,
        notBrakeTimeout: true,
        isFailure: () => {
          return false;
        }, ...(this._options.circuitOptions || {})};
    }

    const options = {...(this._options || {})};
    [ 'circuitBreaker' ].forEach(name =>  delete options[ name ]);

    const urlForLog = this.logFilter({ url }).url!;

    try {
      const res = await this.ctx.curl(url, {
        contentType: 'application/x-www-form-urlencoded',
        dataType: 'json',
        data: params,
        headers,
        gzip: true,
        timeout: [ 3000, 3100 ],
        timing: true,
        ...{
          profileItem: this.ctx.service.profiler.createItem(`${this._call_name}_call`, { api, type: this._name || this._host }),
          profileSlow: 1000,
          profileDesc: this.logFilter({ url, params })
        }, ...options});

      if (res.status < 200 || res.status >= 300) {
        this.ctx.logCritical({
          type: `${this._call_name}_call-error`,
          msg: `invalid ${this._call_name}_call/${this._name} result (${res.status}: ${res.res?.statusMessage})`,
          detail: this.logFilter({ url, params, res: res.res, data: res.data }) });

        throw new ApiError(`${this._call_name}_call/${this._name} ${urlForLog} returns ${res.status}`, res);
      }

      const result = new ApiResult<T>(res.data, this.ctx);
      result.httpResult = res;

      if (!res.data || ((!options || !options.dataType || options.dataType === 'json') && typeof res.data !== 'object')) {
        this.ctx.logError({
          type: `${this._call_name}_call-error`,
          msg: `${this._call_name}_call/${this._name} (${urlForLog}) returns invalid data`,
          detail: this.logFilter({ url, params, res: res.res, data: res.data }) });
      } else if (!result?.success) {
        this.ctx.logError({
          type: `${this._call_name}_call-error`,
          msg: `${this._call_name}_call/${this._name} (${urlForLog}) returns false: ${result?.errorInfo}`,
          detail: this.logFilter({ url, params, res: res.res, data: res.data }) });
      }

      return result as IApiResult<T>;
    } catch (err) {
      if (!(err instanceof ApiError)) {
        this.ctx.logCritical({ type: `${this._call_name}_call-error`, msg: `failed to call ${this._call_name}/${this._name} ${urlForLog}`, err, detail: { url, params } });
      }

      throw err;
    }
  }
}

export default class HttpService extends BaseService {
  // tslint:disable-next-line: no-reserved-keywords
  async get(api: string, params?: any, options?: RequestOptions) {
    return await this.invoker(api).method('GET').options(options).invoke(params);
  }

  async post(api: string, params?: any, options?: RequestOptions) {
    return await this.invoker(api).method('POST').options(options).invoke(params);
  }

  invoker(nameOrPath: string, path?: string | RequestOptions, options?: RequestOptions) {
    let name: string | undefined = nameOrPath;
    if (typeof path === 'undefined' || (typeof path === 'object' && path)) {
      if (path && typeof path === 'object') {
        options = path as RequestOptions;
      }

      path = nameOrPath;
      name = undefined;
    }

    let invoker = new HttpRpcInvoker(this.ctx);

    if (name) {
      invoker = invoker.name(name);
    }

    invoker = invoker.path(path);

    if (options) {
      invoker = invoker.options(options);
    }

    return invoker;
  }
}
