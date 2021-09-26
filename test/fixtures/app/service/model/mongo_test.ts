import { ObjectID } from 'mongodb';
import { Context } from 'egg';

import MongoModelService from '../../../../../app/lib/model/MongoModelService';
import MongoTestObject from '../../object/mongo_test';
import { Schema } from 'mongoose';
import { ObjectProperties } from '../../../../../app/object/BasePropertiesObject';

export default class MongoTestServiceModel extends MongoModelService<MongoTestObject, ObjectID> {
  constructor(ctx: Context) {
    super(ctx, {
      objectModelClass: MongoTestObject,
      projection: [ 'field_map', 'field_array', 'field_number', 'field_str', 'field_date' ],
      database: 'test',
      collection: 'mongo_test',
    });

    this.registerLoadMultiWith([ 'field_str' ]);
    this.registerCountWith([ 'field_str' ]);

    this.registerLoadMultiWith([ 'field_number' ]);

    // for test
    this.registerLoadMultiWith([ { field_number: 1 } ]);
    this.registerLoadMultiWith({ field_number: 2 });
  }

  get schema() {
    return {
      _id: { type: Schema.Types.ObjectId, comment: '' },
      field_map: { type: Map, of: String },
      field_array: { type: [ String ] },
      field_big: { type: Map, of: String },
      field_str: { type: String },
      field_number: { type: Number },
      field_date: { type: Date },
    };
  }

  async loadMultiWithFieldStr(value: string) {
    return await this.loadMultiWith({ field_str: value });
  }

  async countWithFieldStr(field_str: string) {
    return await this.countWith({ field_str });
  }

  async updateOneByNumberField(values: ObjectProperties<MongoTestObject>, field_number: number) {
    return await this.findOneAnyModify({ field_number }, values as any);
  }

  async removeAllByNumberField(field_number: number) {
    const objs = await this.loadMultiWith({ field_number });
    await Promise.all(objs.map(obj => this.remove(obj)));
  }
}
