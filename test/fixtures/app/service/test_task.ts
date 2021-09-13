import BaseService from '../../../../app/lib/BaseService';
import { TaskInfo } from '../../../../app/lib/task/task';
import { sleep } from '../../../../app/lib/utils';

export default class TestTaskService extends BaseService {
  do(info?: TaskInfo) {
    // console.log('task do');

    const task = this.app.taskManager.runSimpleTask(async (ctx, task, progress) => {
      progress.updateEstimatedTotal(1000);

      for (let i = 0; i < 10 && !task.stopping; i++) {
        await sleep(200);

        progress.increaseProgress(100, i);
      }

      return 1000;
    }, info);

    // console.log('task added');

    return task;
  }
}
