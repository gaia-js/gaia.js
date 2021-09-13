import * as _ from 'lodash';
import * as crypto from 'crypto';
import { promisify } from 'util';

export function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function lcfirst(s: string) {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

export function format(pattern: string, value: {[key: string]: string}): string {
  const keys = pattern.match(/\{[^\{.]{1,}\}/g) || [];
  let newKey = pattern;
  for (let key of keys) {
    key = key.replace('{', '').replace('}', '');
    newKey = newKey.replace(`{${key}}`, value[key]);
  }

  return newKey;
}

export function camelToUnderScore(s: string) {
  return s.replace(/[A-Z]/g, (match: string, offset: number, s: string) => (offset > 0 ? '_' : '') + match.toLowerCase());
}

export function underScoreToCamel(str: string) {
  return str.replace(/_([a-z][A-Z]+)/gi, subString => subString.slice(1).replace(/^([a-z])/, s=>s.toUpperCase()));
}

export function sensitivePhone(mobile: string, remainLast = 3) {
  // return phone && phone.replace(/^([0-9]{3})([0-9]{4})/, '$1****');
  const reg = new RegExp(`^(\\d{3})(\\d{${8 - remainLast}})`);
  return mobile && mobile.replace(reg, `$1${''.padStart(8 - remainLast, '*')}`);
}

export function getRandomStr(count = 16, template?: string) {
  let str = '';
  const str_pol = template || 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwxyz';
  const length = str_pol.length - 1;
  for (let i = 0; i < count; i++) {
    str += str_pol[ _.random(length) ];
  }
  return str;
}

export async function randomString(length = 16) {
  return promisify(crypto.randomBytes)(Math.ceil(length / 2)).then(buf => buf.toString('hex').substr(0, length));
}

/**
 * 类似于Array.prototype.splice
 */
export function splice(s: string, idx: number, rem: number, str: string) {
  return s.slice(0, idx) + str + s.slice(idx + Math.abs(rem));
}
