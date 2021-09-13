import { Context, Application } from 'egg';
import { Argv } from 'yargs';
import * as CommonBin from 'common-bin';

// const debug = require('debug')('gaia:script');

export type CommandContext = CommonBin.Context;

class Command extends CommonBin {
  ctx: Context;
  app: Application;

  yargs: Argv;

  constructor(rawArgv?: string[]) {
    super(rawArgv);

  }

  protected async run(context: CommandContext) {
    this.ctx = this.app.createAnonymousContext();

    await this.exec(context.argv);

    process.exit(0);
  }

  protected async exec(argv: any) {

  }
}

export default Command;
