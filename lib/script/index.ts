import * as path from 'path';
import framework from '../framework';

import BaseApplication from '../application';
import BaseAppWorkerLoader from '../loader';

const EGG_PATH = Symbol.for('egg#eggPath');
const EGG_LOADER = Symbol.for('egg#loader');

class AppWorkerLoader extends BaseAppWorkerLoader {
  mergePluginConfig(plugin: {
    name: string;
    enable: boolean;
    package: string;
    path: string;
    env: string[];
  }) {
    if (['schedule', 'logrotator'].includes(plugin.name)) {
      plugin.enable = false;
    }

    // @ts-ignore
    super.mergePluginConfig(plugin);
  }
}

class Application extends BaseApplication {
  get [EGG_PATH]() {
    // 返回 framework 路径
    return path.dirname(__dirname);
  }

  get [EGG_LOADER]() {
    return AppWorkerLoader;
  }
}

export = Object.assign(
  {},
  framework,
  {
    Application,
    AppWorkerLoader,
  }
);
