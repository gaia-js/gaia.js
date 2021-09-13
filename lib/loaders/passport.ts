import * as path from 'path';
import AppWorkerLoader from '../loader';

export default {
  loadPassport(this: AppWorkerLoader, opt: any) {
    const app = this.app;

    this.timing.start('Load Passport');

    opt = Object.assign({
      inject: this.app,
      caseStyle: 'camel',
      override: true,
      directory: this.getLoadUnits().map(unit => path.join(unit.path, 'app/passport')),
    }, opt);

    app.loader.loadToApp(opt.directory, 'passport', Object.assign(opt, {
      initializer: (factory, options) => {
        app.passport.use(options.pathName.split('.', 2)[1], factory(app));
      },
    }));

    this.timing.end('Load Passport');
  },
};
