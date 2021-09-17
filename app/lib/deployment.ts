import { Application } from 'egg';

export const Stage = {
  Local: 10,
  Unittest: 20,
  Dev: 30,
  Test: 40,
  Testing: 40,
  Staging: 50,
  Production: 60,
  Prod: 60,
}

const String2Stage = {
  'prod': Stage.Prod,
  'production': Stage.Production,
  'staging': Stage.Staging,
  'test': Stage.Testing,
  'testing': Stage.Testing,
  'dev': Stage.Dev,
  'unittest': Stage.Unittest,
  'local': Stage.Local,
}

export default class Deployment {
  readonly stage: number // Stage
  readonly name: string

  readonly app: Application;

  constructor(app: Application) {
    // @ts-ignore
    app.assert(typeof String2Stage[app.config.env] !== 'undefined', `undefined env: ${app.config.env}`);
    this.name = String2Stage[app.config.env] ? app.config.env : 'prod';

    Object.defineProperty(this, 'stage', {
      configurable: false,
      writable: false,
      enumerable: false,
      value: String2Stage[this.name]
    });
    Object.defineProperty(this, 'app', {
      configurable: false,
      writable: false,
      enumerable: false,
      value: app,
    });
  }

  isProduction(): boolean {
    return this.stage === Stage.Prod;
  }

  isStaging(): boolean {
    return this.stage === Stage.Staging;
  }

  /**
   * 是否正式环境，包含staging环境
   */
  isRelease(): boolean {
    return this.stage >= Stage.Staging
  }

  /**
   * 是否测试环境
   * @returns
   */
  isTesting(): boolean {
    return this.stage === Stage.Testing;
  }

  /**
   * 是否测试环境，包含开发环境、本地环境等
   */
  testing(): boolean {
    return this.stage <= Stage.Testing
  }

  /**
   * 是否开发环境，包含本地环境等
   */
  developing(): boolean {
    return this.stage < Stage.Testing
  }

  debugging(): boolean {
    return this.stage <= Stage.Dev
  }
}
