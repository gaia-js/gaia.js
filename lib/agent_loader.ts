const extend = require('extend2');
import * as path from 'path';
import * as fs from 'fs';
import { AgentWorkerLoader as EggAgentWorkerLoader } from 'egg';
import { EggLoaderOptions } from 'egg-core';

export default class AgentWorkerLoader extends EggAgentWorkerLoader {
  _preloadAppConfig: any;

  constructor(options: EggLoaderOptions) {
    super(options);

  }

  load() {
    super.load();

    this.loadCustomLoaders();
  }

  private _cacheLoaded: any;
  orderPlugins: any;
  dirs: { path: string; type: string }[];
  // hack egg plugin
  getLoadUnits(): { type: string; path: string}[] {
    if (this._cacheLoaded) {
      return this._cacheLoaded;
    }

    const gaiaPlugins: { path: string; type: string; }[] = [];

    if (this.orderPlugins) {
      for (const plugin of this.orderPlugins) {
        if (plugin['gaia-plugin']) {
          gaiaPlugins.push(plugin);
        }
      }

      for (const plugin of gaiaPlugins) {
        this.orderPlugins.splice(this.orderPlugins.indexOf(plugin), 1);
      }
    }

    const res = super.getLoadUnits();

    if (this.orderPlugins) {
      // 放在gaia framework之上，app之下
      for (const plugin of gaiaPlugins) {
        res.splice(res.length - 1, 0, {
          path: plugin.path,
          type: 'gaia-plugin',
        });
      }
    }

    this.dirs = this._cacheLoaded = res;

    return this._cacheLoaded;
  }

  // hack egg plugin
  mergePluginConfig(plugin: any) {
    // @ts-ignore
    super.mergePluginConfig(plugin);

    const pluginPackage = path.join(plugin.path, 'package.json');
    if (fs.existsSync(pluginPackage)) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pkg = require(pluginPackage);
      const config = pkg.eggPlugin;
      if (config && config['gaia-plugin']) {
        plugin['gaia-plugin'] = true;
      }
    }
  }

  loadConfig() {
    super.loadConfig();

    const appConfig = this._preloadAppConfig();
    const config = this.config;
    extend(true, config, appConfig);
    this.config = config;
  }

  protected loadCustomLoaders() {
    const opt = {
      inject: this,
      override: true,
      directory: this.getLoadUnits().filter(unit => unit.type === 'gaia-plugin').map(unit => path.join(unit.path, 'lib/agent_loaders'))
    };

    if (opt.directory) {
      this.loadToApp(opt.directory, '', {
        ...opt,
        filter: func => {
          return typeof func === 'function';
        },
        initializer: (func: Function, options) => {
          func.call(this, options);
        },
      });
    }
  }
}
