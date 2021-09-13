import BaseService from '../lib/BaseService';
import { spawn, SpawnOptionsWithoutStdio } from 'child_process';
import { timeoutable } from '../lib/utils';
import { Readable, Writable } from 'stream';
import path = require('path');

export default class ProcessService extends BaseService {
  async exec(cmd: string, args?: string[], options?: SpawnOptionsWithoutStdio & { stdin?: Readable; stdout?: Writable; stderr?: Writable }) {
    const stdout: string[] = [];
    const stderr: string[] = [];

    return timeoutable(async () => {
      const profileItem = this.ctx.service.profiler.createItem('process', { cmd: path.basename(cmd) });

      try {
        return await new Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string }>((resolve, reject) => {
          const child = spawn(cmd, args ?? [], { ...options, ...(options?.stdin ? { stdio: ['pipe'] } : {}) });
          child.on('error', err => {
            reject(err);
          });
          child.stdout.on('data', data => {
            stdout.push(data);
          });
          child.stderr.on('data', data => {
            stderr.push(data);
          });
          child.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
            resolve({ code, signal, stdout: stdout.join(''), stderr: stderr.join('') });
          });

          if (options?.stdin) {
            options.stdin.pipe(child.stdin);
          }
        });
      } catch (err) {
        profileItem.addTag('error', err instanceof Error && err.name || 'error');
        throw err;
      } finally {
        if (profileItem.last() > (options && options.timeout || 1000)) {
          profileItem.addTag('timeout', 'timeout');
        }

        this.ctx.service.profiler.addItem(profileItem);
      }
    }, options && options.timeout || 30000)();
  }
}
