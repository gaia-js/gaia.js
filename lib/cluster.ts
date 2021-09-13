import { /*startCluster as eggStartCluster,*/ ClusterOptions } from 'egg';
const EggMaster = require('egg-cluster/lib/master');
// import Master from 'egg-cluster/lib/master';

import { ObjectID } from 'mongodb';

const applicationId = (new ObjectID()).toHexString();

export class Master extends EggMaster {
  constructor(options: ClusterOptions) {
    super(options);

  }

  onSignal(signal: string) {
    return super.onSignal(signal);
  }
}

export function startCluster(options: ClusterOptions, callback: (...args: any[]) => any) {
  options = Object.assign({ applicationId }, options || {});

  new Master(options).ready(callback);
  // return eggStartCluster(Object.assign({ applicationId }, options || {}), callback);
}
