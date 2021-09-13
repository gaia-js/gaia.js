import prodConfig from './config.prod';

/**
 * @param {Egg.EggAppInfo} appInfo app info
 */
export default appInfo => {
  const config = prodConfig(appInfo);

  return {
    ...config,
  };
};
