import { Application } from 'egg';

export interface Profiler {

}

export default class RheaProfiler implements Profiler {
  constructor(app: Application) {
    Object.defineProperty(this, 'app', {
      value: app,
    });
  }
}
