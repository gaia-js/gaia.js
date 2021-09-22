import { EggAppConfig, PowerPartial, EggAppInfo } from 'egg';

'use strict';
import { BusinessError } from '../app/errors/index';


/**
 * @param {Egg.EggAppInfo} appInfo app info
 */
// tslint:disable-next-line: max-func-body-length
export default (appInfo: EggAppInfo) => {
  const config: PowerPartial<EggAppConfig> = {};

  // use for cookie sign key, should change to your own and keep security
  config.keys = appInfo.name + '_1565670102906_2966';

  config.proxy = true;

  // 只对Dao作profile（如果是直接用app.model/app.sequelize/app.mongoose方式访问数据库将会没有性能打点数据）
  config.profileDaoOnly = true;

  config.mongoose = {
    // 不自动load。egg-mongoose给context加了model属性直接返回了app的model，以至于context model得全部重新建
    // @ts-ignore
    loadModel: false,
  };

  config.maxExecution = 60;

  config.validate = {
    convert: true,
  };

  config.httpclient = {
    enableDNSCache: true,
  };

  config.onerror = {
    text(err, ctx) {
      // 在此处定义针对所有响应类型的错误处理方法
      // 注意，定义了 config.all 之后，其他错误处理方法不会再生效
      ctx.set('Content-Type', 'text/text;charset=utf8');
      ctx.status = err instanceof BusinessError ? err.status || 500 : 500;
      ctx.body = !ctx.isFromOffice() ? `${(err && err.code || '未知错误') + ': '}` + (err instanceof BusinessError ? err.msg || '系统错误' : '系统错误') : err.message || err.msg || err.errorMeg || '系统错误';
    },
    html(err, ctx) {
      // html hander
      ctx.set('Content-Type', 'text/html;charset=utf8');
      ctx.status = err instanceof BusinessError ? err.status || 500 : 500;
      ctx.body = !ctx.isFromOffice() ? `${(err && err.code || '未知错误') + ': '}` + (err instanceof BusinessError ? err.msg || '系统错误' : '系统错误') : `<h3>${err.code}: ${err.message}</h3><pre>${err.stack}</pre><pre>${err.detail ? JSON.stringify(err.detail, null, ' ') : ''}</pre>`;
    },
    json(err, ctx) {
      // json hander
      ctx.status = err instanceof BusinessError ? err.status || 500 : 500;
      ctx.body = err;
    },
    // jsonp(err, ctx) {
    //   // 一般来说，不需要特殊针对 jsonp 进行错误定义，jsonp 的错误处理会自动调用 json 错误处理，并包装成 jsonp 的响应格式
    // },
  };

  config.logger = {
    outputJSON: true,
    concentrateError: 'ignore',
    disableConsoleAfterReady: false,
    level: 'INFO',
    dir: `/data/log/${appInfo.name}`,
    appLogName: `${appInfo.name}-app.log`,
    coreLogName: `${appInfo.name}-core.log`,
    agentLogName: `${appInfo.name}-agent.log`,
    errorLogName: `${appInfo.name}-error.log`,
  };

  config.logrotator = {
    maxDays: 7,                     // keep max days log files, default is `31`. Set `0` to keep all logs
  };

  config.ips = {
    office: [
      '::1',
      '127.0.0.1',
    ],
    intranet: [
      '127.0.0.1',
      '::1',
    ],
  };

  // gaia core middleware
  [ 'profiler', 'auth', 'errorLog', 'accessLog' ].forEach(mw => {
    config[ mw ] = {
      gaia: true,
      core: true,
    };
  });

  config.mongoose = {
    options: {
      useUnifiedTopology: true,
    },
  };

  config.adminPassports = [];

  // 默认应该为['fake']才对，为了兼容以前的行为
  // config.defaultPassport = [ 'fake' ];

  config.session = {
    // redis: 'default',
    key: `${appInfo.name}_SESS`,
    renew: true,
  };

  config.dump = {
    ignore: new Set([
      // 'pass', 'pwd', 'passd', 'passwd', 'password', 'keys', 'masterKey', 'accessKey',
      // // ignore any key contains "secret" keyword
      // /secret/i,
      /token/i,
    ]),
  };

  return {
    ...config,
  };
};
