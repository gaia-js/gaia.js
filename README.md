# [gaia.js] (https://github.com/gaia-js/gaia.js)

## gaia.js 是什么
gaia.js是基于[Egg.js][egg]的扩展框架，主要使用typescript开发。主要提供了：
 * model（rpc、sequelize、mongoose）/object，cached model
 * cache（couchbase/memcache/redis/context based runtime heap）
 * blueprint路由
 * request/response接口代码生成
 * event
 * kafka producer/consumer
 * rhea (influxdb) client
 * elk接入（json log），access/error log
 * admin (cas鉴权接入)
 * 脚本执行
 * 熔断器 (基于brakes)
 * 降级
 * gaia-plugin
 * passport
 * task
 * session

## QuickStart

### 使用gaiajs脚手架搭建工程，参见 [egg 文档][egg]
```
$ mkdir gaiajs-project && cd gaiajs-project
$ npm init gaiajs
$ npm i
```

### 其他
* 关于使用typescript开发egg应用，参考[https://eggjs.org/zh-cn/tutorials/typescript.html](https://eggjs.org/zh-cn/tutorials/typescript.html)
* 在考虑支持的功能
   * 配置服务接入

## gaia.js功能模块介绍
* model/object

  gaiajs一个重要架构思想是业务逻辑分层，而不是简单的MVC（model-view-controller）或者MVCS（model-view-controller-service）架构。在gaiajs中，model（其实是service model）起到DAO的作用，依托于ORM组件（sequelize/mongoose）生产或保存object。

  object思想不同于一般的entity，我们会把对应object的内聚的逻辑方法都放在object中，一部分的与其他service或object的外延方法也都放进来。例如：
  ```
  export default class Student extends User {
    school_id: number;
    student_group_ids: number[];

    isStudent() {
        return true;
    }

    async isHighSchool() {
        ...
    }

    async isJuniorMiddleSchool() {
        ...
    }

    @cacheable({ skipCache: true })
    get school(): Promise<School|null> {
        ...
    }

    @cacheable({ skipCache: true })
    get groups(): Promise<ClassGroup[]> {
        ...
    }

    async groupsOfSubject(subject: string): Promise<ClassGroup[]> {
        ...
    }

    async hasSubject(subject: string) {
        ...
    }
  }
  ```
  这样，我们的service相当于胶水的作用，协调处理很多object（实体或抽象的service object）来提供处理更综合一些的服务功能。

  注意，为了使得mongoose和sequelize能共存于app.model中，需要对mongoose model初始化做如下预处理：
  ```
  export default (app: Application, options) => {
    if (!app.mongoose || options) {
      // 是sequelize在加载，不要加载mongoose model
      return null;
    }

    ...
  ```
  egg插件加载配置：
  ```
  sequelize: {
    enable: true,
    package: 'egg-sequelize',
  },
  mongoose: {
    enable: true,
    package: 'egg-mongoose',
  },
  ```

  在service下提供一个service model就能对rpc或db等数据源读写object了：
  ```
  import User from '../object/user';

  export default class UserModelService extends MongoModelService<User<number>> {
    constructor(ctx: Context) {
      super(ctx, 'User', {
        objectModelClass: User,
      })
    }
  }
  ```

  这样就可以使用`ctx.service.user.load()`方法load出一个User的实例了

---

* cache

我们的model/object是内置支持cache的。当我们写`ctx.service.i7.user.user.load(<userid>)`的时候user object可能是从rpc远程加载，也可能是从couchbase加载，还可能是从本地的runtime堆缓存中加载。这些加载来源可以object的`isLoadFromDb()`和`isLoadFromCache()`方法取到。

cache模块提供了一个cache pool chain，用于`本地runtime缓存`->`couchbase缓存`级联查询/设置。如：`ctx.service.cache.poolChain.load(<key>, ()=>{.../*没有命中缓存时需要到数据源加载*/})`

---

* blueprint路由

我们可以把我们的路由处理放在app/routers/下，按照路径规则放置就行。
例如`app/routers/ping.ts`：
```
import GaiaResponse from '@gaiajs/gaiajs/lib/response';
import { RouteableModule } from '@gaiajs/gaiajs/app/lib/router/routers';

export default async function(this: RouteableModule) {
  const response = new GaiaResponse(this.ctx.app.name);
  response.type = 'text';

  return response;
}
```

我们还推荐使用decorator方式的blueprint，把路由规则写到controller中，而不是分开维护router.ts和controller的方法。例如：
```
  @bp.post('/<access point path>', { request_type: ActionRequest })
  @bp.auth_required(false)
  public async action(req: ActionRequest) {
    ...
  }
```
或 `@bp.post('/<access point path>', { auth_required: false })`。其中 `auth_required` 表示不需要验证用户登录，默认是需要验证登录的。验证方式是通过 `ctx.service.auth.authUser()` 方法来验证的，验证不通过将会抛出 `BusinessError.NO_AUTH` 异常。

我们在controller处理流程上还加入了`beforeRequest`和`afterRequest`两个步骤，以方便处理消息。

@bp.controller decorator支持定义适用于该controller中所有action的规则

---

* request/response接口代码生成

使用[`protocol_builder`][protocol_builder]可以生成接口代码（包括前端接口代码和swagger文档、wiki等），集成到[`gaia.js`][gaia.js]框架中。如何写api文档请参见 [] 。生成的代码与`gaia.js`相应的参数验证、用户登录验证等功能模块集成。

对于我们使用blueprint注解的方法，会加一个入口参数即为相应的生成的Request实例，返回值即为对应的Response实例。

---

* event

在你需要的模块（service，object等）中都可以注册监听消息：
```

/*export default */class MyService {  //不要export default

}

export default function() {
  app.event.subscribe(<event>, async (ctx: Context, event: symbol, ...params)=>{
    ...
  });

  return MyService;
}
```

或
```

import bootstrap from '@gaiajs/gaiajs/app/lib/bootstrap';

export default class MyService {
  @bootstrap.event(<event>)
  sync foo(event: symbol, ...params) {
    ...
  }
}

```

可以使用`ctx.event.fire(<event>, ...params)`来发布消息。

---

* kafka producer/consumer

producer：`ctx.kafkaProducer.send(messages)`

consumer：类似于event的注册方法一样（gaia.js就是用的event机制），使用`app.subscribeKafkaMessage(<name>, <topic>, async (ctx: Context, message: any, topic: string, name: string)=>{})`方式来注册。其中的回调方法工作在一个anonymous context上。

或使用 bootstrap decorator：

```

import bootstrap from 'gaiajs/app/lib/bootstrap';

export default class MyService {
  @bootstrap.kafkaMessageConsumer(kafkaName: string, topicName: string)
  sync foo(message: any) {
    ...
  }
}

```

---

* task

在后台运行task，可以在admin中查看进度，及控制

```

this.ctx.app.taskManager.runTask(new GenericTask(this.ctx.app, class implements TaskSource<number> {
  static info() {
    return {
      id: 'simulate_task', name: '模拟任务',
    };
  }

  async getTotalItemsCount() {
    return 1000;
  }

  async* [ Symbol.asyncIterator ]() {
    for (let i = 0; i < 1000; i++) {
      yield i;
    }
  }

  async exec(result: number) {
    /* exec */
    // await sleep(100);

    return {
      step: 1,
      id: result,
    };
  }
}, { workers: 10 }));

```
在script中，还可以使用CliProgressBar观察进度信息
```
CliProgressBar.monitor(task);
```

---

* rhea (influxdb) client

使用[rhea-cli][rhea-cli]将QPS等性能数据打入到influxdb中。[rhea-cli][rhea-cli]是[rhea][rhea]的node客户端。rhea是一个influxdb打点数据归并服务。

---

* elk接入（json log），access/error log

把一般的文本日志替换成json log输出，使用filebeat或kafka打入logstash收集。json log中放入了一些标准字段，如app、userid、请求信息（需要脱敏）等。

---
* admin (cas鉴权接入)

基于blueprint机制，有个admin blueprint，验证登录使用`ctx.service.adminAuth.auth`。
admin页面使用helmet中间件进行安全保护，可以在配置中配置helmet选项以支持定制CSP等需求

---
* 脚本执行

在app/scripts下编写从ScriptCommand继承的类，重写exec方法实现执行逻辑。
在package.json中```scripts```中添加```"script": "node node_modules/gaiajs/bin/run.js"```
运行方式：```npm run script -- <command name>``` ，command名字为文件名，可参考common-bin文档加执行参数
参考示例：

```
import ScriptCommand from 'gaiajs/app/lib/script_command';

export default class TestCommand extends ScriptCommand {
  constructor(rawArgv) {
    super(rawArgv);

  }

  async exec(argv: any) {
    const user = await this.ctx.service.i7.user.user.load(15);

    console.log(user && user.name);

    console.log('done', ...(argv._));

    return;
  }

  get description() {
    return 'test description';
  }
}
```

---
* 熔断器 [brakes](https://github.com/awolden/brakes)

调用curl时，可以设置circuitBreaker为true，开启熔断器功能。

---
* 降级

支持controller整体或单独接口的降级

---
* plugin

基于gaia的plugin。
在egg plugin机制上，在插件的package.json中设置gaia-plugin为true可以声明为基于gaia的plugin
```
  "eggPlugin": {
    "name": "gaia-admin",
    "dependencies": [
      "mongoose",
      "nunjucks"
    ],
    "gaia-plugin": true
  },
```
基于gaia的plugin支持如下特性：
 * 可以在插件中开发controller，如果有public，需要在上层应用配置中添加public路径到assets的dir配置项中。
 * middleware的配置项中设置gaia为true，即可声明此中间件为基于gaia的中间件，可以访问controller中blueprint选项，但需要注意middleware比一般的egg middleware多了一层函数返回。

 config:
 ```
  config.errorLog = {
    gaia: true,
    core: true,
  }
 ```

 middleware:
 ```
 export default function errorHandler(): any {
  return (bpOption?: RouterOptions) => {
    return async (ctx: Context, next: () => Promise<any>) => {
      ...
    }
  }
 }
 ```

---
* passport

基于egg-passport (passport.js)，gaia支持从app/passport中自动加载passport，并支持在blueprint中设置passport选项控制每个接口的用户验证机制。
gaia.js默认配置的defaultPassport为['fake']；每个接口可以使用BluePrint中的passport选项单独配置passport验证

---
* session

基于egg-session，存储在redis中的服务端session。使用方法参考 (https://eggjs.org/zh-cn/core/cookie-and-session.html#session)

---

## 开发Gaia.js

通常我们考虑把应用中node_modules/gaiajs等模块链接到gaia.js源代码，这样可以直接修改gaia就能在应用中生效。但因为egg-core中的app需要是全局唯一，所以我们可以把egg-core安装到全局，然后把应用的egg-core和gaia.js的egg-core都链接到全局。

### 全局安装
```
npm i egg-core -g

npm i is-type-of co graceful cluster-client koa-convert @eggjs/router on-finished ready-callback node-homedir globby extend2 egg-path-matching egg-cookies circular-json-for-egg sendmessage mz ylru urllib humanize-ms delegates accepts cache-content-type koa-is-json md5 koa-bodyparser koa-override bluebird -g
```

## 配置gaia
```
git clone git@github.com:rockyzh/gaia.js.git

cd gaia.js
ln -s (pwd) /usr/local/lib/node_modules/gaiajs

npm link egg-core
```

## 配置其他gaia.js扩展模块，如gaia-admin
```
git clone

cd admin
ln -s (pwd) /usr/local/lib/node_modules/gaia-admin

npm link egg-core gaiajs
```

## 配置项目
```
npm link egg-core gaiajs gaia-admin
```

---

[egg]: https://eggjs.org
[gaia.js]: https://github.com/rockyzh/gaia.js
[protocol_builder]:
[rhea-cli]:
[rhea]:
