import { Context } from 'egg';
import BaseBSONDocObject from '../../../../app/object/BaseBSONDocObject';

import { ObjectID } from 'mongodb';
import { ObjectProperties } from '../../../../app/object/BasePropertiesObject';

export default class MongoTestObject extends BaseBSONDocObject<ObjectID> {
  field_map: Map<string, string>;
  field_array: Array<string>;
  field_number: number;
  field_str: string;
  field_date: Date;
  field_big: any;

  constructor(properties: ObjectProperties<MongoTestObject>, ctx: Context) {
    super(properties, ctx);

    if (this.field_map && typeof this.field_map === 'object' && !(this.field_map instanceof Map)) {
      this.field_map = new Map(Object.entries(this.field_map));
    }

    if (!this.field_array) {
      this.field_array = [];
    }
  }

  setProperties(obj: ObjectProperties<this>) {
    super.setProperties(obj);

    if (this.field_map && typeof this.field_map === 'object' && !(this.field_map instanceof Map)) {
      this.field_map = new Map(Object.entries(this.field_map));
    }
  }
}
