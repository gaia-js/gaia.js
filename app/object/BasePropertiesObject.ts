import { Context } from 'egg';
import Schema from '../lib/schema';
import BaseObject from './BaseObject';

export type KEY_OF<T> = keyof T;
export type VALUE_OF<T> = T[keyof T];

export type ObjectProperties<T> = Partial<{ [ K in keyof T ]: T[K] }>;

export function enumerable(value: boolean) {
  // tslint:disable-next-line: no-function-expression
  return function(target: any, propertyKey: string, descriptor?: PropertyDescriptor) {
    if (!descriptor) {
      descriptor = Object.getOwnPropertyDescriptor(target, propertyKey) || {};
    }

    if (!!descriptor.enumerable !== !!value) {
      descriptor.enumerable = value;
      descriptor.writable = true;

      Object.defineProperty(target, propertyKey, descriptor);
    }
  };
}

export default class BasePropertiesObject extends BaseObject {
  // [x: string]: any;
  private _properties: ObjectProperties<this>;

  constructor(properties: ObjectProperties<any>, ctx?: Context) {
    super(ctx);

    // this._properties = properties;
    Object.defineProperty(this, '_properties', {
      configurable: true,
      enumerable: false,
      writable: true,
      value: properties,
    });

    function recursiveSearchKey(o: any, key: string) {
      const proto = Object.getPrototypeOf(o);
      if (!proto || proto === BasePropertiesObject.prototype || proto === Function.prototype) {
        return false;
      }

      if (Object.getOwnPropertyDescriptor(proto, key)) {
        return true;
      }

      return recursiveSearchKey(proto, key);
    }

    properties && typeof properties === 'object' &&
      Object.entries(properties).forEach(([ key ]) => {
        if (!this.hasOwnProperty(key) && !this.constructor.prototype.hasOwnProperty(key) && !recursiveSearchKey(this.constructor.prototype, key)) {
          this.addProperty(key as any);
        }
      });
  }

  hasProperty<K extends keyof this>(key: K) {
    const properties = this.getProperties();
    return properties && properties.hasOwnProperty(key);
  }

  getProperty<K extends keyof this>(key: K, defaultValue?: this[K]): this[K] {
    const properties = this.getProperties();
    return properties && (properties.hasOwnProperty(key) || typeof defaultValue === 'undefined') ? properties[key as string] : defaultValue;
  }

  private addProperty<K extends keyof this>(key: K) {
    Object.defineProperty(this, key, {
      configurable: true,
      enumerable: true,
      get: () => {
        return this._properties[key];
      },
      set: value => {
        this._properties[key] = value;
      },
    });
  }

  setProperty<K extends keyof this>(key: K, value: this[K]) {
    if (!this._properties.hasOwnProperty(key)) {
      this.addProperty(key);
    }

    this._properties[key] = value;
  }

  deleteProperty<K extends keyof this>(key: K) {
    if (this.hasProperty(key)) {
      delete this._properties[ key ];
      delete this[ key ];
    }
  }

  getProperties() {
    if (this._properties && typeof this._properties === 'object' && !Array.isArray(this._properties)) {
      for (const key of Object.keys(this)) {
        if (typeof this[ key ] !== 'function' && !this._properties.hasOwnProperty(key)) {
          this._properties[key] = this[key];
          delete this[key];

          this.addProperty(key as any);
        }
      }
    }

    return this._properties;
  }

  setProperties(properties: ObjectProperties<this>) {
    for (const [ key, value ] of Object.entries(properties)) {
      this.setProperty(key as keyof this, value);
    }
  }

  overwriteProperties(properties: ObjectProperties<this>) {
    const keys = Object.keys(properties);
    for (const key of Object.keys(this._properties || {}).filter(k => !keys.includes(k))) {
      this._properties[ key ] = undefined;
    }

    this.setProperties(properties);
  }

  toJSON() {
    return this.getProperties();
  }

  async dump<TSchema extends Schema = Schema>(schema?: { new(data: any, ctx?: Context): TSchema } ): Promise<any> {
    if (schema) {
      return (new schema(this, this.ctx)).dump();
    }

    return this.toJSON() as any;
  }
}
