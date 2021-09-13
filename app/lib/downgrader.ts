import { Application, Context } from 'egg';
import { ServerError } from '../errors';
import bootstrap from './bootstrap';
// import { createClient } from './redis';
import { RouterOptions } from './router/blueprint';

// const debug = require('debug')('gaia:downgrade');

export class DownGradeException extends ServerError {
}

let _instance: DownGrader;

export default class DownGrader {
  private readonly app: Application;
  readonly downGraded: { [ MODULE: string ]: boolean };
  readonly modules: Set<string>;

  constructor(app: Application) {
    Object.defineProperty(this, 'app', {
      writable: false,
      value: app,
    });

    this.downGraded = {};
    this.modules = new Set();

    // app.assert(!_instance, 'DownGrader instance already initialized');

    _instance = this;
  }

  static get instance() {
    return _instance;
  }

  registerModule(module: string) {
    this.modules.add(module);
  }

  middleware(module: string) {
    this.registerModule(module);

    return (bpOption?: RouterOptions) => {
      return async (ctx: Context, next: () => Promise<any>) => {
        if (this.isDowngraded(module)) {
          throw new DownGradeException(this.app.errorCodes.DOWNGRADED, { module });
        }

        return next();
      }
    };
  }

  @bootstrap.onRedisPubSub(`${bootstrap.app.name}.downgrade.*`)
  async onMessage(message: string, channel: string) {
    if (channel === `${this.app.name}.downgrade.on`) {
      this.downGraded[message] = true;
    } else if (channel === `${this.app.name}.downgrade.off`) {
      if (this.downGraded[message]) {
        delete this.downGraded[message];
      }
    }
  }

  async downGrade(module: string, on = true) {
    if ((this.downGraded[module] ?? false) !== on) {
      if (on) {
        this.downGraded[module] = on;
      } else if (this.downGraded[module]) {
        delete this.downGraded[module];
      }

      await this.app.getRedis().publish(on ? `${this.app.name}.downgrade.on` : `${this.app.name}.downgrade.off`, module);
    }
  }

  isDowngraded(module: string) {
    return this.downGraded[module] || false;
  }
}
