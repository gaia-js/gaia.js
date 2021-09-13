'use strict';

/** @type Egg.EggPlugin */
export default {
  // had enabled by egg
  // static: {
  //   enable: true,
  // }
  // gaia: {
  //   enable: true,
  //   path: path.resolve(__dirname, '../src/')
  // }
  // redis: {
  //   enable: true,
  //   package: 'egg-redis',
  // }

  // session: {
  //   enable: true,
  //   package: 'egg-session',
  // },

  passport: {
    enable: true,
    package: 'egg-passport',
  },

  // mongoose: {
  //   enable: true,
  //   package: 'egg-mongoose',
  // },
};
