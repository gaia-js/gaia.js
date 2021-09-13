const extend = require('extend2');
import { AgentWorkerLoader as EggAgentWorkerLoader } from 'egg';

export default class AgentWorkerLoader extends EggAgentWorkerLoader {
  _preloadAppConfig: any;

  loadConfig() {
    super.loadConfig();

    const appConfig = this._preloadAppConfig();
    const config = this.config;
    extend(true, config, appConfig);
    this.config = config;
  }
}
