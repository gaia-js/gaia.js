const { serviceBuilder, objectBuilder } = require('./lib/tshelper');

const subServices = serviceBuilder({root: __dirname});
const subObjects = objectBuilder({root: __dirname});

module.exports = {
  watchDirs: {
    // "object": {
    //   directory: 'app/object', // files directory.
    //   pattern: '**/*.(ts|js)', // glob pattern, default is **/*.(ts|js). it doesn't need to configure normally.
    //   // ignore: '', // ignore glob pattern, default to empty.
    //   generator: 'function', // generator name, eg: class、auto、function、object
    //   interface: 'IGaiaObject',  // interface name
    //   // declareTo: 'Context.object', // declare to this interface
    //   // watch: true, // whether need to watch files
    //   caseStyle: 'upper', // caseStyle for loader
    //   // interfaceHandle: val => `ReturnType<typeof ${val}>`, // interfaceHandle
    //   // trigger: ['add', 'unlink'], // recreate d.ts when receive these events, all events: ['add', 'unlink', 'change']
    // },
    ...subObjects,
    ...subServices
  }
}

// console.dir(module.exports);

