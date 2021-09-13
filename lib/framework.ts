'use strict';

import * as egg from 'egg';
import Agent from './agent';
import AppWorkerLoader from './loader';
import Application from './application';
import { startCluster } from './cluster';

// 覆盖了 Egg 的 Application
export default {
  ...egg,
  startCluster,
  Application,
  // 自定义的 Loader 也需要 export，上层框架需要基于这个扩展
  AppWorkerLoader,
  Agent,
};
