/* eslint valid-jsdoc: "off" */

'use strict';
import hydraServices from './hydra_rpc';


/**
 * @param {Egg.EggAppInfo} appInfo app info
 */
export default appInfo => {
  return {
    hydraServices,
  };
};
