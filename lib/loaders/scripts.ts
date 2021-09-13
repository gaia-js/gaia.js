import * as path from 'path';
import * as is from  'is-type-of';
import AppWorkerLoader from '../loader';

module.exports = {
  loadScripts(this: AppWorkerLoader, opt) {
    const app = this.app;

    this.timing.start('Load Scripts');

    opt = Object.assign({
      inject: this.app,
      caseStyle: 'camel',
      override: true,
      directory: this.getLoadUnits().map(unit => path.join(unit.path, 'app/scripts')),
    }, opt);

    // if (!app.eventSink) {
    //   app.eventSink = {};
    // }

    app.loader.loadToContext(opt.directory, 'scripts', Object.assign(opt, {
      filter(objClass) {
        return is.class(objClass);
      },
      initializer(clz) {
        return clz;
      },
    }));

    this.timing.end('Load Object');
  },
};
