'use strict';

import { Application, Agent } from 'egg';
import { Logger } from 'egg-logger';
import { ConsoleTransport } from './logger/console';
import JsonTransport from './logger/file';
import KafkaTransport from './logger/kafka';

export { default as JsonTransport } from './logger/file';
export { default as ConsoleTransport } from './logger/console';
export { default as KafkaTransport } from './logger/kafka';

// declare interface Logger extends EggLogger {
//   options: EggLoggerOptions;
// }

export function wrapLogger(logger: Logger, name: string, app: Application | Agent | any) {
  const options = (logger as any).options;

  logger.set('jsonFile', new JsonTransport({
    app,
    file: options.jsonFile || (options.file && options.file.replace(/\.log$/, '.json.log')),
    level: options.level,
    encoding: options.encoding,
    flushInterval: options.flushInterval,
    json: true,
    eol: options.eol,
    loggerName: name,
  }));

  if (logger.get('jsonFile')) {
    // logger.delete('file');
    logger.disable('file');
  }

  if (logger.has('console')) {
    logger.set('console', new ConsoleTransport({ app, ...((logger.get('console') as any)?.options || {}) }));
  }

  if (app.config.logger && app.config.logger.kafka && app.config.logger.kafka.enable) {
    if (!app._kafkaLogger) {
      app._kafkaLogger = new KafkaTransport({ ...(app.config.logger.kafka), app, loggerName: name });
    }

    logger.set('kafka', app._kafkaLogger);
  }

  const duplicateLoggers = (logger as any).duplicateLoggers;
  duplicateLoggers.forEach(item => {
    if (item.options?.excludes) {
      item.options.excludes = item.options.excludes.concat('kafka');
    }
    item.logger.has('console') && item.logger.set('console', new ConsoleTransport({ app, ...((logger.get('console') as any)?.options || {}) }));
  });
}

// function contextFormatter(meta) {
//   formatLogMsg(meta);

//   return JSON.stringify(meta);
// }

// export default {
//   JsonTransport,
//   ConsoleTransport,
//   KafkaTransport,
// };

// module.exports.contextFormatter = contextFormatter
