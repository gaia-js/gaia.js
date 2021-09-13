enum STATE {
  started,
  resolved,
  rejected,
}

export default class CachedPromise<T> implements PromiseLike<T> {
  private _state: STATE;

  private _resolved: T;
  private _rejected: any;

  private _resolver: Function[];
  private _rejecter: Function[];

  constructor(promise: Promise<T>) {
    this._state = STATE.started;

    this._resolver = [];
    this._rejecter = [];

    promise.then(resolved => {
      this._state = STATE.resolved;

      this._resolved = resolved;

      const listener = this._resolver;
      this._resolver = [];
      this._rejecter = [];

      listener.forEach(listener => {
        listener(resolved);
      });
    }, rejected => {
      this._state = STATE.rejected;

      this._rejected = rejected;

      const listener = this._rejecter;
      this._rejecter = [];
      this._resolver = [];

      listener.forEach(listener => {
        listener(rejected);
      });
    });
  }

  then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null) {
    if (this._state === STATE.started) {
      if (onfulfilled) {
        this._resolver.push(onfulfilled);
      }
      if (onrejected) {
        this._rejecter.push(onrejected);
      }
    } else if (this._state === STATE.resolved) {
      if (onfulfilled) {
        return onfulfilled(this._resolved);
      }
    } else if (this._state === STATE.rejected) {
      if (onrejected) {
        return onrejected(this._rejected);
      }
    }

    return this;
  }
}
