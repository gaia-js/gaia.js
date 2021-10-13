import path = require('path');
import fs = require('fs');
import generators from './generators';
/**
 * gaia ts-helper 目录生成配置
 */
export function gaiaAppDefault(rootDir: string) {
  const dirs = [ rootDir ];
  // 支持子模块
  const modulesPath = path.join(rootDir, 'app/module');
  const modules = fs.existsSync(modulesPath) ? (p => fs.readdirSync(p).filter(f => fs.statSync(path.join(p, f)).isDirectory()))(modulesPath) : [];
  dirs.push(...modules.map(p => path.join(modulesPath, p)));
  const watchDirs = {
  };
  for (const dir of dirs) {
    const serviceDir = `${dir}/app/service`;
    watchDirs[serviceDir] = {
      directory: serviceDir,
      generator: generators.gaiaService,
      interfacePrefix: 'IApp',
    };

    const objectDir = `${dir}/app/object`;
    watchDirs[objectDir] = {
      directory: objectDir,
      generator: generators.gaiaObject,
      interfacePrefix: 'IApp',
    };
  }
  return watchDirs;
}

export function gaiaPluginDefault(rootDir: string, interfacePrefix = "IGaia") {
  return {
    service: {
      directory: `${rootDir}/app/service`,
      generator: generators.gaiaService,
      interfacePrefix,
    },
    object: {
      directory: `${rootDir}/app/object`,
      generator: generators.gaiaObject,
      interfacePrefix,
    },
  };
}

export default {
  gaiaApp: gaiaAppDefault,
  gaiaPlugin: gaiaPluginDefault,
};
