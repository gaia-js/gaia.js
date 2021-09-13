import Task, { TaskInfo } from './task';
import Progress from './progress';
import { Context, Application } from 'egg';

export default class SimpleTask extends Task {
  private func: (ctx: Context, task: Task, progress: Progress) => Promise<any>;

  constructor(app: Application, func: (ctx: Context, task: Task, progress: Progress) => Promise<any>, info?: TaskInfo) {
    super(app, info);

    this.func = func;
  }

  async exec(ctx: Context) {
    await this.func(ctx, this, this.progress);
  }
}
