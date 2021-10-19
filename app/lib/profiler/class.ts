import ObjectProfiler from '../object_profiler';

type Class<T = any> = { new(...args: any[]): T };

export default function classProfile<T extends Class>(name?: string, tags?: { [key: string]: string }, options?: { timeout?: number; methods?: string[]; excludes?: string[] }) {
  return (ctor: T) => {
    return class extends ctor {
      constructor(...params: any[]) {
        super(...params);

        return ObjectProfiler.createProfileProxy(this, name || ctor.name, tags || {}, (this as any).ctx, options);
      }
    } as typeof ctor;
  };
}
