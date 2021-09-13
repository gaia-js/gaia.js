import { Application } from 'egg';
import { RouterOptions } from '../lib/router/blueprint';

export default function authHandler(mwOptions: any, app: Application) {
  return (bpOption?: RouterOptions) => {
    const passports = bpOption && (bpOption.passport || (bpOption.admin && app.config.adminPassports)) || app.config.defaultPassport || [ 'fake' ];
    const passportOptions = { session: false, failWithError: false, successReturnToOrRedirect: false, successRedirect: false, bpOptions: bpOption };
    return (app as any).passport.authenticate([ ...passports, 'anonymous' ], passportOptions as any);
  };
}
