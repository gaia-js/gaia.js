import { Application } from 'egg';

export default (app: Application) => {
  for (const name of [ 'profiler', 'accessLog', 'errorLog', 'auth' ]) {
    if (app.config.coreMiddleware.indexOf(name) === -1) {
      app.config.coreMiddleware.push(name);
    }
  }

  if (app.config.coreMiddleware.indexOf('logNotfound') === -1) {
    const indexOfStatic = app.config.coreMiddleware.indexOf('static');
    app.config.coreMiddleware.splice(indexOfStatic, 0, 'logNotfound');
  }
}
