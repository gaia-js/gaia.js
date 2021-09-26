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
    kafka: {
      enable: true,
      broker: '127.0.0.1:9092',
      topic: 'jsonlog',
    },
  };

  config.mongoose = {
    clients: {
      default: {
        url:
          'mongodb://127.0.0.1:27017/gaia-ut?connectTimeoutMS=3000',
        options: {
          useNewUrlParser: true,
        },
        // @ts-ignore
        loadModel: false,
      },
      test: {
        url:
          'mongodb://127.0.0.1:27017/gaia-ut?connectTimeoutMS=3000',
        options: {
          useNewUrlParser: true,
        },
        // @ts-ignore
        loadModel: false,
      },
      'gfs': {
        url: 'mongodb://127.0.0.1:27017/gaia-ut-file?readPreference=secondaryPreferred&connectTimeoutMS=3000',
        options: {
          useNewUrlParser: true,
        },
        // @ts-ignore
        loadModel: false,
      },
    },
  };

  config.couchbase = {
    clusters: {
      default: {
        url: 'couchbase://127.0.0.1?operation_timeout=300',
        bucket: 'default',
        prefix: `${appInfo.name}:`,
      },
    },
  };

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

  config.cache = {
    type: 'redis',
  };

  config.rhea = {
    server: '127.0.0.1',
    port: 4503,
    name: appInfo.name,
  };

  config.sequelize = {
    datasources: [
      {
        dialect: 'mysql',
        host: '127.0.0.1',
        port: 3306,
        username: 'root',
        password: 'root',
        database: 'gaia_ut',
        logging: false,
      },
    ],
  };

  config.kafka = {
    consumerEnabled: false,
    consumer: {
      default: {
        kafkaHost: '127.0.0.1:9092',
        topics: [
          'gaiajs.test',
        ],
        groupId: 'gaiajs-unittest',
      },
    },
    producer: {
      default: {
        host: '127.0.0.1:9092',
      },
    },
  };

  return config;
};
