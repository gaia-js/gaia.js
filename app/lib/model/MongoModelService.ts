import { Context } from 'egg';
import { ObjectID } from 'mongodb';
import { Document, Model, UpdateQuery, FilterQuery, Mongoose, Connection } from 'mongoose';
import { MongooseSingleton } from '../../../typings/app';
import * as _ from 'lodash';

import BaseBSONDocObject, { KeyType } from '../../object/BaseBSONDocObject';
import { ObjectProperties } from '../../object/BasePropertiesObject';
import ObjectProfiler from '../object_profiler';
import { deepFindObject } from '../obj_util';
import DBModelService, { CreateOptions, Dao, DBModelOptions } from './DBModelService';
import { MongoSchema } from './DynamicMongoModelService';



// const MONGO_OPERATORS = ['findById', 'findOne', 'aggregate', 'distinct', 'findByIdAndRemove', 'findByIdAndDelete', 'findByIdAndUpdate', 'findOneAndRemove', 'findOneAndDelete', 'findOneAndUpdate', 'insertMany', 'create', 'remove', 'deleteOne', 'deleteMany', 'find', 'update', 'updateOne', 'updateMany', 'replaceOne', 'count'];


export class MongoDao<KT = KeyType, TObj extends BaseBSONDocObject<KT> = BaseBSONDocObject<KT>> implements Dao<KT, TObj> {
  protected ctx: Context;
  protected mongo: Model<Document>;

  constructor(mongoModel: Model<Document> | undefined, profileName: string, ctx: Context) {
    Object.defineProperty(this, 'ctx', {
      enumerable: false,
      configurable: true,
      value: ctx,
    });

    if (mongoModel) {
      this.mongo = ObjectProfiler.createProfileProxy(mongoModel, 'mongo', { from: 'dao', collection: profileName || (mongoModel.collection && mongoModel.collection.name || mongoModel.modelName) }, ctx, { timeout: 200 });
    }
  }

  getObject(doc: Document): ObjectProperties<TObj> {
    const res = doc.toJSON ? doc.toJSON() : JSON.parse(JSON.stringify(doc));
    Object.defineProperty(res, '_doc', {
      enumerable: false,
      value: doc,
    });

    return res;
  }

  validId(id: KT) {
    return id && typeof id === 'object' ? ((id as any).toHexString ? (id as unknown as ObjectID).toHexString() : (id as any).id ? (id as any).id.toString('hex') : (id as any).toString('hex')) : id;
  }

  async fetchOne(id: KT, projection?: string[]): Promise<ObjectProperties<TObj> | null> {
    const res = await this.mongo.findById(this.validId(id), projection);
    return (res && this.getObject(res)) || null;
  }

  async fetchOneWith(clause: any, options?: any, projection?: string[]): Promise<ObjectProperties<TObj> | null> {
    const res = await this.mongo.findOne(clause, projection, options);
    return (res && this.getObject(res)) || null;
  }

  async fetchMany(ids: KT[], projection?: string[]): Promise<Map<KT, ObjectProperties<TObj>>> {
    // @TODO: 应该用map，fetch不到的为null
    const res = await this.mongo.find({ _id: { $in: ids.map(this.validId) } }, projection);

    const results = new Map<KT, ObjectProperties<TObj>>();
    res.forEach((element: Document) => {
      results.set(this.validId(element._id), this.getObject(element));
    });

    return results;
  }

  async fetchAll(clause: any, options?: any, projection?: string[]): Promise<ObjectProperties<TObj>[]> {
    const res = await this.mongo.find(clause, projection || null, options || null);

    return res.map((el: Document) => this.getObject(el));
  }

  // async create(values: UpdateQuery<TObj>, options: { load: any } & Partial<CreateOptions>): Promise<[ ObjectProperties<TObj>, boolean ]>;
  async create(values: ObjectProperties<TObj> | UpdateQuery<TObj>, options: Partial<CreateOptions> = {}): Promise<[ ObjectProperties<TObj>, boolean ]> {
    if (options && options.load) {
      const obj = await this.mongo.findOneAndUpdate(options.load, values, { upsert: true, new: true, ...(options && options.daoOptions || {}) }) as Document;
      if (!obj) {
        throw this.ctx.service.error.createBusinessError({ msg: '更新失败' });
      }

      return [ this.getObject(obj), obj.isNew ];
    }

    const objects: Document[] = await this.mongo.create([ values ] as any/* as CreateQuery<Document>[] */, options && options.daoOptions || {} /* as SaveOptions */) as any;
    if (objects.length === 0) {
      throw this.ctx.service.error.createBusinessError({ msg: '保存失败' });
    }

    return [ this.getObject(objects[ 0 ]), objects[ 0 ].isNew ];
  }

  async updateOne(values: ObjectProperties<TObj>, obj: TObj, options?: any): Promise<number> {
    this.ctx.assert(obj instanceof BaseBSONDocObject, 'invalid obj type');

    const doc: Document = (obj.getProperties() as any)._doc;

    // 目前从缓存中取出来的obj是没有_doc的，也许应该考虑也创建一个
    if (!doc || Object.keys(values).some(key => key.startsWith('$'))) {
      const res = await this.mongo.updateOne({ _id: this.validId(obj._id) }, values, options);

      return res && res.ok ? res.nModified : -1;
    }

    Object.keys(values).forEach(name => {
      // 对于数组或Map等复杂字段都应该是整体覆盖，合并逻辑应该在调用之前由上层业务逻辑控制
      doc[ name ] = values[ name ];

      doc.markModified(name);
    });

    try {
      await doc.save();
    } catch (err) {
      this.ctx.logCritical({ type: 'mongo_error', msg: 'save failed', err, detail: { obj, values } });

      throw err;
    }

    obj.setProperties(this.getObject(doc));

    return 1;
  }

  async findOneAndUpdate(values: UpdateQuery<TObj>, obj: FilterQuery<TObj>, options?: any): Promise<[ ObjectProperties<TObj> | null, boolean, boolean ]> {
    if (!obj) {
      const err = new Error('invalid filter');
      this.ctx.logCritical({ type: 'mongo_error', msg: 'invalid mongo query', err, detail: { collection: this.mongo.collection.name, values, obj }});
      throw err;
    }

    const doc = await this.mongo.findOneAndUpdate(obj as any, values, { new: true, ...(options || {}) }) as Document;

    return doc ? [ this.getObject(doc), doc.isNew, doc.isModified() ] : [ null, false, false ];
  }

  async updateMany(conditions: any, values: ObjectProperties<TObj>): Promise<number> {
    const res = await this.mongo.updateMany(conditions, values);

    return res && res.ok && res.nModified;
  }

  async count(clause: any): Promise<number> {
    return await this.mongo.countDocuments(clause);
  }

  async remove(id: KT): Promise<boolean> {
    const ret = await this.mongo.deleteOne({ _id: this.validId(id) });
    return ret && ret.deletedCount === 1;
  }
}

export interface MongoModelOptions<T> extends DBModelOptions<T> {
  database: string;
  collection: string;
}

export default class MongoModelService<T extends BaseBSONDocObject<KT>, KT = KeyType, TDao extends MongoDao<KT, T> = MongoDao<KT, T>> extends DBModelService<KT, T, TDao, MongoModelOptions<T>> {
  protected _dao: TDao;

  protected get dao() {
    if (!this._dao) {
      this._dao = new MongoDao<KT, T>(this.model, this.daoName, this.ctx) as unknown as TDao;
    }

    return this._dao;
  }

  protected get model() {
    const daoRootName = this.option('modelSourceName', 'model')!;
    const daoRoot = this.ctx[ daoRootName ];

    let model: Model<Document> | undefined;

    if (daoRoot) {
      model = deepFindObject(daoRoot, this.daoName)?.obj;
    }

    if (!model) {
      const schema = this.schema;
      const dbName: string | undefined = this.option('database');
      const collection: string = this.option('collection')!;
      this.app.assert(collection, 'collection should be specified');

      const mongooseDB = (this.app as any).mongooseDB as MongooseSingleton;
      const mongoose = (this.app as any).mongoose as Mongoose;

      const connection = dbName && mongooseDB.get ? mongooseDB.get(dbName) as Connection : mongoose.connection;

      if (!(this.app as any)._mongoModelCache) {
        (this.app as any)._mongoModelCache = {};
      }

      model = (this.app as any)._mongoModelCache[`${dbName || 'default'}.${collection}`];
      if (!model) {
        model = (this.app as any)._mongoModelCache[`${dbName || 'default'}.${collection}`] = connection.model(
          this.constructor.prototype.pathName || this.constructor.name,
          new mongoose.Schema(
            schema,
            {
              timestamps: true,
              collection,
              ...(schema.options || {}),
            }
          ),
          collection
        ) as any;
      }
    }

    if (!model) {
      throw new Error(`cannot find ${this.daoName} in ctx.${daoRootName} or schema not defined`);
    }

    return model;
  }

  protected get schema(): MongoSchema {
    throw new Error('schema not provided');
  }

  async remove(obj: T | KT) {
    if (typeof obj === 'object' && (obj as any)._bsontype === 'ObjectID') {
      obj = await this.load(obj as KT, { skipSetCache: true }) as T;

      if (obj === null) {
        return true;
      }
    }

    return await super.remove(obj);
  }

  protected validId(id: KT) {
    return this.dao.validId(id);
  }

  // async update(obj: T, values: UpdateQuery<T>) {
  //   await this.modify(obj, values);

  //   return obj;
  // }

  /**
   *
   * @param obj
   * @param values @see https://docs.mongodb.com/manual/reference/operator/update/
   */
  async modify(obj: T, values: UpdateQuery<T>) {
    try {
      const res = await this.dao.findOneAndUpdate(values, { _id: this.dao.validId(obj._id) }, { ...(this.option('projection') ? { projection: this.option('projection') } : {}) });

      if (!res[ 0 ]) {
        return false;
      }

      await this._updateCache(obj, res[ 0 ], undefined, { overwrite: true });

      // obj.setProperties(res[0]);
      obj.overwriteProperties(res[ 0 ]);

      return true; // res[2];
    } catch (err) {
      this.ctx.logCritical({ msg: 'cannot modify', err, detail: { obj, values } });
      return false;
    }
  }

  /**
   * 这个方法可能造成自动注册的缓存清理不能正常工作，因为不知道变更之前的数据，无法清理变更前的查询条件的缓存
   * @param obj
   * @param values
   * @returns
   */
  protected async findOneAnyModify(filter: FilterQuery<T>, values: UpdateQuery<T>) {
    try {
      const res = await this.dao.findOneAndUpdate(values, filter, { ...(this.option('projection') ? { projection: this.option('projection') } : {}) });

      if (!res[ 0 ]) {
        this.ctx.logCritical({ msg: 'findOneAnyModify failed', detail: { filter, values } });
        return null;
      }

      const obj = this.createObject(res[ 0 ]);

      await this._updateCache(obj);

      return obj;
    } catch (err) {
      this.ctx.logCritical({ msg: 'cannot modify', err, detail: { filter, values } });
      return null;
    }
  }
}
