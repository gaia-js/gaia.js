import { Bootstrap } from '../app/lib/bootstrap';

import * as path from 'path';
import * as fs from 'fs';
import { Application, AppWorkerLoader as EggAppWorkerLoader } from 'egg';

const FileLoader: any = require('egg-core/lib/loader/file_loader');
import OverrideContextLoader from './context_loader';
import { buildRouters } from '../app/lib/router/routers';
import { BluePrint } from '../app/lib/router/blueprint';
import { AdminBluePrint } from '../app/lib/router/admin_blueprint';
const debug = require('debug')('gaia:loader');

export default class AppWorkerLoader extends EggAppWorkerLoader {
  app: any;
  timing: any;
  private _cacheLoaded: any;
  orderPlugins: any;
  dirs: { path: string; type: string }[];

  loadToApp(directory: string, property: string, opt: any) {
    // 已经有的model之类的属性就不要再覆盖了
    const target = this.app[property] || (this.app[property] = {});
    opt = {
      directory,
      target,
      inject: this.app,
      ...opt
    };

    const timingKey = `Load "${String(property)}" to Application`;
    this.timing.start(timingKey);
    new FileLoader(opt).load();
    this.timing.end(timingKey);
  }

  loadToContext(directory: string, property: string, opt: any) {
    opt = {
      directory,
      property,
      inject: this.app,
      ...opt
    };

    const timingKey = `Load "${String(property)}" to Context`;
    this.timing.start(timingKey);
    new OverrideContextLoader(opt).load();
    this.timing.end(timingKey);
  }

  fixMongoose() {
    const mongoose = this.app && this.app.mongoose;
    if (mongoose && mongoose.connections && mongoose.connections.length > 1) {
      // egg-mongoose 会新建连接，而不是在原默认对象上打开
      if (typeof mongoose.connections[0].host === 'undefined') {
        mongoose.connections.splice(0, 1);
      }
    }
  }

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

  // getOrderPlugins(allPlugins, enabledPluginNames, appPlugins) {
  //   return super.getOrderPlugins(allPlugins, enabledPluginNames, appPlugins);
  // }

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

  load() {
    Bootstrap.initialize(this.app);
    BluePrint.initialize(this.app);
    AdminBluePrint.initialize(this.app);

    super.load();

    this.fixMongoose();

    this.loadModel();

    this.loadObject();

    this.loadCustomLoaders();
  }
  loadModel() {
    throw new Error('Method not implemented.');
  }
  loadObject() {
    throw new Error('Method not implemented.');
  }
  loadConfig() {
    super.loadConfig();

    this.app.config.logger.disableConsoleAfterReady = !this.app.deployment || !this.app.deployment.developing();
  }

  loadRouter() {
    this.loadPassport();

    super.loadRouter();

    process.nextTick(() => {
      buildRouters(this.app);
    });
  }

  loadPassport() {
    throw new Error('Method not implemented.');
  }

  loadService(opt: any = {}) {
    super.loadService({ override: true, ...(opt || {})});
  }

  loadController(opt: any) {
    opt = {
      override: true,
      directory: this.getLoadUnits().filter((unit: any) => unit.type === 'framework' || unit.type === 'app' || unit.type === 'gaia-plugin').map(unit => path.join(unit.path, 'app/controller')),
      ...(opt || {})
    };

    debug('starting with controllers: ', JSON.stringify(opt.directory));
    super.loadController(opt);
  }

  loadMiddleware(opt: any) {
    const gaiaMiddlewares: {
      mw(): void;
      mwOptions: any;
      options: any;
    }[] = [];

    super.loadMiddleware({
      initializer: (factory: any, options: any) => {
        if (typeof factory !== 'function') {
          return factory;
        }

        return (mwOptions: any, app: Application) => {
          const mw = factory(mwOptions, app);

          if (mwOptions && mwOptions.gaia) {
            mwOptions.enable = false;

            gaiaMiddlewares.push({
              mw,
              mwOptions,
              options,
            });
          }

          return mw;
        };
      }, ...(opt || {})});

    this.app.gaiaMiddlewares = gaiaMiddlewares;
  }

  loadCustomLoaders() {
    const opt = {
      inject: this.app,
      override: true,
      directory: this.getLoadUnits().filter(unit => unit.type === 'gaia-plugin').map(unit => path.join(unit.path, 'lib/loaders'))
    };

    if (opt.directory) {
      this.app.loader.loadToApp(opt.directory, '', {
        ...opt,
        filter: func => {
          return typeof func === 'function';
        },
        initializer: (func, options) => {
          func.call(this, options);
        },
      });
    }
  }
}

/**
 * Mixin methods to EggLoader
 * // ES6 Multiple Inheritance
 * https://medium.com/@leocavalcante/es6-multiple-inheritance-73a3c66d2b6b
 */
const loaders = [
  require('./loaders/model').default || require('./loaders/model'),
  require('./loaders/object').default || require('./loaders/object'),
  require('./loaders/passport').default || require('./loaders/passport'),
];

for (const loader of loaders) {
  Object.assign(AppWorkerLoader.prototype, loader);
}
