// require('mocha');
import 'mocha';

import { Context } from 'egg';
const path = require('path');
// const { app } = require('egg-mock/bootstrap');
// import * as rhea from 'rhea-cli';
import mock from 'egg-mock';
import { MockApplication } from 'egg-mock';

const _debug = require('debug');
_debug.enable('gaia:*');

export interface Options {
  baseDir: string;
  framework: string | boolean;
}

let _app: MockApplication;

export function prepare(options: Partial<Options> = {}) {
  process.env.EGG_TYPESCRIPT = 'true';
  mock.env('unittest');

  if (!_app) {
    _app = mock.app(Object.assign({
      baseDir: path.resolve(__dirname, '..'),
      framework: path.resolve(__dirname, '..'),
      cache: false,
    }, options || {}));
  }

  const app = _app;

  before(() => app.ready());

  // 公用app，不能关闭
  // after(() => app.close());

  afterEach(mock.restore);

  return app;
}

type ItCallback = (ctx: Context, app: MockApplication) => Promise<void>;

export class Tester {
  _app: MockApplication;

  constructor(options: Partial<Options> = {}) {
    this._app = prepare(options);
  }

  get app() {
    if (!this._app) {
      this._app = prepare();
    }

    return this._app;
  }

  it(name: string, callback: ItCallback, mockOptions?: any) {
    it(name, async () => {
      const ctx = this.app.mockContext(mockOptions);
      await callback(ctx, this.app);
    });

    return this;
  }
}

type ItFunc = { (name: string, callback: ItCallback, mockOptions?: any): Tester, app: MockApplication };

export function newTester(options: Partial<Options> = {}) {
  return (name: string, callback: (it: ItFunc) => void) => {
    describe(name, () => {
      const tester = new Tester(options);

      const itCallback: ItFunc = Object.assign((name: string, itcallback: ItCallback, mockOptions: any) => {
        return tester.it(name, itcallback, mockOptions);
      }, { app: tester.app });

      callback(itCallback);
    });
  };
}

export const gaiaTester = newTester({ framework: path.resolve(__dirname, '..'), baseDir: path.resolve(__dirname, './fixtures') });

export const tester = gaiaTester;

export default gaiaTester;
