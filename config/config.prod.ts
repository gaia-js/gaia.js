import { EggAppConfig, PowerPartial, EggAppInfo } from 'egg';

export default (appInfo: EggAppInfo) => {
  const config: PowerPartial<EggAppConfig> = {};

  config.cors = {
    credentials: true,
    maxAge: 3600,
  };

  return config;
};
