import { Application } from 'egg';

import { Strategy } from 'passport';

module.exports = (app: Application) => {
  return new class extends Strategy {
    async authenticate(req: any, options?: any) {
      this.success(null as any);
    }
  }();
};
