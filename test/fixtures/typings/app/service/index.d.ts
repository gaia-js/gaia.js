// This file is created by egg-ts-helper@1.26.0
// Do not modify this file!!!!!!!!!

import 'egg';
import ExportKafkaConsumerTest from '../../../app/service/kafka_consumer_test';
import ExportTestProfiler from '../../../app/service/test_profiler';
import ExportTestRedis from '../../../app/service/test_redis';
import ExportTestTask from '../../../app/service/test_task';

declare module 'egg' {
  interface IAppService {
    kafkaConsumerTest: ExportKafkaConsumerTest;
    testProfiler: ExportTestProfiler;
    testRedis: ExportTestRedis;
    testTask: ExportTestTask;
  }
}
