import { Context } from 'egg';

// const UserModelFactory = require('../user');
// const ClassGroupModelFactory = require('../class_group');
// const SchoolModelFactory = require('../school');


module.exports = function(ctx: Context) {
  const ret = {};
  // Object.assign(ret, UserModelFactory(ctx));
  // Object.assign(ret, ClassGroupModelFactory(ctx));
  // Object.assign(ret, SchoolModelFactory(ctx));

  return ret;
};
