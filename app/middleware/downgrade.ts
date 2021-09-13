import { Application } from 'egg';
import { RouterOptions } from '../lib/router/blueprint';

export default function downgradeHandler(mwOptions: any, app: Application) {
  return (module: string) => {
    return (bpOption?: RouterOptions) => {
      return app.downGrader.middleware(module);
    };
  }
}
