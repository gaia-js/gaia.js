import { Application } from 'egg';
import helmet from '../../middleware/helmet';
import { BluePrint as BaseBluePrint, RouterOptions } from '../router/blueprint';

let _instance: AdminBluePrint;

export class AdminBluePrint extends BaseBluePrint {
  point(options: RouterOptions) {
    return super.point({ admin: true, middlewares: [ helmet(undefined, this.app) ], ...(options || {}) });
  }

  static initialize(app?: Application) {
    if (!_instance) {
      _instance = new AdminBluePrint(app);
    } else if (app && !_instance.app) {
      Object.defineProperty(_instance, 'app', {
        configurable: false,
        writable: false,
        enumerable: false,
        value: app,
      });
    }

    return _instance;
  }

  static get instance(): AdminBluePrint {
    return this.initialize();
  }
}

const bpAdmin = AdminBluePrint.instance;

export const BluePrint = AdminBluePrint;

export default bpAdmin;
