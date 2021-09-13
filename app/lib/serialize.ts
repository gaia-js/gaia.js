import BasePropertiesObject from '../object/BasePropertiesObject';
import { gzip, gunzip } from './gzip';
import * as BSON from 'bson-ext';
import * as v8 from 'v8';

const debug = require('debug')('gaia:serialize');

// export function serialize(value: any): string {
//   return JSON.stringify(value instanceof BasePropertiesObject ? value.toJSON() : value);
// }

// export function unserialize(value: string): any {
//   if (typeof value === "string") {
//     try {
//       return JSON.parse(value);
//     } catch (err) {
//       return value;
//     }
//   } else {
//     return value;
//   }
// }

export type SerializeType = 'json' | 'bson' | 'v8';

function fallbackDeserialize(value: string): any {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch (err) {
      return undefined;
    }
  } else {
    return value;
  }
}

export interface SerializerOptions {
  compress: boolean;
  type: SerializeType | undefined;
}

const _bson = new BSON([ BSON.Binary, BSON.Code, BSON.DBRef, BSON.Decimal128, BSON.Double, BSON.Int32, BSON.Long, BSON.Map, BSON.MaxKey, BSON.MinKey, BSON.ObjectId, BSON.BSONRegExp, BSON.Symbol, BSON.Timestamp ]);

function bson() {
  return _bson;
}

export default class Serializer {
  static async serialize(value: any, options?: Partial<SerializerOptions>) {
    options = Object.assign({ compress: true, type: 'json' }, options || {});

    /**
     * 0 1 2 3  4 5 6 7
     * 第0位保留扩展 固定为0
     * 1 固定为 1
     * 2 保留，固定为 0
     * 3 4 为版本号，当前为0 1
     * 5 6 为编码方式，0 0为没有序列化, 0 1为json，1 0为bson, 1 1为v8
     * 7 是否压缩
     */

    let header = 0x48;

    if (typeof value !== 'string') {
      if (value === undefined || options.type === 'v8') {
        try {
          value = v8.serialize(value);
          header = (header | 0x06) >>> 0;

          options.type = 'v8';
        } catch (err) {
          debug('bson serialize failed:', value);
          options.type = 'json';
        }
      } else if (options.type === 'bson') {
        try {
          value = bson().serialize({ __value: value instanceof BasePropertiesObject ? value.toJSON() : value });
          header = (header | 0x04) >>> 0;
        } catch (err) {
          debug('bson serialize failed:', value);
          options.type = 'json';
        }
      }

      if (options.type === 'json' || !options.type) {
        value = JSON.stringify(value instanceof BasePropertiesObject ? value.toJSON() : value);
        header = (header | 0x02) >>> 0;
      }
    }

    let buffer = Buffer.from(value, 'utf-8');
    if (options.compress && buffer.length > 64) {
      buffer = await gzip(buffer);

      header = (header | 0x01) >>> 0;
    }

    return Buffer.concat([Buffer.from(new Uint8Array([ header ])), buffer]);
  }

  static async deserialize(value: Buffer | string): Promise<any> {
    let res: string | undefined = undefined;

    if (typeof value === 'number') {
      return value;
    }

    if (!value || value.length === 0) {
      return undefined;
    }

    if (!Buffer.isBuffer(value)) {
      res = value;
      value = Buffer.from(value, 'utf-8');
    }

    const header: number = value[0];
    if ((header & 0xE0 >>> 0) !== 0x40) {
      // 不匹配的头，用原来的兼容方式解码
      return fallbackDeserialize(res || value.toString('utf-8'));
    }

    if ((header & 0x01) >>> 0 === 0x01) {
      try {
        value = await gunzip(value, 1);
      } catch (err) {
        debug('deserialize gunzip failed:', err);
        return fallbackDeserialize(res || value.toString('utf-8'));
      }
    } else {
      value = value.slice(1);
    }

    switch ((header & 0x06) >>> 1) {
      case 1:
        // json
        res = value.toString('utf-8');
        try {
          return JSON.parse(res);
        } catch (err) {
          debug('deserialize json parse failed:', err);
          return res;
        }

      case 2:
        // bson
        try {
          const result = bson().deserialize(value);
          return result.__value !== undefined ? result.__value : result;
        } catch (err) {
          debug('deserialize bson parse failed:', err);
          return undefined;
        }

      case 3:
        // v8
        try {
          const result = v8.deserialize(value);
          return result;
        } catch (err) {
          debug('deserialize bson parse failed:', err);
          return undefined;
        }
    }

    return value.toString('utf-8');
  }
}

export async function serialize(value: any, options?: Partial<SerializerOptions>) {
  return await Serializer.serialize(value, options);
}

export async function deserialize(value: Buffer | string) {
  return await Serializer.deserialize(value);
}

/**
 * @deprecated
 */
export const unserialize = deserialize;
