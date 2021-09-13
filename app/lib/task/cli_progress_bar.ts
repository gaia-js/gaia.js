import * as cliProgress from 'cli-progress';
import Task, { TaskEvent, TaskStatus } from './task';

export default class CliProgressBar {
  static monitor(task: Task) {
    const bar = new cliProgress.SingleBar({
      // format: '[{bar}] {percentage}% | ETA: {eta} | {value}/{total}',
      format: (options, params, payload) => {
        // const bar = formatBar();
        // calculate barsize
        const completeSize = Math.round(task.progress.percentage * options.barsize);
        const incompleteSize = options.barsize - completeSize;

        // generate bar string by stripping the pre-rendered strings
        const bar = options.barCompleteString.substr(0, completeSize) +
          options.barGlue +
          options.barIncompleteString.substr(0, incompleteSize);

        return `${task.name} [${bar}] ${task.progress.progress} | ETA: ${task.progress.estimateToFinish} | ${task.progress.current}/${task.progress.total}`;
      }
    }, cliProgress.Presets.shades_classic);

    bar.start(100, 0);

    const onProgress = progress => {
      progress = Number.parseFloat(Number.parseFloat(progress).toFixed(2));
      bar.update(task.progress.current);
    };

    task.on(TaskEvent.progress, onProgress);

    const statusChanged = () => {
      if (task.status === TaskStatus.Started) {
        bar.setTotal(task.progress.total);
      } else if (task.finished) {
        task.removeListener(TaskEvent.progress, onProgress);
        task.removeListener(TaskEvent.statusChanged, statusChanged);
      }
    };

    task.on(TaskEvent.statusChanged, statusChanged);
  }
}
