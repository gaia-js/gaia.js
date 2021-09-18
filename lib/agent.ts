import { Agent as EggAgent } from 'egg';
import * as path from 'path';
import AgentWorkerLoader from './agent_loader';

import { wrapLogger } from './logger';

const EGG_PATH = Symbol.for('egg#eggPath');
const EGG_LOADER = Symbol.for('egg#loader');
const LOGGERS = Symbol('EggApplication#loggers');

export default class Agent extends EggAgent {
  constructor(options = {}) {
    super(options);

  }

  get [EGG_PATH]() {
    return path.dirname(__dirname);
  }

  dumpTiming() {
    // override to ignore
  }

  get loggers() {
    if (!this[ LOGGERS ]) {
      const loggers = super.loggers;

      loggers.forEach((logger, name) => wrapLogger(logger, name, this as any));
      this[ LOGGERS ] = loggers;
    }
    return this[ LOGGERS ];
  }

  get [EGG_LOADER]() {
    return AgentWorkerLoader;
  }
}
