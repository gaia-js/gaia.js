/* eslint valid-jsdoc: "off" */

'use strict';
import testingConfig from './config.testing';

/**
 * @param {Egg.EggAppInfo} appInfo app info
 */
export default appInfo => {
  const config = testingConfig(appInfo);

  return {
    ...config,
  };
};
