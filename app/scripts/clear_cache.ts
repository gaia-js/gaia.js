import { deepFindObject } from '../lib/obj_util';
import ScriptCommand from '../lib/script_command';
import BaseModelObject from '../object/BaseModelObject';

export default class ClearCacheCommand extends ScriptCommand {
  constructor(rawArgv: any) {
    super(rawArgv);

    this.yargs.usage('clear_cache <options>');

    this.yargs.options({
      all: {
        type: 'string',
        description: 'test argv: a description',
      },
      model: {
        type: 'string',
        description: 'test argv: a description',
      },
      id: {
        type: 'string',
        description: 'test argv: a description',
      },
    });
  }

  async exec(argv: any) {
    if (!argv.all && (!argv.model || !argv.id)) {
      console.log('clear_cache [--all <repository name> | --model <model name> --id <id> --property <property>]');
      return;
    }

    if (argv.all) {
      await this.ctx.service.cache.couchbase.flush({ repository: argv.all });
      return;
    }

    const { obj: model } = deepFindObject(this.ctx.service, argv.model);
    if (!model) {
      console.log(`cannot find ${argv.model} model`);
      return;
    }

    if (!await model.removeCache(argv.id)) {
      console.log(`cannot remove cache ${argv.model} model id: ${argv.id}`);
    }

    const result = await model.load(argv.id);
    console.log(result && result.getProperties());

    if (argv.property) {
      let obj: BaseModelObject = await model.load(argv.id);
      if (!obj && /[0-9]+/.test(argv.id)) {
        obj = await model.load(parseInt(argv.id));
      }

      if (obj) {
        await obj.clearCacheableProperty(argv.property);
      } else {
        console.log(`cannot load ${argv.model} model id: ${argv.id}`);
      }
    }

    console.log('done');

    return;
  }

  get description() {
    return 'test description';
  }
}

exports = ClearCacheCommand;
