const callsites = require('callsites');
import RheaItem from 'rhea-cli/lib/item';
import { Context } from 'egg';
import { IncomingHttpHeaders, IncomingMessage } from 'http';
import * as _ from 'lodash';
import { RequestOptions2 } from 'urllib';
import { v4 as uuidv4 } from 'uuid';
import { OBJECT_PATH_NAME as pathName } from '../../lib/loaders/object';
import { ServerError } from '../errors';
import { CircuitBreakerOptions } from '../lib/circuit_breaker';
import EventProducer from '../lib/event/producer';
import { deepFindObject } from '../lib/obj_util';
import GaiaResponse from '../lib/response';
import { ObjectProperties } from '../object/BasePropertiesObject';
import Session from '../object/session';


import EggCookies = require('egg-cookies');


type ObjectClass<T> = { new(...params: any[]): T };

function matchIp(ip: string, pattern: string | RegExp) {
  return (pattern instanceof RegExp && !!ip.match(pattern)) || (typeof pattern === 'string' && ip === pattern);
}

const GUID = Symbol.for('gaia@guid');
const EVENT_PRODUCER = Symbol.for('gaia@eventProducer');
const SESSION = Symbol.for('gaia@session');
const SET_COOKIES = Symbol.for('gaia@setCookies');
const TRACER = Symbol.for('gaia@Tracer');

const LOG_FILTER = Symbol.for('gaia@LogFilter');
export class RpcError extends ServerError {

}

export interface RequestOptions extends RequestOptions2 {
  profileSlow?: number;
  profileDesc?: object;
  profileItem?: RheaItem;
}

export interface LOG_DATA {
  [ K: string ]: any;

  request: {
    [ K: string ]: any;

    url: string;
    method: string;
    header: {[K: string]: string };
    post: any;
    query: {[K: string]: string}
  },
}

export type CurlLogFilter = (log: {
  req: {
    method: string;
    headers: IncomingHttpHeaders;
    data: string | undefined;
  };

  res?: IncomingMessage;
  data?: any
}) => void;


/**
 * string | {msg: xx ...} | Error  参数类型
 */
export type LoggerPropMsg = {
  type?: string,
  msg?: string,
  err?: Error | unknown,
  detail?: { [key: string]: unknown },
  [key: string]: unknown,
} | string | Error;

export default {
  get protocol() {
    return super.protocol || (this as unknown as Context).get('x-forwarded-proto');
  },

  get secure() {
    return super.secure || (this as unknown as Context).get('x-forwarded-proto') === 'https' || false;
  },

  /**
   * 是否来自办公网，一般用于限制管理接口访问
   */
  isFromOffice(this: Context): boolean {
    if (!this.hasOwnProperty('_isFromOffice')) {
      this._isFromOffice = this.client_ip && (this.app.config.ips && this.app.config.ips.office || []).some((pattern: any) => {
        return matchIp(this.client_ip, pattern);
      }) || false;
    }

    return this._isFromOffice;
  },

  /**
   * 是否来自于内网，一般用于内网服务器间rpc接口调用
   */
  isFromIntranet(this: Context, clientIp?: string): boolean {
    if (!this.hasOwnProperty('_isFromIntranet')) {
      this._isFromIntranet = this.client_ip && (this.app.config.ips && this.app.config.ips.intranet || []).some((ip: any) => {
        return matchIp(clientIp || this.client_ip, ip);
      }) || false;
    }

    return this._isFromIntranet;
  },

  classOfObjectClass<T>(objectClass: T): T {
    return objectClass;
  },

  createObject<T>(objectClass: ObjectClass<T>, ...params: any[]): T {
    const clz = this.classOfObjectClass(objectClass);

    if (params.length === 1) {
      params.push(this);
    }


    const clzPathName = clz.hasOwnProperty(pathName) ? clz[ pathName ] : null;
    if (clzPathName && clzPathName.startsWith('object.')) {
      const { obj } = deepFindObject(this, clzPathName);
      if (obj) {
        return obj.create(...params);
      }
    }

    // (this as any).app.coreLogger.warn('cannot locate object class for', objectClass.name);

    const obj = new clz(...params);
    if (obj) {
      Object.defineProperty(obj, 'ctx', {
        enumerable: false,
        configurable: true,
        value: this,
      });
      // obj.ctx = this;
    }

    return obj;
  },

  get client_ip(): string {
    const ctx = this as any as Context;
    return ctx.get('x-client-ip') || ctx.get('x-real-ip') || ctx.ip;
  },

  get user_client_ip(): string {
    return this.client_ip;
  },

  get userId(): string | undefined {
    const ctx = this as any as Context;

    return ctx.req && ctx.user && ctx.user.id && `${ctx.user.id}` || undefined;
  },

  installLogFilter<T_LOG_DATA extends LOG_DATA = LOG_DATA>(filter: (log: T_LOG_DATA) => void) {
    const previous = this[LOG_FILTER];
    this[LOG_FILTER] = (log: T_LOG_DATA) => {
      if (previous) {
        previous(log);
      }

      filter(log);
    };
  },

  get logFilter(): (log: LOG_DATA) => void {
    return this[LOG_FILTER] || (log => {});
  },

  formatLog(this: Context, log: any): any {
    const ctx: Context = this as any;

    function formatRequest(ctx: Context) {
      return _.cloneDeep({
        url: ctx.request.originalUrl,
        method: ctx.request.method,
        header: { ...ctx.request.header },
        post: Array.isArray(ctx.request.body) ? [ ...ctx.request.body ] : { ...ctx.request.body },
        query: { ...ctx.request.query },
      });
    }

    if (ctx.user) {
      log.userid = `${ctx.user.id || ''}`;
    }

    const logData = {
      ctx: this,
      // app: ctx.app.name,
      // timestamp: new Date().toISOString(),
      // deployment: ctx.app.config.env,
      _indexed_app: this.app.indexed_app_name,
      request_id: ctx.header[ 'x-request-id' ],
      guid: ctx.guid,
      url: ctx.request.path,
      client_ip: ctx.user_client_ip,
      request: formatRequest(ctx),
      ...log,
    };

    ctx.logFilter(logData);

    return logData;
  },

  log(this: Context, level: string, msg: string | Error | any, err?: Error) {
    let logMsg: any = { type: 'app_error', level };

    if (msg instanceof Error) {
      err = msg;
      logMsg.msg = err.message;
    } else if (typeof msg === 'string') {
      logMsg.msg = msg;
    } else {
      logMsg = {...logMsg, ...msg};
      logMsg.msg || (logMsg.msg = err && err.message) || 'error occurred';
    }

    if (err) {
      logMsg.err = err;
    }

    const sites = callsites();
    if (!logMsg.file && sites.length > 2) {
      logMsg.file = sites[ 2 ].getFileName() + ':' + sites[ 2 ].getLineNumber();
    }

    (this as any).logger[ [ 'ERROR', 'CRIT' ].includes(level) ? 'error' : 'warn'](logMsg);
  },

  logInfo(this: Context, msg: LoggerPropMsg, err?: Error) {
    this.log('INFO', typeof msg === 'object' ? msg : { type: 'info', msg }, err);
  },

  logNotice(this: Context, msg: LoggerPropMsg, err?: Error) {
    this.log('NOTICE', msg, err);
  },

  logWarn(this: Context, msg: LoggerPropMsg, err?: Error) {
    this.log('WARN', msg, err);
  },

  logError(this: Context, msg: LoggerPropMsg, err?: Error) {
    this.log('ERROR', msg, err);
  },

  logCritical(this: Context, msg: LoggerPropMsg, err?: Error) {
    this.log('CRIT', msg, err);
  },

  get guid(): string {
    if (!this[ GUID ]) {
      this[ GUID ] = (this as unknown as Context).get('x-request-id') || uuidv4();
    }

    return this[ GUID ];
  },

  get event(): EventProducer {
    if (!this[ EVENT_PRODUCER ]) {
      this[ EVENT_PRODUCER ] = new EventProducer(this as any);
    }

    return this[ EVENT_PRODUCER ];
  },

  // get origin(this: Context): string {
  //   return (this.header['x-forwarded-proto'] || this.protocol) + `://${this.host}`
  // }

  assert(this: Context, value: any, msg?: string) {
    if (!value) {
      const error = new Error(`assertion failed: ${msg || ''}`);
      this.logCritical({ type: 'assert', msg: `assertion failed: ${msg || ''}` }, error);
      if (!this.app.deployment.isProduction()) {
        throw error;
      }
    }
  },

  async curl(this: Context, url: string, options: RequestOptions & Partial<{ circuitOptions: Partial<CircuitBreakerOptions>; logFilter: [ CurlLogFilter ] }>) {
    try {
      if (options && options.circuitOptions) {
        return await this.app.circuitBreaker.getExecutor(
          (options && options.circuitOptions && options.circuitOptions.id) || url,
          this.httpclient.curl.bind(this.httpclient),
          options.circuitOptions)([ url, options ] as any, this);
      }

      return await this.httpclient.curl(url, options);
    } catch (err) {
      this.logError({ type: 'http_error', msg: `http request failed: ${err instanceof Error && err.message}`, err, detail: { url, options: {...(options || {}),  ctx: undefined} } });
      throw new RpcError({ msg: '服务器接口请求错误' }, err);
    }
  },

  async circuitBreakableCurl(this: Context, url: string, options: RequestOptions & Partial<{ circuitOptions: Partial<CircuitBreakerOptions>; logFilter: [ CurlLogFilter ] }>) {
    // return await this.app.circuitBreaker.getExecutor((options && options.circuitOptions && options.circuitOptions.id) || url, this.curl.bind(this), options.circuitOptions)([ url, options ], this);
    return await this.curl(url, options);
  },

  success<T = any>(this: Context, data?: Partial<{ [ K in keyof T ]: (T[ K ] | any) }>, responseType?: new(data: ObjectProperties<T>, ctx?: Context) => T): T | any {
    if (!data) {
      data = {};
    }

    if (typeof data !== 'object') {
      data = { data } as unknown as ObjectProperties<T>;
    }

    return responseType ? new responseType({ success: true, code: 0, ...(data || {}) }, this) : { success: true, code: 0, ...(data || {}) };
  },

  fail(code: number, msg: string, detail?: object | any): GaiaResponse {
    const ctx: Context = this as any as Context;

    ctx.service.profiler.addItem('error', { type: 'controller_fail', path: ctx.request.pathname });

    return new (class extends GaiaResponse {
      async dump(): Promise<any> {
        let type = ctx.accepts2('json', 'html', 'text');
        type = type || 'json';

        if (type === 'json') {
          return {
            success: false,
            code,
            msg,
            ...(detail ? (typeof detail === 'object' ? detail : { detail }) : {}),
          };
        }

        return `${msg} (${code}) ${detail ? JSON.stringify(detail, null, ' ') : ''}`;
      }
    })(null);
  },

  async getSession(sessionId?: string): Promise<Session> {
    if (!this[ SESSION ]) {
      this[ SESSION ] = await (this as unknown as Context).service.session.get(sessionId);
    }

    return this[ SESSION ];
  },

  getCookie(name: string, options?: EggCookies.CookieGetOptions) {
    const ctx = this as unknown as Context;

    return ctx.cookies.get(name, { encrypt: false, signed: false, ...(options || {})});
  },

  setCookie(name: string, value?: string, options?: EggCookies.CookieSetOptions | { sameSite?: string | boolean }) {
    const ctx = this as unknown as Context;

    if (!this[ SET_COOKIES ]) {
      this[ SET_COOKIES ] = {};
    }

    if (!ctx.cookies.get(name) && !this[ SET_COOKIES ][name] && value) {
      this[ SET_COOKIES ][name] = value;
    }

    // @ts-ignore
    ctx.cookies.set(name, value, {
      encrypt: false,
      signed: false,
      overwrite: true,
      httpOnly: true,
      // secure: ctx.secure,
      domain: ctx.app.deployment.developing() || (ctx.hostname.indexOf(':') >= 0) ? ctx.hostname : ctx.hostname.replace(/^([^\.]+)/, ''),
      ...(options || {})
    });
  },

  getSetCookies() {
    const headers = {};
    for (const [ name, value ] of Object.entries(this[ SET_COOKIES ] || {})) {
      if (name && value) {
        headers['x-' + name.replace(/_/g, '-')] = value;
      }
    }

    return headers;
  },

  get tracer() {
    if (!this[ TRACER ]) {
      this[ TRACER ] = {
        traceId: this.guid,
      };
    }

    return this[ TRACER ];
  },

  accepts2(...types: string[]): string | boolean {
    const ctx: Context = this as any;
    if (types.includes('json')) {
      if (ctx.request.isMobile() || ctx.request.isCli()) {
        return 'json';
      }
    }

    return ctx.accepts(...types) as string | boolean;
  },
};
