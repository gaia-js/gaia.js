import { Application, Context } from 'egg';
import MongoModelService, { MongoDao } from './MongoModelService';
import { Collection, FilterQuery, Schema, UpdateQuery } from 'mongoose';
import BaseBSONDocObject from '../../object/BaseBSONDocObject';
import { ObjectProperties } from '../../object/BasePropertiesObject';
import { CreateOptions } from './DBModelService';
import { SchemaDefinition, Schema as MongooseSchema } from 'mongoose';

export interface DynamicMongoCollectionResolver<KT = KeyType, TObj extends BaseBSONDocObject<KT> = BaseBSONDocObject<KT>> {
  resolveById(id: KT, dao?: DynamicMongoDao<KT, TObj>): Collection;
  resolveSingleByClause(clause: FilterQuery<TObj>, dao?: DynamicMongoDao<KT, TObj>): Collection;
  resolveCreate(value: ObjectProperties<TObj>, dao?: DynamicMongoDao<KT, TObj>): Collection;
  resolveByClause(clause: FilterQuery<TObj>, dao?: DynamicMongoDao<KT, TObj>): Collection[];
}

export type MongoSchema = SchemaDefinition;

class DynamicMongoDao<KT = KeyType, TObj extends BaseBSONDocObject<KT> = BaseBSONDocObject<KT> > extends MongoDao<KT, TObj> {
  schema: Schema<any> | MongoSchema;
  daoName: string;
  collectionResolver: DynamicMongoCollectionResolver<KT, TObj>;

  constructor(collectionResolver: DynamicMongoCollectionResolver<KT, TObj>, schema: Schema<any> | MongoSchema, daoName: string, ctx: Context) {
    super(undefined, daoName, ctx);

    this.schema = schema;
    this.daoName = daoName;
    this.collectionResolver = collectionResolver;
  }

  private getModelDao(collection: Collection): MongoDao<KT, TObj> {
    const app: Application = this.ctx.app;

    const key = `${collection.conn.db.databaseName}.${collection.name}`;

    if (!(app as any)._mongoModelCache) {
      (app as any)._mongoModelCache = {};
    }

    if (!(app as any)._mongoModelCache[key]) {
      const Schema = (app as any).mongoose.Schema as typeof MongooseSchema;

      (app as any)._mongoModelCache[key] = collection.conn.model(
        key/* collection.name */,
        this.schema instanceof Schema ? this.schema : new Schema(
          this.schema,
          {
            timestamps: true,
            ...(this.schema.options || {}),
            collection: collection.name,
          }
        ),
        collection.name,
      );
    }

    return new MongoDao<KT, TObj>((app as any)._mongoModelCache[key], this.daoName, this.ctx);
  }

  private resolveById(id: KT) {
    return this.getModelDao(this.collectionResolver.resolveById(id, this));
  }

  private resolveSingleByClause(clause: FilterQuery<TObj>) {
    return this.getModelDao(this.collectionResolver.resolveSingleByClause(clause, this));
  }

  private resolveByClause(clause: FilterQuery<TObj>) {
    return this.collectionResolver.resolveByClause(clause, this).map(model => this.getModelDao(model));
  }

  private resolveCreate(values: ObjectProperties<TObj>) {
    return this.getModelDao(this.collectionResolver.resolveCreate(values, this));
  }

  async fetchOne(id: KT, projection?: string[]): Promise<ObjectProperties<TObj>|null> {
    return await this.resolveById(id).fetchOne(id, projection);
  }

  async fetchOneWith(clause: any, options?: any, projection?: string[]): Promise<ObjectProperties<TObj>|null> {
    return await this.resolveSingleByClause(clause).fetchOneWith(clause, options, projection);
  }

  async fetchMany(ids: KT[], projection?: string[]): Promise<Map<KT, ObjectProperties<TObj>>> {
    // @TODO: 应该用map，fetch不到的为null

    const daos: {
      [ key: string ]: {
        dao: MongoDao<KT, TObj>;
        ids: KT[];
      };
    } = {};

    ids.forEach(id => {
      const collection = this.collectionResolver.resolveById(id, this);
      if (!daos[collection.name]) {
        daos[ collection.name ] = {
          ids: [ id ],
          dao: this.getModelDao(collection),
        };
      } else {
        daos[collection.name].ids.push(id);
      }
    });

    const res = await Promise.all(Object.values(daos).map(({ dao, ids }) => dao.fetchMany(ids, projection)));

    const results = new Map<KT, ObjectProperties<TObj>>();
    res.forEach(it => it.forEach((el, id) => results.set(id, el as any)));

    return results;
  }

  async fetchAll(clause: any, options?: any, projection?: string[]): Promise<ObjectProperties<TObj>[]> {
    const results = await Promise.all(this.resolveByClause(clause).map(dao => dao.fetchAll(clause, options, projection)));

    return results.reduce((p, c) => p.concat(c), []);
  }

  async create(values: ObjectProperties<TObj>, options: Partial<CreateOptions> = {}): Promise<[ ObjectProperties<TObj>, boolean]> {
    return await this.resolveCreate(values).create(values, options);
  }

  async updateOne(values: ObjectProperties<TObj>, obj: TObj): Promise<number> {
    return await this.resolveById(obj._id).updateOne(values, obj);
  }

  async findOneAndUpdate(values: UpdateQuery<TObj>, filter: FilterQuery<TObj>, options?: any): Promise<[ ObjectProperties<TObj> | null, boolean, boolean ]> {
    const dao = this.resolveSingleByClause(filter);
    this.ctx.assert(dao, 'should resolve collection');

    return await dao.findOneAndUpdate(values, filter, options);
  }

  async updateMany(conditions: any, values: ObjectProperties<TObj>): Promise<number> {
    const results = await Promise.all(this.resolveByClause(conditions).map(dao => dao.updateMany(conditions, values)));
    return results.reduce((p, c) => p + c, 0);
  }

  async count(clause: any): Promise<number> {
    const results = await Promise.all(this.resolveByClause(clause).map(dao => dao.count(clause)));
    return results.reduce((p, c) => p + c, 0);
  }

  async remove(id: KT): Promise<boolean> {
    return await this.resolveById(id).remove(id);
  }
}

export default class DynamicMongoModelService<T extends BaseBSONDocObject<KT>, KT = KeyType, TDao extends DynamicMongoDao<KT, T> = DynamicMongoDao<KT, T>> extends MongoModelService<T, KT, TDao> {
  // protected _dao: DynamicMongoDao<KT>;

  get collectionResolver(): DynamicMongoCollectionResolver<KT, T> {
    throw new Error('collectionResolver not implemented');
  }

  protected get schema(): MongoSchema {
    if (!this.app.model[ this.daoName ]) {
      throw new Error('schema not provided');
    }

    // 在dao中直接传schema，不用definition了（貌似schema没有暴露接口可以取到definition）
    return undefined as any;
  }

  protected get dao() {
    if (!this._dao) {
      let schema: MongoSchema | Schema<any> = this.schema;
      if (!schema) {
        const modelInstance = this.app.model[ this.daoName ];
        if (modelInstance) {
          schema = modelInstance.schema;
        }
      }

      if (!schema) {
        throw new Error('schema not provided');
      }

      this._dao = new DynamicMongoDao<KT, T>(this.collectionResolver, schema, this.daoName, this.ctx) as unknown as TDao;
    }

    return this._dao;
  }

  selectCollection(collectionName: string): this {
    const clz = this.constructor as { new(ctx: Context): any }; // Object.getPrototypeOf(this);

    const originCollectionName = this.option('collection');
    this.setOption('collection', collectionName);
    const collection = this.model.db.collection(collectionName);
    this.setOption('collection', originCollectionName);

    return new class extends clz {
      constructor(ctx: Context) {
        super(ctx);

        this.setOption('collection', collectionName);
      }

      // TODO 应该考虑在不同的collection的同一个查询条件可能查出来的集合是不一样的，所以应该有前缀区别，但是同一条记录的不同前缀的缓存怎么维护呢
      protected cacheKeyOf(clause: Partial<{ [ K in keyof T ]: T[ K ] | any }>, fetchOptions?: any, autoRegistered = false) {
        return `${collectionName}:${super.cacheKeyOf(clause, fetchOptions, autoRegistered)}:`;
      }

      get collectionResolver() {
        return new class implements DynamicMongoCollectionResolver<KT, T> {
          resolveById(id: KT, dao?: DynamicMongoDao<KT, T>): Collection {
            return collection;
          }

          resolveSingleByClause(clause: FilterQuery<T>, dao?: DynamicMongoDao<KT, T>): Collection {
            return collection;
          }

          resolveCreate(value: ObjectProperties<T>, dao?: DynamicMongoDao<KT, T>): Collection {
            return collection;
          }

          resolveByClause(clause: FilterQuery<T>, dao?: DynamicMongoDao<KT, T>): Collection[] {
            return [ collection ];
          }
        }();
      }
    }(this.ctx) as any;
  }
}
