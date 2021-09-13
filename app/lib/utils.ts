import * as fs from 'fs';
import * as readLine from 'readline';
import ErrorCodes from '../errors/codes';
import { BusinessError } from '../errors';

export class TimeoutError extends Error {

}

export async function sleep(ms: number, throwTimeout = false) {
  return new Promise<void>((resolve, reject) => setTimeout(() => { throwTimeout ? reject(new Error('Timeout')) : resolve(); }, ms));
}

export function timeoutable<T, ARGS extends any[]>(func: (...args: ARGS) => Promise<T>, timeout: number, options?: { silentTimeout: boolean }) {
  return (...args: ARGS) => {
    return new Promise<T>((resolve, reject) => {
      let resolved = false;

      const timer = setTimeout(() => {
        !resolved && reject(new TimeoutError('Timeout'));

        resolved = true;
      }, timeout);

      func.apply(null, args)
        .then(result => {
          clearTimeout(timer);

          !resolved && resolve(result);
          resolved = true;
        })
        .catch(err => {
          clearTimeout(timer);

          !resolved && reject(err);
          resolved = true;
        });
    });
  };
}

export async function* readFileByLine(file: string) {
  const reader = fs.createReadStream(file);
  const rl = readLine.createInterface({ input: reader });

  // @ts-ignore
  for await (const line of rl) {
    yield line;
  }
}

export function makeObject(obj: object, keys: string[]): object {
  const result = {};
  for (const key of keys) {
    result[ key ] = obj[ key ];
  }

  return result;
}

export function versionCompare(ver1: string, ver2: string) {
  const verList1 = ver1.split('.');
  const verList2 = ver2.split('.');

  for (let i = 0; i < verList1.length && i < verList2.length; i++) {
    if (Number(verList1[ i ]) !== Number(verList2[ i ])) {
      return Number(verList1[ i ]) - Number(verList2[ i ]);
    }
  }

  return verList1.length - verList2.length;
}

export function toBoolean(val: string | boolean) {
  if (typeof val === 'boolean') {
    return val;
  } else if (typeof val === 'string' && [ 'true', 'false', '1', '0' ].includes(val.toLowerCase())) {
    return val.toLowerCase() === 'true' || val === '1';
  }

  throw new BusinessError(ErrorCodes.PARAMETER);
}
