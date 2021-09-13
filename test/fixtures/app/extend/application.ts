import { Application } from 'egg';
import { Connection } from 'mongoose';

export default {
  get db(): Connection {
    const app = this as any as Application;

    return app.mongooseDB.get('default');
  },

  get adminDB() {
    return this.db;
  },

  get indexed_app_name() {
    const app = this as any as Application;

    return `middle.${app.name}`;
  },
};
