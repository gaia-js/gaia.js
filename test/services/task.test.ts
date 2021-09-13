import * as assert from 'assert';
import { gaiaTester as tester } from '../bootstrap';
import { Context } from 'egg';
import { sleep } from '../../app/lib/utils';
import { ObjectID } from 'mongodb';

tester('test/services/task.test.ts', async it => {
  it('new task', async (ctx: Context) => {
    // console.log('starting...');

    await ctx.app.taskManager.clearAllFinishedTasks();

    const taskId = new ObjectID().toHexString();
    const task = ctx.service.testTask.do({ id: taskId, name: 'gaia单元测试任务' });

    await sleep(500);

    for (let i = 0; i < 10; i++) {
      // console.dir(ctx.app.taskManager.stats());

      await ctx.app.taskManager.retrieveTasks();

      const taskFound = ctx.app.taskManager.findTask(taskId);
      if (!taskFound || taskFound.finished) {
        break;
      }

      await sleep(1000);
    }

    await ctx.app.taskManager.clearTask(task.id);

    const tasks = await ctx.app.taskManager.retrieveTasks();

    assert(tasks[task.id] === undefined, 'task cleared');
  });
});
