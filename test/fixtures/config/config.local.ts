'use strict';
import devConfig from './config.unittest';

/**
 * @param {Egg.EggAppInfo} appInfo app info
 */
export default appInfo => {
  const config = devConfig(appInfo);

  config.logger = {
    dir: `./log/${appInfo.name}`,
  };

  return {
    ...config,
  };
};
