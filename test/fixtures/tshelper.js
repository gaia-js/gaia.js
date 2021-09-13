const {
  serviceBuilder,
  objectBuilder
} = require('../../lib/tshelper');

module.exports = {
  watchDirs: {
    ...serviceBuilder({
      root: __dirname,
      interfacePrefix: 'IApp'
    }),
    ...objectBuilder({
      root: __dirname,
      interfacePrefix: 'IApp'
    }),
  }
}
