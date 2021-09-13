'use strict';

const glob = require('glob');
const path = require('path');

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function buildInFolder(category, pathName, options = {}) {
  const subServices = {};

  const interfacePrefix = options.interfacePrefix || 'IGaia';

  subServices[`${category}${pathName}`] = Object.assign(
    {
      directory: `app/${category}${pathName}`, // files directory.
      pattern: '*.(ts|js)', // glob pattern, default is **/*.(ts|js). it doesn't need to configure normally.
      // ignore: '', // ignore glob pattern, default to empty.
      generator: 'class', // generator name, eg: class、auto、function、object
      interface: `${interfacePrefix}${capitalize(category)}${pathName.split('/').map(capitalize).join('')}`, // interface name
      // declareTo: 'Context.service.model', // declare to this interface
      // watch: true, // whether need to watch files
      // caseStyle: 'upper', // caseStyle for loader
      // interfaceHandle: val => `ReturnType<typeof ${val}>`, // interfaceHandle
      // trigger: ['add', 'unlink'], // recreate d.ts when receive these events, all events: ['add', 'unlink', 'change']
    },
    options || {}
  );

  glob.sync(path.resolve(options.root || __dirname, `app/${category}${pathName}`) + '/*/').forEach(dir => {
    dir = path.basename(dir);
    Object.assign(subServices, buildInFolder(category, `${pathName}/${dir}`, options));
  });

  return subServices;
}

function build(category, options = {}) {
  // let subServices = {};

  // const interfacePrefix = options.interfacePrefix || 'IGaia';

  // subServices[`${category}`] = Object.assign(
  //   {
  //     directory: `app/${category}`, // files directory.
  //     pattern: '*.(ts|js)', // glob pattern, default is **/*.(ts|js). it doesn't need to configure normally.
  //     // ignore: '', // ignore glob pattern, default to empty.
  //     generator: 'class', // generator name, eg: class、auto、function、object
  //     interface: `${interfacePrefix}${capitalize(category)}`, // interface name
  //     // declareTo: 'Context.service.model', // declare to this interface
  //     // watch: true, // whether need to watch files
  //     // caseStyle: 'upper', // caseStyle for loader
  //     // interfaceHandle: val => `ReturnType<typeof ${val}>`, // interfaceHandle
  //     // trigger: ['add', 'unlink'], // recreate d.ts when receive these events, all events: ['add', 'unlink', 'change']
  //   },
  //   options || {}
  // );

  // glob.sync(path.resolve(options.root || __dirname, `app/${category}`) + '/*/').forEach(dir => {
  //   dir = path.basename(dir);
  //   subServices[`${category}.${dir}`] = Object.assign(
  //     {
  //       directory: `app/${category}/${dir}`, // files directory.
  //       pattern: '**/*.(ts|js)', // glob pattern, default is **/*.(ts|js). it doesn't need to configure normally.
  //       // ignore: '', // ignore glob pattern, default to empty.
  //       generator: 'class', // generator name, eg: class、auto、function、object
  //       interface: `${interfacePrefix}${capitalize(category)}${capitalize(dir)}`, // interface name
  //       // declareTo: 'Context.service.model', // declare to this interface
  //       // watch: true, // whether need to watch files
  //       // caseStyle: 'upper', // caseStyle for loader
  //       // interfaceHandle: val => `ReturnType<typeof ${val}>`, // interfaceHandle
  //       // trigger: ['add', 'unlink'], // recreate d.ts when receive these events, all events: ['add', 'unlink', 'change']
  //     },
  //     options || {}
  //   );
  // });
  // return subServices;
  return buildInFolder(category, '', options);
}

function serviceBuilder(options) {
  return build('service', options);
}

function objectBuilder(options) {
  return build('object', Object.assign({
    generator: 'function',
    caseStyle: 'upper',
    interfaceHandle: val => `ObjectCreator<${val}>`,
  }, options || {}));
}

function modelBuilder(options) {
  return build('model', Object.assign({
    generator: 'function',
    caseStyle: 'upper'
  }, options || {}));
}

module.exports = {
  serviceBuilder,
  objectBuilder,
  modelBuilder,
  build,
};
