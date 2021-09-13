// const FileTransport = require('egg-logger/lib/transports/file');
import { FileTransport, FileTransportOptions } from 'egg-logger';
import { formatMeta } from './formatter';

// const rhea = require('rhea-cli');

export default class JsonTransport extends FileTransport {
  options: FileTransportOptions & { app: any };

  constructor(options: any) {
    // options = Object.assign({
    //   file: options.file,
    //   level: options.level || 'INFO',
    //   encoding: options.encoding,
    //   formatter: options.formatter,
    //   contextFormatter: options.contextFormatter,
    //   flushInterval: options.flushInterval,
    //   eol: options.eol,
    // }, options)

    super(options)
  }

  get app() {
    return this.options.app;
  }

  log(level: string, args: any[], meta: any) {
    meta = formatMeta(level, args, meta, this);

    meta = Object.assign({}, meta); // copy meta
    meta.toJSON = function () {
      delete this.message;
      return this;
    };

    delete meta.levelValue;
    delete meta.ctx;

    return super.log(meta.level || level, args, meta);
  }
}
