import { promisify } from "util";

import * as zlib from 'zlib';

export async function gzip(data: Buffer, start?: number, end?: number): Promise<Buffer> {
  // return new Promise((resolve, reject) => {
  //   zlib.gzip(start || end ? data.slice(start || 0, end): data, (err, ziped: Buffer) => {
  //     if (err) {
  //       reject(err);
  //       return;
  //     }

  //     resolve(ziped);
  //   });
  // });
  return promisify(zlib.gzip)(start || end ? data.slice(start || 0, end): data) as Promise<Buffer>;
}

export async function gunzip(data: Buffer, start?: number, end?: number): Promise<Buffer> {
  // return new Promise((resolve, reject) => {
  //   zlib.gunzip(start || end ? data.slice(start || 0, end): data, (err, unziped: Buffer) => {
  //     if (err) {
  //       reject(err);
  //       return;
  //     }

  //     resolve(unziped);
  //   });
  // });

  return promisify(zlib.gunzip)(start || end ? data.slice(start || 0, end): data) as Promise<Buffer>;
}
