import Progress, { ProgressEvent } from './progress';
import { EventEmitter } from 'events';
import { Context, Application } from 'egg';
const awaitFirst = require('await-first');

const debug = require('debug')('gaia:task');

import { v4 as uuidv4 } from 'uuid';

export interface TaskInfo {
  id: string; // task id，singleton的task以此id为唯一标识
  name: string; // 展示名称
  start?: string; // 开始时间
  description?: string;
  detail?: any;
}

export enum TaskStatus {
  NotStarted = 0,
  Started = 10,
  Running = 20,
  Stopping = 30,
  Error = 40,
  Finished = 50,
  Stopped = 60,
}

export const TaskEvent = {
  finish: 'finish',
  stopped: 'stopped',
  error: 'error',
  statusChanged: 'statusChanged',
  progress: 'progress',
};

export default class Task<TKeyType = any> extends EventEmitter {
  protected app: Application;

  protected _info: TaskInfo;
  readonly progress: Progress<TKeyType>;

  protected _status: TaskStatus;

  result: any;
  error: Error;

  constructor(app: Application, info?: Partial<TaskInfo>) {
    super();

    Object.defineProperty(this, 'app', {
      writable: false,
      enumerable: false,
      value: app,
    });

    this._info = Object.assign({
      id: uuidv4(),
      name: '未命名任务',
      start: new Date().toLocaleString(),
    }, info || {});

    this.status = TaskStatus.NotStarted;

    this.progress = new Progress();
    this.progress.on(ProgressEvent.progress, percentage => {
      this.emit(TaskEvent.progress, percentage, this);
    });
  }

  get id() {
    return this.info.id;
  }

  get name() {
    return this.info.name;
  }

  get info() {
    return this._info;
  }

  freeze() {
    return {
      task: this.info,
      status: this.status,
      progress: this.progress,
    };
  }

  start(ctx?: Context) {
    if (this.status === TaskStatus.Running || this.status === TaskStatus.Finished) {
      throw new Error('task cannot be started: ' + this.statusDescription);
    }

    this.status = TaskStatus.Running;

    this.app.runInBackground(async anonymousCtx => {
      await this.run(ctx || anonymousCtx);
    });
  }

  async run(ctx: Context) {
    try {
      this.result = await this.exec(ctx);
    } catch (err) {
      this.status = TaskStatus.Error;
      this.error = err as Error;

      ctx.logError({ msg: `task ${this.name}(${this.id}) execution failed`, err, detail: { progress: this.progress }})
      this.emit(TaskEvent.error, err, this);
    } finally {
      if (this.status === TaskStatus.Running) {
        this.status = TaskStatus.Finished;
        this.emit(TaskEvent.finish, this);
      } else if (this.status === TaskStatus.Stopping) {
        this.status = TaskStatus.Stopped;
        this.emit(TaskEvent.stopped, this);
      }
    }
  }

  get status() {
    return this._status;
  }

  set status(newStatus: TaskStatus) {
    if (this._status !== newStatus) {
      this._status = newStatus;

      this.emit(TaskEvent.statusChanged, newStatus, this);
    }
  }

  get statusDescription() {
    switch (this.status) {
      case TaskStatus.NotStarted:
        return '未开始';

      case TaskStatus.Started:
        return '已开始';

      case TaskStatus.Running:
        return `执行中 ${this.progress.progress}`;

      case TaskStatus.Stopping:
        return '停止中';

      case TaskStatus.Finished:
        return '已完成';

      case TaskStatus.Error:
        return '错误';

      case TaskStatus.Stopped:
        return '已停止';

      default:
        return `未知状态${this.status}`;
    }
  }

  get finished() {
    return this.status === TaskStatus.Finished;
  }

  get running() {
    return this.status === TaskStatus.Running;
  }

  /**
   * 子类重写此方法实现任务逻辑
   * @param ctx 匿名Context
   */
  protected async exec(ctx: Context) {
    throw new Error('not be implemented');
  }

  get stopping() {
    return this.status === TaskStatus.Stopping;
  }

  async stop(timeout?: number) {
    this.status = TaskStatus.Stopping;

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('timeout'));
      }, timeout || 3000);
      timer.unref();

      this.waitFinish().then(() => {
        debug(`task ${this.name}(${this.id}) stopped`);

        this.status = TaskStatus.Stopped;

        clearTimeout(timer);

        resolve();
      });
    });
  }

  async waitFinish() {
    await awaitFirst(this, [ TaskEvent.stopped, TaskEvent.finish, TaskEvent.error ]);
  }

  toJSON() {
    return {
      ...this.info,
      status: this.status,
      statusDescription: this.statusDescription,
      result: this.result,
      error: this.error,
      progress: this.progress.toJSON(),
    };
  }
}
