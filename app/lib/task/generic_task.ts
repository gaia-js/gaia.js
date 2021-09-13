import { Application, Context } from 'egg';
import Task, { TaskInfo } from './task';
import { KeyType } from '../../object/BaseModelObject';
import ParallelExecutor from 'parallel-executors';

export interface TaskSource<T = any | any[], TKeyType = KeyType> extends AsyncIterable<T> {
  getTotalItemsCount(): Promise<number>;
  exec(results: T): Promise<{ step: number; id: TKeyType }>;
}

export type TaskSourceCreator<TTaskSource> = { new(ctx: Context, options?: any): TTaskSource; info(): Partial<TaskInfo> };

export interface GenericTaskOptions {
  workers: number;
  createOptions?: any;
}

export default class GenericTask<T, TKeyType, TTaskSource extends TaskSource<T, TKeyType>> extends Task<TKeyType> {
  source: TaskSourceCreator<TTaskSource>;
  options: GenericTaskOptions;

  constructor(app: Application, source: TaskSourceCreator<TTaskSource>, options?: Partial<GenericTaskOptions>) {
    super(app, source.info());

    this.source = source;
    this.options = { workers: 1, ...(options || {}) };
  }

  async exec(ctx: Context) {
    const profileItem = ctx.service.profiler.createItem('task');

    try {
      const source = new this.source(ctx, this.options.createOptions);

      const total = await source.getTotalItemsCount();
      if (total === 0) {
        await ctx.app.taskManager.clearTask(this.id);
        return;
      }

      this.progress.updateEstimatedTotal(total);

      await new ParallelExecutor(source, {
        workers: this.options.workers,
        executor: async (item: T) => {
          const res = await source.exec(item);

          this.progress.increaseProgress(res.step, res.id);

          if (this.stopping) {
            return true;
          }

          return false;
        },
      }).execute();
    } finally {
      ctx.service.profiler.addItem(profileItem);
    }
  }
}
