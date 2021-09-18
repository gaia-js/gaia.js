import Task, { TaskInfo, TaskStatus, TaskEvent } from './task';
import { Application, Context, Singleton } from 'egg';
import Progress from './progress';
import SimpleTask from './simple_task';
import { EventEmitter } from 'events';
import { Redis } from 'ioredis';
import { hostname } from 'os';
import { createClient } from '../redis';

const debug = require('debug')('gaia:task');

type TaskDesc = {
  hostname: string;
  pid: number;
  status: number;
  statusDescription: string;
  result: any;
  error: any;
  progress: {
    total: number;
    current: number;
    currentId: any;
  };
} & TaskInfo;

/**
 *
 */
export default class TaskManager extends EventEmitter {
  readonly tasks: Task[] = [];
  readonly app: Application;
  private redis: Redis;
  private redisEvent: Redis;
  private redisEventSubscriber: Redis;

  private stopResolving?: {
    id: string;
    resolver: () => void;
  };

  constructor(app: Application) {
    super();

    this.app = app;
    this.tasks = [];

    this.redis = (this.app.redis as unknown as Singleton<Redis>).get('task') || (this.app.redis as unknown as Singleton<Redis>).get('default') || this.app.redis;
    // this.redisEvent = createClient(this.app, [ 'task', null ], { noCluster: true }) as Redis;
    this.redisEvent = this.redis;
    this.redisEventSubscriber = createClient(this.app, [ 'task', null ], { noCluster: true }) as Redis; // (this.app.redis as unknown as Singleton<Redis>).get('task_event') || (this.app.redis as unknown as Singleton<Redis>).get('default');

    this.app.beforeClose(async () => {
      await Promise.all(this.tasks.map(async task => {
        await task.stop(3000);
        const taskInfo = task.freeze();
        app.logger.error({ type: 'task_freeze', level: 'CRIT', msg: '保存未完成的任务', detail: { taskInfo } });
      }));
    });

    this.start();

    this.taskStatusChanged = this.taskStatusChanged.bind(this);
    this.taskProgress = this.taskProgress.bind(this);
  }

  start() {
    if (!this.redisEventSubscriber) {
      this.app.assert(false, 'cannot find `task_event` redis instance');
      return;
    }

    this.redisEventSubscriber.on('pmessage', async (pattern, channel, message) => {
      debug(`on redis message: ${channel} ${message}`);

      if (channel === 'task_event.stop') {
        message = JSON.parse(message);
        if (message && message.id) {
          const task = this.findTask(message.id);
          if (task) {
            await task.stop();
            await this.redisEvent.publish('task_event.stop_resp', message.id);
          }
        }
      } else if (channel === 'task_event.stop_resp') {
        if (this.stopResolving && this.stopResolving.id === message) {
          this.stopResolving.resolver();
        }
      } else if (channel === 'task_event.clear') {
        for (let i = this.tasks.length - 1; i >= 0; i--) {
          if (this.tasks[ i ].id === message) {
            this.taskCleared(this.tasks[ i ]);
            this.tasks.splice(i, 1);
          }
        }
      } else if (channel === 'task_event.clear_all_finished') {
        for (let i = this.tasks.length - 1; i >= 0; i--) {
          if (this.tasks[ i ].finished) {
            this.taskCleared(this.tasks[ i ]);
            this.tasks.splice(i, 1);
          }
        }
      }
    });

    this.redisEventSubscriber.once('ready', async () => {
      try {
        await this.redisEventSubscriber.psubscribe('task_event.*');
      } catch (err) {
        this.app.logger.error({ level: 'CRIT', err, msg: 'cannot start task manager for redis pub/sub error' })
      }
    });
  }

  private taskStatusChanged(task: Task) {
    if (task.finished) {
      const index = this.tasks.indexOf(task);
      if (index >= 0) {
        this.taskCleared(task);
        this.tasks.splice(index, 1);
      }
    }

    this.emit('statusChanged', task);
    this.updateTaskToRedis(task);
  }

  private taskProgress(percentage: number, task: Task) {
    this.updateTaskToRedis(task);
  }

  private taskCleared(task: Task) {
    task.removeListener(TaskEvent.statusChanged, this.taskStatusChanged);
    task.removeListener(TaskEvent.progress, this.taskProgress);
  }

  addTask(task: Task) {
    this.tasks.unshift(task);

    task.once(TaskEvent.error, err => {
      this.updateTaskToRedis(task);
    });

    task.on(TaskEvent.statusChanged, this.taskStatusChanged);
    task.on(TaskEvent.progress, this.taskProgress);

    task.once(TaskEvent.finish, () => {
      this.tasks.splice(this.tasks.indexOf(task), 1);
      this.taskCleared(task);
    });

    return task;
  }

  runSimpleTask(func: (ctx: Context, task: Task, progress: Progress) => Promise<any>, info?: TaskInfo) {
    return this.runTask(new SimpleTask(this.app, func, info));
  }

  runTask<T extends Task>(task: T, ctx?: Context) {
    this.addTask(task);

    task.start(ctx);

    return task;
  }

  async runSingletonTask(task: Task) {
    if (await this.addSingletonTask(task)) {
      this.addTask(task);

      task.start();

      return task;
    }

    return null;
  }

  removeFinished() {
    for (let index = this.tasks.length - 1; index >= 0; index--) {
      if (this.tasks[index].finished) {
        this.taskCleared(this.tasks[ index ]);
        this.tasks.splice(index, 1);
      }
    }
  }

  findTask(id: string) {
    return this.tasks.find(task => task.id === id);
  }

  removeTask(task: Task) {
    const index = this.tasks.indexOf(task);
    if (index >= 0) {
      this.taskCleared(this.tasks[ index ]);
      this.tasks.splice(index, 1);
    }
  }

  stats() {
    const stats: Array<TaskInfo & { hostname: string; pid: number; progress: string; }> = [];
    this.tasks.sort((a, b) => a.status - b.status).forEach(task => {
      stats.push({ ...task.info, hostname: hostname(), pid: process.pid, progress: task.progress.progress });
    });

    return stats;
  }

  allFinished() {
    return this.tasks.length === 0;
  }

  private async addSingletonTask(task: Task) {
    return await this.redis.hsetnx('tasks', task.info.id, JSON.stringify({
      hostname: hostname(),
      pid: process.pid,
      last: new Date().toLocaleString(),
      ...task.toJSON(),
    }));
  }

  private async updateTaskToRedis(task: Task) {
    this.redis.hset('tasks', task.info.id, JSON.stringify({
      hostname: hostname(),
      pid: process.pid,
      last: new Date().toLocaleString(),
      ...task.toJSON(),
    }));
  }

  async retrieveTasks(): Promise<{ [id: string]: TaskDesc }> {
    const tasks = await this.redis.hgetall('tasks');
    Object.keys(tasks).forEach(name => {
      tasks[name] = JSON.parse(tasks[name]);
    });

    return tasks as any;
  }

  async clearAllFinishedTasks() {
    const tasks = await this.app.taskManager.retrieveTasks();

    const ids: string[] = []
    Object.keys(tasks).forEach(id => {
      if (tasks[id].status === TaskStatus.Finished) {
        ids.push(id);
        delete tasks[id];
      }
    });

    for (const id of ids) {
      await this.redis.hdel('tasks', id);
    }

    await this.redisEvent.publish('task_event.clear_all_finished', '');

    return tasks;
  }

  async clearTask(id: string) {
    await this.redis.hdel('tasks', id);
    await this.redisEvent.publish('task_event.clear', id);

    return true;
  }

  async stopTask(host: string, pid: number, id: string) {
    if (host === hostname() && pid === process.pid) {
      await Promise.all(this.tasks.filter(task => task.id === id).map(task => task.stop()));

      return true;
    }

    const task = await this.redis.hget('tasks', id);
    if (task) {
      await this.redisEvent.publish('task_event.stop', JSON.stringify({ host, pid, id }));

      return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          resolve(false);
        }, 3000);

        timer.unref();

        this.stopResolving = {
          id,
          resolver: () => {
            clearTimeout(timer);

            resolve(true);
          },
        };
      });
    }

    return false;
  }
}
