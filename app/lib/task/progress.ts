import { EventEmitter } from 'events'

export const ProgressEvent = {
  start: 'start',
  progress: 'progress',
}

export default class Progress<TKeyType = any> extends EventEmitter {
  private _total: number
  private _current: number

  private _currentId: TKeyType;

  private _speed: number;
  private lastUpdateAt: Date;
  private lastOffset: number;
  private estimatedFinishTime: Date;

  constructor() {
    super();

    this._total = 0;
    this._current = 0;
  }

  get total() {
    return this._total || 0;
  }

  updateEstimatedTotal(total: number) {
    this._total = total;

    this.emit(ProgressEvent.start, this.total);

    this.notifyProgress();
  }

  updateProgress(current: number, currentId: TKeyType) {
    this._current = current;
    this._currentId = currentId;

    this.notifyProgress();
  }

  increaseProgress(step: number, currentId: TKeyType) {
    if (!this.lastUpdateAt) {
      this.lastUpdateAt = new Date();
      this.lastOffset = this._current + step;
    } else {
      this._speed = (this._current + step - this.lastOffset) / (new Date().getTime() - this.lastUpdateAt.getTime());
    }

    this.updateProgress(this._current + step, currentId);

    if (this._speed) {
      this.estimatedFinishTime = new Date(this.lastUpdateAt.getTime() + (this.total - this.lastOffset) / this._speed);
    }
  }

  get currentId() {
    return this._currentId;
  }

  get percentage() {
    return this.total !== 0 ? this._current / this.total : 0;
  }

  get progress() {
    return (this.percentage * 100).toFixed(1) + '%';
  }

  private notifyProgress() {
    this.emit(ProgressEvent.progress, this.percentage);
  }

  toJSON() {
    return {
      progress: this.progress,
      total: this.total,
      current: this._current,
      currentId: this.currentId,
      speed: this._speed && (Math.round(this._speed * 1000)) || 0,
      estimatedFinishTime: this.estimatedFinishTime && this.estimatedFinishTime.toLocaleString() || undefined,
    }
  }

  get estimateToFinish() {
    return this.estimatedFinishTime && this.estimatedFinishTime.toLocaleString() || 'N/A';
  }

  get speed() {
    return this._speed || 0;
  }

  get current() {
    return this._current || 0;
  }
}
