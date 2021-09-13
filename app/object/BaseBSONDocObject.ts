import BaseModelObject, { KeyType as BaseKeyType } from './BaseModelObject';
import { ObjectID } from 'mongodb';

export type KeyType = BaseKeyType | ObjectID;

export default class BaseBSONDocObject<KT = KeyType> extends BaseModelObject<KT> {
  _id: KT;

  get id(): KT {
    // if (typeof this._id === 'object' && this._id.toString) {
    //   return (this._id as unknown as ObjectID).toString();
    // }

    // @ts-ignore
    this.ctx.assert((typeof this._id !== 'object' || this._id.toString()) && !Array.isArray(this._id), 'invalid object id: ' + JSON.stringify(this._id));

    return this._id;
  }

  public toJSON() {
    const info = super.toJSON();
    [ 'createdAt', 'updatedAt', '__v' ].forEach(item => delete info[ item ]);
    return info;
  }
}
