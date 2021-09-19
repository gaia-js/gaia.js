import * as path from 'path';
import { exists } from 'fs';
import ScriptCommand from '../lib/script_command';
import { promisify } from 'util';

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import grpcProto from '../../app/lib/rpc/grpc/proto';

export default class ClearCacheCommand extends ScriptCommand {
  constructor(rawArgv: any) {
    super(rawArgv);

    this.yargs.usage('grpc <options>');

    this.yargs.options({
      address: {
        type: 'string',
        description: 'address',
      },
      proto: {
        type: 'string',
        description: 'proto package file',
      },
      service: {
        type: 'string',
        description: 'service name',
      },
      method: {
        type: 'string',
        description: 'method name',
      },
    });
  }

  async exec(argv: any) {
    if (!argv.proto || !argv.service || !argv.method) {
      console.error('gpc [--proto <proto file> --service <service name> --method <method>]');
      return;
    }

    if (!await promisify(exists)(argv.proto)) {
      console.error(`${argv.proto} not exists`);
      return;
    }

    const packageName = path.basename(argv.proto, 'proto');

    const params = JSON.parse(argv._[0]);

    console.log(argv);

    grpcProto.registerDefinition({[packageName]: grpc.loadPackageDefinition(protoLoader.loadSync(argv.proto, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    }))});

    const result = await this.ctx.service.rpc.grpc.invoker(packageName, argv.service, argv.method)
      .address(argv.address || undefined)
      .invoke(params);

    console.log(result);

    return;
  }

  get description() {
    return 'grpc service invoker';
  }
}

exports = ClearCacheCommand;
