import { Context } from "egg";
import BaseService from "../lib/BaseService";
import { Session, createSession, Item, ItemTags, DumpType } from 'rhea-cli';
import * as querystring from 'querystring';

export default class Profiler extends BaseService {
  private session: Session;

  private preparingItems: Set<Item>;

  constructor(ctx: Context) {
    super(ctx);

    this.session = createSession();
    this.preparingItems = new Set<Item>();
  }

  createItem(name: string, tags = {}, count = 1): Item {
    const item = this.session.createItem(name, Object.assign({ env: this.ctx.app.deployment.name }, tags || {}), count);
    this.preparingItems.add(item);
    return item;
  }

  addItem(name: string | Item, tags: ItemTags | any = {}, count = 1) {
    if (name instanceof Item) {
      this.preparingItems.delete(name);
    }

    this.session.addItem(name, Object.assign({ env: this.ctx.app.deployment.name }, tags || {}), count);
  }

  // tslint:disable-next-line: cyclomatic-complexity
  dump(type: DumpType = 'full') {
    const result: any = this.session.dump(type);
    if (this.preparingItems.size > 0) {
      if (type === 'minimize') {
        for (const item of this.preparingItems) {
          result[item.name] = (result[item.name] || 0) + item.count;
        }
      } else if (type === 'medium') {
        for (const item of this.preparingItems) {
          if (!item.tags || Object.keys(item.tags).length === 0) {
            result[item.name] = {
              count: (result[item.name] && result[item.name].count || 0) + item.count,
              duration: (result[item.name] && result[item.name].duration || 0) + (item.last() || 0),
            };
          } else {
            if (!result[item.name]) {
              result[item.name] = {};
            }

            const tagName = querystring.stringify(item.tags);
            result[item.name][tagName] = {
              count: (result[item.name][tagName] && result[item.name][tagName].count || 0) + (item.count || 1),
              duration: (result[item.name][tagName] && result[item.name][tagName].duration || 0) + (item.duration || 0)
            }
          }
        }
      } else {
        result['_preparing'] = [];
        for (const item of this.preparingItems) {
          result['_preparing'].push(item);
        }
      }
    }

    if (type === 'medium') {
      for (const name of Object.keys(result)) {
        for (const taggedName of Object.keys(result[name])) {
          if (taggedName === 'duration') {
            continue;
          }
          else if (taggedName === 'count') {
            result[name].count = result[name].count + (result[name].duration ? ` (${Math.round((result[name].duration || 0) / (result[name].count || 1))}ms)` : '');
            delete result[name].duration;
          } else {
            result[name][taggedName] = result[name][taggedName].count + (result[name][taggedName].duration ? ` (${Math.round((result[name][taggedName].duration || 0) / (result[name][taggedName].count || 1))}ms)` : '');
          }
        }
      }
    }

    return result;
  }

  async submitItem(item: { name: string; tags?: ItemTags; count?: number; duration?: number }) {
    item.tags = Object.assign({ env: this.ctx.app.deployment.name }, item.tags || {});
    this.session.submitItem(item);
  }

  async submit() {
    this.session.submit();
  }
}
