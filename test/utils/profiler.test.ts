// import * as assert from 'assert';
import { gaiaTester as tester } from '../bootstrap';

tester(__filename, async it => {
  it('add', async ctx => {
    ctx.service.profiler.addItem('test');
    //console.log(JSON.stringify(ctx.service.profiler.dump()));

    ctx.service.profiler.addItem('test', 2);
    // console.log(JSON.stringify(ctx.service.profiler.dump()));

    ctx.service.profiler.addItem('test', { method: 'load' });
    // console.log(JSON.stringify(ctx.service.profiler.dump()));

    ctx.service.profiler.addItem('test', { method: 'load' });
    // console.log(JSON.stringify(ctx.service.profiler.dump()));

    ctx.service.profiler.addItem('test', { method: 'load' }, 3);
    // console.log(JSON.stringify(ctx.service.profiler.dump()));

    let item = ctx.service.profiler.createItem('test2');
    item.duration = 3;
    ctx.service.profiler.addItem(item);
    // console.log(JSON.stringify(ctx.service.profiler.dump()));

    item = ctx.service.profiler.createItem('test2');
    item.duration = 5;
    ctx.service.profiler.addItem(item);
    // console.log(JSON.stringify(ctx.service.profiler.dump()));

    item = ctx.service.profiler.createItem('test2');
    item.duration = 100;
    ctx.service.profiler.addItem(item);
    // console.log(JSON.stringify(ctx.service.profiler.dump()));

    item = ctx.service.profiler.createItem('test2', { method: 'load' });
    item.duration = 100;
    ctx.service.profiler.addItem(item);
    // console.log(JSON.stringify(ctx.service.profiler.dump()));

  });
});
