import { EggAppConfig, EggAppInfo, PowerPartial } from 'egg';

/**
 * @param {Egg.EggAppInfo} appInfo app info
 */
export default (appInfo: EggAppInfo) => {
  const config: PowerPartial<EggAppConfig> = {};

  return {
    ...config,
  };
};
