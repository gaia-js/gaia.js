import { Agent as EggAgent } from 'egg';
import * as path from 'path';

const EGG_PATH = Symbol.for('egg#eggPath');

import { wrapLogger } from './logger';

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
}
