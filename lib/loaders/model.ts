import * as path from 'path';
import * as is from 'is-type-of';
import * as assert from 'assert';
import { deepFindObject } from '../../app/lib/obj_util';
import ObjectProfiler from '../../app/lib/object_profiler';
import AppWorkerLoader from '../loader';

// const MONGO_OPERATORS = [ 'findById', 'findOne', 'aggregate', 'distinct', 'findByIdAndRemove', 'findByIdAndDelete', 'findByIdAndUpdate', 'findOneAndRemove', 'findOneAndDelete', 'findOneAndUpdate', 'insertMany', 'create', 'remove', 'deleteOne', 'deleteMany', 'find', 'update', 'updateOne', 'updateMany', 'replaceOne', 'count' ];
// const SEQUELIZE_OPERATORS = [ 'findAll', 'findByPk', 'findOne', 'aggregate', 'findOrBuild', 'findOrCreate', 'findCreateFind', 'findAndCountAll', 'update', 'upsert', 'max', 'min','sum', 'build', 'bulkBuild', 'create', 'bulkCreate', 'truncate', 'bulkUpdate', 'count', 'destroy', 'restore', 'findOneAndReplace', 'increment' ];

function bindHooks(origClz) {
  typeof origClz.associate === 'function' && origClz.associate();
}

export default {
  loadModel(this: AppWorkerLoader, opt: any) {
    const app = this.app;

    this.timing.start('Load Model');

    if (!app.context.app) {
      Object.defineProperty(app.context, 'app', {
        value: app,
        configurable: true,
        writable: true,
      });
    }
    // 重新绑定所有model
    app.context.origModel = app.context.model;
    delete app.context.model;

    opt = Object.assign({
      override: true,
      caseStyle: 'upper',
      directory: this.getLoadUnits().filter(unit => unit.type === 'framework' || unit.type === 'app' || unit.type === 'gaia-plugin').map(unit => path.join(unit.path, 'app/model')),
    }, opt);

    // 找到model里所有的输出
    this.app.loader.loadToContext(opt.directory, 'model', {
      override: true,
      caseStyle: 'upper',
      filter(model) {
        return model && ((typeof model === 'function' && model.prototype instanceof app.mongoose.Model) || model.sequelize);
      },
      initializer(factory, options) {
        if (!is.class(factory) && typeof factory === 'function') {
          const modelName = options.pathName.split('.', 2)[1];

          return function(app) {
            // if (app.mongoose) {
            //   require('mongoose-long')(app.mongoose);
            //   require("bson").Long.prototype.toJSON=function(){return this.toNumber();}
            // }

            const origClz = factory(app);
            if (origClz && origClz.sequelize) {
              bindHooks(origClz);
            }

            return ctx => {
              Object.defineProperty(origClz, 'ctx', {
                enumerable: false,
                configurable: true,
                value: ctx,
              });
              origClz.createObject = function(...params) {
                const {
                  parent: objectParent,
                  name: objectName,
                } = deepFindObject(ctx.object, modelName);
                assert(
                  objectParent && objectParent[objectName],
                  objectName + '没有找到对应object'
                );
                return (
                  objectParent && objectParent[objectName].create(...params)
                );
              };

              if (!app.config.withNativeModelProfile) {
                return origClz;
              }

              if (origClz.sequelize) {
                return ObjectProfiler.createProfileProxy(origClz, 'sequelize', {
                  from: 'model',
                  table: origClz.tableName,
                }, ctx);
              } else if (origClz.prototype instanceof app.mongoose.Model) {
                return ObjectProfiler.createProfileProxy(origClz, 'mongo', {
                  from: 'model',
                  collection: origClz.collection && origClz.collection.name || origClz.modelName,
                }, ctx);
              }

              return origClz;
            };
          };
        }

        return factory;
      },
    });

    this.timing.end('Load Model');
  },
};
