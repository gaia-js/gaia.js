import ObjectProfiler from '../object_profiler';

export default function object<T extends { new(...args: any[]): {} }>(name?: string, tags?: { [key: string]: string }, options?: { timeout?: number; methods?: string[]; excludes?: string[] }) {
  return (ctor: T) => {
    return class extends ctor {
      constructor(...params: any[]) {
        super(...params);

        return ObjectProfiler.createProfileProxy(this, name || ctor.name, tags || {}, (this as any).ctx, options);
      }
    };
  };
}
