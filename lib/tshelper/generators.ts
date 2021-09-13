/**
 * 自定义的d.ts文件生成
 */
import { TsGenConfig, TsHelperConfig } from 'egg-ts-helper';
import * as utils from 'egg-ts-helper/dist/utils';
import path = require('path');

export const defaultConfig = {
  distName: 'index.d.ts',
};

// composing all the interface
function composeInterface(
  obj: PlainObject | string[],
  wrapInterface?: string,
  preHandle?: (v: string) => string,
  indent?: string,
) {
  let sub = '';
  let prev = '';
  let mid = '';
  let after = '';
  indent = indent || '';

  if (wrapInterface) {
    prev = `${indent}interface ${wrapInterface} {\n`;
    after = `${indent}}\n`;
    indent += '  ';
  }

  // compose array to object
  // ['abc', 'bbc', 'ccc'] => { abc: { bbc: 'ccc' } }
  if (Array.isArray(obj)) {
    let curr: any = obj.pop();
    while (obj.length) {
      curr = { [obj.pop()!]: curr };
    }
    obj = curr;
  }

  Object.keys(obj).forEach(key => {
    const val = obj[key];
    if (typeof val === 'string') {
      mid += `${indent + key}: ${preHandle ? preHandle(val) : val};\n`;
    } else {
      const subWrapInterface = `${wrapInterface}${utils.camelProp(key, 'upper')}`;
      const subVal = composeInterface(val, subWrapInterface, preHandle, '  ');
      if (subVal) {
        sub += subVal;
        mid += `${indent + key}: ${subWrapInterface};\n`;
      }
    }
  });

  return `${sub}${prev}${mid}${after}`;
}

export function gaiaClass(config: TsGenConfig, baseConfig: TsHelperConfig) {
  config = Object.assign(defaultConfig, config);
  const fileList = config.fileList;
  const dist = path.resolve(config.dtsDir, config.distName);

  if (!fileList.length) {
    return { dist };
  }


  // interface name
  const interfaceName = config.interface || `T_${config.name.replace(/[\.\-]/g, '_')}`;
  const importContexts: string[] = [];
  const interfaceMap: PlainObject = {};

  fileList.forEach(f => {
    const { props, moduleName: sModuleName } = utils.getModuleObjByPath(f);
    const moduleName = `Export${sModuleName}`; // 每个导入模块名字
    importContexts.push(utils.getImportStr(
      config.dtsDir,
      path.join(config.dir, f),
      moduleName,
    ));

    // create mapping
    let collector = interfaceMap;
    while (props.length) {
      const name = utils.camelProp(
        props.shift() as string,
        config.caseStyle || baseConfig.caseStyle,
      );

      if (!props.length) {
        collector[name] = moduleName;
      } else {
        collector = collector[name] = typeof collector[name] === 'object' ? collector[name] : Object.create(Object.prototype, {
          parentModuleName: {
            value: typeof collector[name] === 'string' ? collector[name] : undefined,
          },
        });
      }
    }
  });

  // add mount interface
  let declareInterface = '';
  if (config.declareTo) {
    const interfaceList: string[] = config.declareTo.split('.');
    declareInterface = composeInterface(
      interfaceList.slice(1).concat(interfaceName),
      interfaceList[0],
      undefined,
      '  ',
    );
  }

  return {
    dist,
    content:
      `${importContexts.join('\n')}\n\n\n` +
      `declare module '${config.framework || baseConfig.framework}' {\n` +
      (declareInterface ? `${declareInterface}\n` : '') +
      composeInterface(
        interfaceMap,
        interfaceName,
        utils.strToFn(config.interfaceHandle),
        '  ',
      ) +
      '}\n',
  };
}


export function gaiaService(config: TsGenConfig, baseConfig: TsHelperConfig) {
  config.interfaceHandle = undefined;
  config.interfaceHandle = config.interfaceHandle || '{{ 0 }}';
  config.caseStyle = 'lower';
  config.interface = `${config.interfacePrefix || 'IGaia'}Service`;
  return gaiaClass(config, baseConfig);
}

export function gaiaObject(config: TsGenConfig, baseConfig: TsHelperConfig) {
  config.interfaceHandle = config.interfaceHandle || 'ObjectCreator<{{ 0 }}>';
  config.caseStyle = 'upper';
  config.interface = `${config.interfacePrefix || 'IGaia'}Object`;
  return gaiaClass(config, baseConfig);
}

export default {
  gaiaClass,
  gaiaService,
  gaiaObject,
};
