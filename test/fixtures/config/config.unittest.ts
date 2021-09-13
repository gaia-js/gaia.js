import { EggAppConfig, EggAppInfo, PowerPartial } from 'egg';
import * as path from 'path';

export default (appInfo: EggAppInfo) => {
  const config: PowerPartial<EggAppConfig> = {};

  config.security = {
    domainWhiteList: ['*'],
    csrf: {
      enable: false,
    },
  };
  config.cors = {
    credentials: true,
  };

  config.logger = {
    outputJSON: true,
    level: 'DEBUG',
    dir: `${path.resolve(__dirname, '../logs')}/${appInfo.name}`,
    appLogName: `${appInfo.name}-web.log`,
    coreLogName: 'egg-web.log',
    agentLogName: 'egg-agent.log',
    errorLogName: 'common-error.log',
  };

  // config.mongoose = {
  //   clients: {
  //     default: {
  //       url:
  //         'mongodb://127.0.0.1:27017/gaia-ut?authSource=admin&connectTimeoutMS=3000',
  //       options: {
  //         useNewUrlParser: true,
  //       },
  //       // @ts-ignore
  //       loadModel: false,
  //     },
  //   },
  // };

  // config.couchbase = {
  //   clusters: {
  //     default: {
  //       url: 'couchbase://127.0.0.1?operation_timeout=300',
  //       bucket: 'default',
  //       prefix: `${appInfo.name}:`,
  //     },
  //   },
  // };

  config.redis = {
    clients: {
      // @ts-ignore
      default: {
        port: 6379,
        host: '127.0.0.1',
        db: 0,
        keyPrefix: `${appInfo.name}:`,
        password: '',
      },
    },
  };


  config.sequelize = {
    datasources: [
    ],
  };

  return config;
};
