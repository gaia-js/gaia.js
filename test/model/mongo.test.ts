// tslint:disable: max-func-body-length
import { gaiaTester as tester } from '../bootstrap';
import { ObjectID } from 'mongodb';
import { isNull } from 'lodash';
import * as assert from 'assert';
import MongoTestObject from '../fixtures/app/object/mongo_test';

tester(__filename, async it => {
  it('load', async ctx => {
    const id = new ObjectID();
    let obj = await ctx.service.model.mongoTest.load(id);

    assert(isNull(obj), 'should not load');

    obj = ctx.object.MongoTest.create({ _id: id });
    obj = await ctx.service.model.mongoTest.save(obj!);

    assert(obj && obj._id.toHexString() === id.toHexString(), 'should load');

    // 先加载到缓存
    await ctx.service.model.mongoTest.load(id);

    // 从couchbase cache中load出来的没有_doc信息
    ctx.service.cache.runtime.clear();

    obj = await ctx.service.model.mongoTest.load(id, { skipRuntimeCache: true }) as MongoTestObject;
    assert(obj && obj.field_number === undefined);

    obj = await ctx.service.model.mongoTest.update(obj, { field_number: 2 }) as MongoTestObject;
    assert(obj && obj.field_number === 2);

    await ctx.service.model.mongoTest.remove(id);

    obj = await ctx.service.model.mongoTest.load(id);
    assert(isNull(obj), 'should not load');
  });

  it('map_field', async ctx => {
    const id = new ObjectID();
    let obj: MongoTestObject | null;

    // @ts-ignore
    obj = ctx.object.MongoTest.create({ _id: id, field_map: { k1: 'v1' }, field_big: { f1: 'f1' }, field_number: 1, field_str: 'str', field_date: Date.now() });
    obj = await ctx.service.model.mongoTest.create(obj!.getProperties());

    assert(obj && obj._id.equals(id), 'should create');
    assert(obj && obj.field_map.get('k1') === 'v1', 'should have field k1');
    // 创建的时候还是有的
    assert(obj && obj.hasProperty('field_big'));

    try {
      await ctx.service.model.mongoTest.create(obj!.getProperties());
      assert(false, 'should not create while created already');
    } catch (err) {
      //assert(err instanceof MongoError && err.code === 11000, 'create while already exists');
      assert(err instanceof Error && err.name === 'MongoError' && (err as any).code === 11000, 'create while already exists');
    }

    await ctx.service.model.mongoTest.modify(obj as MongoTestObject, { $set: { 'field_map.k2': 'v2' } });
    assert(obj && obj.field_map.get('k2') === 'v2', 'should have field k2');

    await ctx.service.model.mongoTest.modify(obj as MongoTestObject, { $inc: { field_number: 1 } });
    assert(obj && obj.field_number === 2, 'should have field k2');

    await ctx.service.model.mongoTest.removeCache(id);
    obj = await ctx.service.model.mongoTest.load(id);
    assert(obj && obj.field_map.get('k1') === 'v1' && obj.field_map.get('k2') === 'v2', 'should have field k1');
    // field_big 在load的时候被排除在外了
    assert(obj && !obj.hasProperty('field_big'));

    obj = await ctx.service.model.mongoTest.load(id);
    assert(obj && obj.field_map.get('k1') === 'v1' && obj.field_map.get('k2') === 'v2', 'should have field k1');

    await ctx.service.model.mongoTest.modify(obj as MongoTestObject, { $unset: { 'field_map.k2': '' } });
    assert(obj && !obj.field_map.has('k2') && obj.field_map.get('k1') === 'v1', 'must not have field k2');
    // field_big 在load的时候被排除在外了
    assert(obj && !obj.hasProperty('field_big'));

  });

  it('loadMultiWith', async ctx => {
    let values = await ctx.service.model.mongoTest.loadMultiWithFieldStr('field_str_value');
    if (values.length > 0) {
      for (const item of values) {
        await ctx.service.model.mongoTest.remove(item);
      }
    }

    values = await ctx.service.model.mongoTest.loadMultiWithFieldStr('field_str_value');
    assert(values.length === 0);

    const id1 = new ObjectID();
    const obj1 = await ctx.service.model.mongoTest.create({ _id: id1, field_number: 123, field_str: 'field_str_value' });

    values = await ctx.service.model.mongoTest.loadMultiWithFieldStr('field_str_value');
    assert(values.length === 1 && values[ 0 ]._id.toHexString() === id1.toHexString() && values[ 0 ].field_number === 123);

    await ctx.service.model.mongoTest.update(obj1!, { field_number: 321 });

    values = await ctx.service.model.mongoTest.loadMultiWithFieldStr('field_str_value');
    assert(values.length === 1 && values[ 0 ]._id.toHexString() === id1.toHexString() && values[ 0 ].field_number === 321);

    const id2 = new ObjectID();
    await ctx.service.model.mongoTest.create({ _id: id2, field_str: 'field_str_value' });

    values = await ctx.service.model.mongoTest.loadMultiWithFieldStr('field_str_value');
    assert(values.length === 2);

    await ctx.service.model.mongoTest.remove(id1);

    values = await ctx.service.model.mongoTest.loadMultiWithFieldStr('field_str_value');
    assert(values.length === 1);

    await ctx.service.model.mongoTest.update(values[0], { field_number: 123 });
    assert(values[0].field_number === 123, 'update');

    await ctx.service.model.mongoTest.remove(id2);

    values = await ctx.service.model.mongoTest.loadMultiWithFieldStr('field_str_value');
    assert(values.length === 0);
  });

  it('load', async ctx => {
    await ctx.service.model.mongoTest.removeAllByNumberField(123);

    const obj = ctx.object.MongoTest.create({ _id: new ObjectID(), field_str: '123', field_number: 123 });
    assert(await ctx.service.model.mongoTest.create(obj.getProperties()) !== null);

    const objects = await ctx.service.model.mongoTest.loadMultiWithFieldStr(123 as any);

    // 类型不匹配的数据应该查不出来，不支持类型自动转换；loadMultiWith的key也是不一样的
    assert(objects.length === 0, 'should not load');

    const obj2 = await ctx.service.model.mongoTest.updateOneByNumberField({ field_str: '321' }, 123);
    assert(obj2 && obj2._id.toHexString() === obj._id.toHexString() && obj2.field_str === '321');

    await ctx.service.model.mongoTest.remove(obj.id);
  });

  it('load create', async ctx => {
    let obj = await ctx.service.model.mongoTest.create({ _id: new ObjectID(), field_str: 'my field' });
    assert(obj !== null);
    obj = await ctx.service.model.mongoTest.load(obj!.id);
    assert(obj, 'should load');
    await ctx.service.model.mongoTest.remove(obj!.id);
    assert((await ctx.service.model.mongoTest.load(obj!.id)) === null, 'should not load');
  });

  it('loadMultiWith create', async ctx => {
    const field_str = `my field ${new Date().valueOf()}`;

    // 提供了id也应该被忽略才对，因为用的是_id
    let obj = await ctx.service.model.mongoTest.create({ id: 'not_exists' as any, field_str }, { load: { field_str } });
    assert(obj !== null);
    await assert.rejects(ctx.service.model.mongoTest.load('not_exists' as any)
      , message =>
        (message.message as string).startsWith('Cast to ObjectId failed for value "not_exists" (type string) at path "_id" for model "service.model.mongoTest"') ||
        (message.message as string).startsWith('Cast to ObjectId failed for value "not_exists" at path "_id" for model "service.model.mongoTest"')
      , 'should not load');
    assert(await ctx.service.model.mongoTest.load(obj!.id), 'should load');

    const objects = await ctx.service.model.mongoTest.loadMultiWithFieldStr(field_str);
    assert(objects.length === 1 && objects[ 0 ] && objects[0].id.toHexString() === obj!.id.toHexString(), 'should load');

    assert((await ctx.service.model.mongoTest.countWithFieldStr(field_str)) === 1, 'count with');
    await ctx.service.model.mongoTest.remove(obj!.id);

    assert((await ctx.service.model.mongoTest.loadMultiWithFieldStr(field_str)).length === 0, 'should not load');
    assert((await ctx.service.model.mongoTest.load(obj!.id)) === null, 'should not load');
    assert(await ctx.service.model.mongoTest.countWithFieldStr(field_str) === 0, 'count with');

    await ctx.service.model.mongoTest.create(obj!.getProperties(), { load: { field_str } });

    assert(await ctx.service.model.mongoTest.load(obj!.id), 'should load');
    await ctx.service.model.mongoTest.remove(obj!.id);
  });
});
