import * as Brakes from 'brakes';
import * as CircuitBrokenError from 'brakes/lib/CircuitBrokenError';
import { Application, Context } from 'egg';

import { submit as rheaSubmit } from 'rhea-cli';

export interface CircuitBreakerOptions {
  disable: boolean;
  id: string;
  group: string;
  timeout: number;
  notBrakeTimeout: boolean;
  fallback: () => Promise<any>;
}

export default class CircuitBreaker {
  app: Application;

  breakers: {
    [key: string]: Brakes;
  };

  stats: {
    [key: string]: Brakes;
  }

  constructor(app: Application) {
    this.app = app;

    this.breakers = {};
    this.stats = {};

    app.messenger && app.messenger.on('brakes-event', ({ type, id }) => {
      if (type === 'open' && this.breakers[ id ]) {
        this.breakers[ id ]._open();
      }
    });
  }

  installBreaker(id: string, options?: Partial<CircuitBreakerOptions>) {
    if (!this.breakers[id]) {
      const breaker = this.breakers[id] = new Brakes(Object.assign({
        timeout: 1500,
        notBrakeTimeout: true,
      }, options || {}));

      breaker.on('snapshot', snapshot => {
        this.stats[id] = snapshot;
      });

      breaker.on('circuitOpen', () => {
        rheaSubmit('circuit', { type:'open', id }, 1);
        this.app.logger.error({ level: 'CRIT', type: 'circuit', msg: `${id} 熔断了`, detail: { pid: process.pid, id } });

        this.app.messenger.broadcast('brakes-event', { type: 'open', id });
      });

      breaker.on('circuitClosed', () => {
        rheaSubmit('circuit', { type:'close', id }, 1);
        this.app.logger.error({ level: 'CRIT', type: 'circuit', msg: `${id} 恢复了`, detail: { pid: process.pid, id } });
      });

      this.app.beforeClose(() => {
        breaker.destroy();
      });
    }

    return this.breakers[id];
  }

  downgrade(id: string) {
    let brake = this.breakers[ id ];
    if (brake) {
      if (brake._circuitOpen) {
        // 如果已经熔断将导致降级失败
      }

      brake._opts.circuitDuration = 7200000; // 降级2小时
      brake._open();
    }
  }

  resetDowngrade(id: string) {
    let brake = this.breakers[ id ];
    if (brake) {
      if (brake._circuitOpen) {
        brake._close();
      }
    }
  }

  getExecutor<T = any, TArgs extends any[] = any[]>(id: string, executor: (...params: TArgs)=>Promise<T>, options?: Partial<CircuitBreakerOptions>): (params: TArgs, ctx: Context) => Promise<T> {
    if (options && options.disable) {
      return params => {
        return executor(...params);
      };
    }

    let brake = this.breakers[id];
    if (!brake) {
      brake = this.breakers[id] = this.installBreaker(id, options);
    }

    return async (params: TArgs, ctx: Context) => {
      try {
        return await brake.subCircuit(executor).exec(...params);
      } catch (err) {
        if (err instanceof CircuitBrokenError) {
          ctx.service.profiler.addItem('brakes', { service: id });
        }

        throw err;
      }
    }
  }
}
