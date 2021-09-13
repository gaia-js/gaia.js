import 'mocha';
import { Context } from 'egg';
import BaseBSONDocObject from '../../app/object/BaseBSONDocObject';
const assert = require('assert');
import tester from '../bootstrap';
// const mock = require('egg-mock');

tester(__filename, async it => {
  it('load', async (ctx: Context) => {
    await ctx.service.cache.couchbase.remove('test');
    const result = await ctx.service.cache.couchbase.load('test', async () => {
      return 'test_value';
    });

    assert(result === 'test_value');

    await ctx.service.cache.couchbase.remove("test_obj");
    let result_obj = await ctx.service.cache.couchbase.load('test_obj', async () => {
      return new BaseBSONDocObject({ _id: "test_obj_id" }, ctx);
    })

    assert(result_obj._id === "test_obj_id");

    result_obj = await ctx.service.cache.couchbase.load(
      "test_obj",
      async () => {
        return new BaseBSONDocObject({ _id: "test_obj_id" }, ctx);
      }
    );

    assert(result_obj._id === "test_obj_id");
  });

  it('incr/decr', async ctx => {
    await ctx.service.cache.couchbase.remove('incr_key');

    let value = await ctx.service.cache.couchbase.increment('incr_key', 1, { initial: 100 });
    assert(value === 100, 'incr');

    value = await ctx.service.cache.couchbase.increment('incr_key', 10, { initial: 100 });
    assert(value === 110, 'incr');

    value = await ctx.service.cache.couchbase.decrement('incr_key', 2, { initial: 100 });
    assert(value === 108, 'decr');

    await ctx.service.cache.couchbase.remove('incr_key');
  });

  it('loadMulti', async (ctx: Context) => {
    const keys = [ 'test1', 'test2', 'test' ];
    let results = await ctx.service.cache.couchbase.loadMulti([ 'test1', 'test2', 'test' ], async keys => {
      return keys.map(key => key + '_value');
    });

    // keys.map(key => results.get(key)).should.deepEqual(['test1_value', 'test2_value', 'test_value']);
    assert.deepEqual(keys.map(key => results.get(key)), [ 'test1_value', 'test2_value', 'test_value' ]);

    // 只有1个missed
    await ctx.service.cache.couchbase.remove('test');

    let missed = 0;
    results = await ctx.service.cache.couchbase.loadMulti([ 'test1', 'test2', 'test' ], async keys => {
      assert.deepEqual(keys, [ 'test' ]);
      missed += keys.length;
      return keys.map(key => key + '_value');
    });

    assert(missed == 1);

    // keys.map(key => results.get(key)).should.deepEqual(['test1_value', 'test2_value', 'test_value']);
    assert.deepEqual(keys.map(key => results.get(key)), [ 'test1_value', 'test2_value', 'test_value' ]);
  });

  it('cachePool failure retrieve', async (ctx: Context) => {
    const cachePool = ctx.service.cache.poolChain;

    // 取失败，应该返回undefined，保持错误沉默
    await assert.rejects(cachePool.load('not exists key', async () => { return Promise.reject(new Error("don't retrieve")) }), message => message.message === "don't retrieve", 'retrieve');
  })

  it('cachePool runtime cache', async (ctx: Context) => {
    const cachePool = ctx.service.cache.poolChain;

    const key = 'my key';
    const value = 'my value';
    // 可以读取到数据
    assert(((await cachePool.load(key, async () => { return value; }))) === value);

    ctx.service.profiler.submit();
    assert(ctx.service.profiler.dump().length === 0);
    assert((await cachePool.get(key)) === value);
    assert(ctx.service.profiler.dump().length === 0);

    // 清理了runtime cache就应该取不到数据了
    ctx.service.cache.runtime.clear();
    assert((await ctx.service.cache.runtime.get(key)) === undefined);

    // 这时从cachePool取会从couchbase里读到
    assert((await cachePool.get(key)) === value);
    // mockContext共享了profiler，造成别的测试用例影响了打点数量
    // let dump = ctx.service.profiler.dump();
    // if (dump.length !== 1) {
    //     console.dir(dump);
    // }
    // assert(dump.length === 1 && dump[0].name === 'couchbase');


    // runtime应该有数据才对
    assert((await ctx.service.cache.runtime.get(key)) === value);
  });

  it('date', async (ctx: Context) => {
    await ctx.service.cache.couchbase.remove('test_date_key');

    const date = new Date();
    await ctx.service.cache.couchbase.set('test_date_key', { value: date }, { serializeType: 'bson' });

    const ret = await ctx.service.cache.couchbase.get('test_date_key');
    assert(ret && ret.value && typeof ret.value === 'object' && (ret.value as Date).getTime() === date.getTime());
  });

  it('array', async (ctx: Context) => {
    const value = [ 1, '2', { a: 1, b: 'b' }, [ 1, '2', { a: 1, b: 'b' } ] ];

    await ctx.service.cache.couchbase.remove('test_array');

    let result = await ctx.service.cache.couchbase.load('test_array', async () => {
      return value;
    });

    result = await ctx.service.cache.couchbase.load('test_array', async () => {
      return value;
    });

    assert(Array.isArray(result) && result.length === value.length && result[ 0 ] === value[ 0 ] && result[ 1 ] === value[ 1 ]);

    await ctx.service.cache.couchbase.remove('test_array');

    result = await ctx.service.cache.couchbase.load('test_array', async () => {
      return value;
    }, {serializeType: 'bson'});

    result = await ctx.service.cache.couchbase.load('test_array', async () => {
      return value;
    }, { serializeType: 'bson' });

    assert(Array.isArray(result) && result.length === value.length && result[ 0 ] === value[ 0 ] && result[ 1 ] === value[ 1 ]);
  });

  it('global_cache', async (ctx: Context) => {
    let value = await ctx.service.cache.globalPoolChain.load('test_global', async () => {
      return 'test_global_value';
    });

    assert(value === 'test_global_value');

    value = await ctx.service.cache.globalPoolChain.load('test_global', async () => {
      throw new Error('should load, never show up');
    });

    assert(value === 'test_global_value');
  });
});
