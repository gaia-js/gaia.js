export interface KafkaConsumerConfig {
  host?: string;
  kafkaHost?: string;
  topics: string | string[];
  groupId?: string;
  serialize?: 'json' | 'hessian';
  disableAccessLog?: boolean;
}

export interface CouchbaseConfig {
  url: string;
  bucket: string;
  prefix?: string;
  username?: string;
  password?: string;
  operationTimeout?: number;
}

export interface RedisOptions {
  port: number;
  host: string;
  password: string;
  db?: number | string;
}

export interface OSSConfig {
  [name: string]: {
    region: string;
    accessKeyId: string;
    accessKeySecret: string;
    bucket: string;
    /** 替代stsToken */
    stsRoleArn?: string;
    stsToken?: string;
    endpoint?: string;
    rootPath?: string;
    cdnHost?: string;
    sourceHost?: string;
  };
}

declare module 'egg' {
  export interface EggLoggerConfig {
    kafka: {
      enable: boolean;
      broker: string;
      topic: string;
    };
  }
}

declare module 'egg' {
  interface GaiaAppConfig {
    debugger?: string | boolean;

    fakeLoginUser: string | number;

    ips: {
      office?: Array<string | RegExp>;
      intranet?: Array<string | RegExp>;
    };

    rhea: {
      server: string;
      port: number;
      name?: string;
    };

    couchbase: CouchbaseConfig | { clusters: { [ name: CouchbaseConfig ] } };

    redis: {
      client?: RedisOptions & {
        keyPrefix?: string;
        weakDependent?: boolean;
      };
      clients: {
        [ key: string ]: (RedisOptions & {
          keyPrefix?: string;
          weakDependent?: boolean;
        }) | {
          cluster: boolean;
          nodes: RedisOptions;
          keyPrefix: '';
          weakDependent?: boolean;
        };
      };
    };

    rpc: {
      hydra: {
        useHydraClient: boolean;
        group: string;
        agent_url?: string;
      };

      ditto: {
        useDittoClient: boolean;
        group: 'test' | 'staging' | 'production' | string;
        agent_url?: string;
      };

      /**
       * 使用hydra配置
       * @deprecated
       */
      hydra_agent?: {
        url: string;
        group: string;
      };

      openapi: {
        host: string;
        app_key: string;
        app_secret: string;
      };
    } & { [ name: string ]: any };

    oss: OSSConfig;

    kafka: {
      consumerEnabled?: boolean;
      consumer?: { [ name: string ]: KafkaConsumerConfig } | KafkaConsumerConfig;

      // producer
      producer?: {
        [ name: string ]: {
          host: string;
        };
      };
    } & { [topic: string]: any };

    grpc?: {
      address?: string;
      port?: number;
      disableServer?: boolean;
    };

    adminPassports?: string[]; // 默认passport
    adminAuth?: string[]; // 开启的验证策略

    session: {
      renew?: boolean;
      key?: string;
      redis?: string;
    };
  }
}
