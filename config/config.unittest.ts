import { EggAppConfig, PowerPartial, EggAppInfo } from 'egg';
import localConfig from './config.local';


/**
 * @param {Egg.EggAppInfo} appInfo app info
 */
export default (appInfo: EggAppInfo) => {
  const config: PowerPartial<EggAppConfig> = localConfig(appInfo);

  // use for cookie sign key, should change to your own and keep security
  config.keys = appInfo.name + '_1565670102906_2966';

  if (!config.hydra) {
    config.hydra = {};
  }

  config.hydra.disableServer = true;

  return {
    ...config,
  };
};
