import { hostname } from 'os';
import BaseService from '../lib/BaseService';

export enum ResultStatus {
  ok = 0,
  warn,
  fail,
}

/**
 * 检测结果的结构
 */
export interface ExamineResult {
  result: ResultStatus;
  detail?:
    | string
    | Error
    | {
        [name: string]: ExamineResult;
      };
}

export default class PingHealthService extends BaseService {
  async check(): Promise<ExamineResult> {
    // 运行器
    const runner: (method: string) => Promise<[string, ExamineResult]> = async method => {
      try {
        return [method, await this['test_' + method]()] as [string, ExamineResult];
      } catch (err) {
        return [
          method,
          {
            result: ResultStatus.fail,
            detail: err instanceof Error ? err.message : JSON.stringify(err),
          },
        ] as [string, ExamineResult];
      }
    };

    // 所有都跑出来
    const data = await Promise.all(this.generateCheckItems().map(runner));

    // 汇总结果
    return data.reduce(
      (ret, [method, cur]) => {
        ret.detail![method] = cur;
        cur.result > ret.result && (ret.result = cur.result);
        return ret;
      },
      { result: ResultStatus.ok, detail: {} } as ExamineResult,
    );
  }

  /**
   * 配置项检查
   * 应用项目建议增加具体的配置项检查
   */
  async test_config(): Promise<ExamineResult> {
    return {
      result: ResultStatus.ok,
    };
  }

  /**
   * couchbase 连通性检查
   */
  async test_couchbase() {
    if (!this.ctx.service.cache.couchbase.available()) {
      return {
        result: ResultStatus.fail,
      };
    }

    const key = `ping_health_checkout_${hostname()}_${process.pid}`;
    const value = new Date().getTime();
    await this.ctx.service.cache.couchbase.set(key, value, { expires: 60 });
    if ((await this.ctx.service.cache.couchbase.get(key)) !== value) {
      return {
        result: ResultStatus.fail,
        detail: 'cannot get value from couchbase',
      };
    }

    await this.ctx.service.cache.couchbase.remove(key);

    return {
      result: ResultStatus.ok,
    };
  }

  async test_mysql(): Promise<ExamineResult> {
    if (!this.app.config.sequelize) {
      return { result: ResultStatus.ok };
    }

    const result: ExamineResult = {
      result: ResultStatus.ok,
      detail: {},
    };
    // @ts-ignore
    const mysql = await import('mysql2/promise');

    for (const [index, dataSource] of ((this.app.config.sequelize as any).datasources || (this.app.config.sequelize as any).clients || [this.app.config.sequelize]).entries()) {
      const connection = await mysql.createConnection(dataSource.connectionUri || {
        host: dataSource.host,
        user: dataSource.username,
        port: dataSource.port,
        password: dataSource.password,
        database: dataSource.database,
      });
      const tables = await connection.query('show tables');
      result.detail![dataSource.host && dataSource.host + ':' + dataSource.port || index] = {
        result: tables.length > 0 ? ResultStatus.ok : ResultStatus.warn,
      };

      if (tables[1].length === 0) {
        result.result = ResultStatus.warn;
      }

      await connection.end();
    }

    return result;
  }

  async test_mongo() {
    const result: ExamineResult = {
      result: ResultStatus.ok,
      detail: {},
    };

    if (this.app.config.mongoose) {
      // @ts-ignore
      const mongoose = await import('mongoose');

      for (const [name, dataSource] of ((this.app.config.mongoose as any).clients && Object.entries((this.app.config.mongoose as any).clients as { [name: string]: any }) || []) || this.app.config.mongoose.url && [{
        default: this.app.config.mongoose,
      }] || []) {
        const connection = await mongoose.createConnection(dataSource.url, { useNewUrlParser: true });
        const collections = await connection.db.collections();

        result.detail![name] = {
          result: !collections ? ResultStatus.fail : collections.length > 0 ? ResultStatus.ok : ResultStatus.warn,
          detail: name,
        };

        if (!collections) {
          result.result = ResultStatus.warn;
        }

        await connection.close();
      }
    }

    return result;
  }

  /**
   * 自动提取测试项目
   */
  protected generateCheckItems() {
    const allMethods: Set<string> = new Set();
    for (let obj = this; obj !== BaseService.prototype; obj = Object.getPrototypeOf(obj)) {
      Object.getOwnPropertyNames(obj)
        .filter(name => name.startsWith('test_') && typeof this[name] === 'function')
        .map(name => name.substring(5))
        .forEach(x => allMethods.add(x));
    }
    return [...allMethods];
  }
}
