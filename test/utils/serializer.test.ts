import * as assert from 'assert';
import { tester } from '../bootstrap';
import { Context } from 'egg';
import { serialize, deserialize, SerializeType } from '../../app/lib/serialize';
import { ObjectID } from 'mongodb';

tester('test/utils/serializer.test.ts', async (it) => {
  it('serialize', async (ctx: Context) => {
    const value = { str: new ObjectID().toHexString(), num: Date.now(), n: null, date: new Date(), obj: new ObjectID() };

    for (let type of [ 'json', 'v8', 'bson' ] as SerializeType[]) {
      const serialized = await serialize(value, { type });
      const deserialized: typeof value = await deserialize(serialized);

      assert(value.str === deserialized.str, `should match string value for ${type}`);
      assert(value.num === deserialized.num, `should match number value for ${type}`);
      assert(value.n === deserialized.n, `should match null value for ${type}`);

      if (type === 'v8' || type === 'bson') {
        assert(deserialized.date instanceof Date && deserialized.date.valueOf() === value.date.valueOf(), `should match date value for ${type}`);
      }

      if (type === 'bson') {
        // assert(deserialized.obj instanceof ObjectID && deserialized.obj.toHexString() === value.obj.toHexString(), `should match object value for ${type}`);
        assert(deserialized.obj && deserialized.obj.toHexString && deserialized.obj.toHexString() === value.obj.toHexString(), `should match object value for ${type}`);
      }
    }

    for (let value of [ undefined, null, 0, 999, 'string value' ]) {
      for (let type of [ 'json', 'v8', 'bson' ] as SerializeType[]) {
        const serialized = await serialize(value, { type });
        const deserialized: typeof value = await deserialize(serialized);

        assert(deserialized === value, `should match for ${value} with type ${type}`);
      }
    }
  });
});
