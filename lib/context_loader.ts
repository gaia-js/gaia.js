import * as assert from 'assert';
import * as is from 'is-type-of';
import * as _ from 'lodash';
import { Context } from 'egg';

const FileLoader = require('egg-core/lib/loader/file_loader');
const CLASSLOADER = Symbol('classLoader');
const EXPORTS = FileLoader.EXPORTS;

const LOADTARGETS = Symbol('gaia@loadTargets');

class ClassLoader {
  _cache: Map<string, any>;
  _ctx: Context;

  constructor(options: { ctx: Context; properties: any }) {
    assert(options.ctx, 'options.ctx is required');
    const properties = options.properties;
    // this._ctx = options.ctx;
    Object.defineProperty(this, '_ctx', {
      enumerable: false,
      configurable: true,
      value: options.ctx,
    });

    for (const property in properties) {
      this.defineProperty(property, properties[property]);
    }

    this._cache = new Map();
  }

  defineProperty(property: string, values: any) {
    if (this[property]) {
      this._cache.delete(property);
    }

    Object.defineProperty(this, property, {
      get() {
        let instance = this._cache.get(property);
        if (!instance) {
          instance = getInstance(values, this._ctx);
          this._cache.set(property, instance);
        }
        return instance;
      },
      enumerable: true,
      configurable: true,
    });
  }
}

/**
 * Same as {@link FileLoader}, but it will attach file to `inject[fieldClass]`. The exports will be lazy loaded, such as `ctx.group.repository`.
 * @extends FileLoader
 * @since 1.0.0
 */
class ContextLoader extends FileLoader {
  /**
   * @class
   * @param {Object} options - options same as {@link FileLoader}
   * @param {String} options.fieldClass - determine the field name of inject object.
   */
  constructor(options: { property: string; inject: any; target: any; fieldClass: any }) {
    assert(options.property, 'options.property is required');
    assert(options.inject, 'options.inject is required');

    const app = options.inject;
    const property = options.property;

    if (!app.context[LOADTARGETS]) {
      app.context[LOADTARGETS] = {};
    }

    let target;
    if (!app.context[LOADTARGETS][property]) {
      app.context[LOADTARGETS][property] = target = options.target = {};
    } else {
      app.context[LOADTARGETS][property] = target = options.target = _.merge(options.target, app.context[LOADTARGETS][property]);
    }

    if (options.fieldClass) {
      options.inject[options.fieldClass] = target;
    }

    super(options);

    // define ctx.service
    Object.defineProperty(app.context, property, {
      get() {
        // distinguish property cache,
        // cache's lifecycle is the same with this context instance
        // e.x. ctx.service1 and ctx.service2 have different cache
        if (!this[CLASSLOADER]) {
          this[CLASSLOADER] = new Map();
        }
        const classLoader = this[CLASSLOADER];

        let instance = classLoader.get(property);
        if (!instance) {
          instance = getInstance(target, this);
          classLoader.set(property, instance);
        }
        return instance;
      },

      configurable: true,
    });
  }
}

export default ContextLoader;

function getInstance(values, ctx: Context) {
  // it's a directory when it has no exports
  // then use ClassLoader
  const Class = values[EXPORTS] ? values : null;
  let instance;
  if (Class) {
    if (is.class(Class)) {
      instance = new Class(ctx);
    } else if (is.function(Class)) {
      instance = Class(ctx);
    } else {
      // it's just an object
      instance = Class;
    }
  // Can't set property to primitive, so check again
  // e.x. module.exports = 1;
  } else if (is.primitive(values)) {
    instance = values;
  } else {
    instance = new ClassLoader({ ctx, properties: values });
  }
  return instance;
}
