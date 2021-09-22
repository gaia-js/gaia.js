#!/usr/bin/env node

'use strict';

const path = require('path');
const fs = require('fs');
const { Command: BaseCommand } = require('egg-bin');
const debug = require('debug');
const tsNode = require("ts-node");
const utils = require('egg-utils');
const is = require('is-type-of');

debug.enable('gaia:*');

tsNode.register({
  project: path.resolve(__dirname, "../tsconfig.json"),
  transpileOnly: true,
});

const ScriptCommand = require('../app/lib/script_command').default;

class Command extends BaseCommand {
  constructor(rawArgv) {
    super(rawArgv);

  }

  async startEgg(context) {
    const { cwd, argv } = context;

    if (!process.env.hasOwnProperty('EGG_TYPESCRIPT')) {
      process.env.EGG_TYPESCRIPT = 'true';
    }

    /* istanbul ignore next */
    argv.baseDir = argv.baseDir || cwd;
    /* istanbul ignore next */
    if (!path.isAbsolute(argv.baseDir)) argv.baseDir = path.join(cwd, argv.baseDir);

    // argv.framework = utils.getFrameworkPath({
    //   framework: argv.framework,
    //   baseDir: argv.baseDir,
    // });
    argv.framework = path.resolve(__dirname, '../lib/script/');

    const options = Object.assign({
      ignoreWarning: true,
      execArgv: context.execArgv,
      env: process.env.NODE_ENV,
    }, argv);
    debug('%j, %j', options);

    return await require(argv.framework).start(options);
  }

  async start() {
    try {
      this.app = await this.startEgg(this.context);
      if (this.app.config.kafka && this.app.config.kafka.consumerEnabled) {
        this.app.config.kafka.consumerEnabled = false;
      }

      await this.load();

      await super.start();
    } catch (err) {
      this.errorHandler(err);
    }
  }

  errorHandler(err) {
    super.errorHandler(err);

    console.log(err);

    process.exit(0);
  }

  showHelp(level) {
    super.showHelp(level);

    process.exit(0);
  }

  getSubCommandInstance(...params) {
    const instance = super.getSubCommandInstance(...params);
    Object.defineProperty(instance, 'app', {
      enumerable: false,
      value: this.app,
    });

    return instance;
  }

  async load() {
    const loader = this.app.loader;

    const opt = {
      override: true,
      caseStyle: 'upper',
      directory: loader.getLoadUnits().filter(unit => unit.type === 'framework' || unit.type === 'app').map(unit => path.join(unit.path, 'app/scripts')),
    };

    // 找到model里所有的输出
    loader.loadToContext(opt.directory, 'scripts', {
      override: true,
      caseStyle: 'upper',
      // match: [ '**/*.(js|ts)', '!**/*.d.ts' ],
      filter: () => {
        return false;
      },
      initializer: (factory, options) => {
        if (is.class(factory) && factory.prototype instanceof ScriptCommand) {
          const name = path.basename(options.path, path.extname(options.path));
          this.add(name, options.path);
        }
      }
    });
  }
}

async function main() {
  process.setMaxListeners(100);

  process.on('uncaughtException', function(err) {
    console.log('uncaughtException:', err);
    process.exit(0);
  });

  process.once('SIGQUIT', () => {
    process.exit(0);
  });

  process.once('SIGTERM', () => {
    process.exit(0);
  });

  process.once('SIGINT', () => {
    process.exit(0);
  });

  new Command().start();
}

main(process.argv);
