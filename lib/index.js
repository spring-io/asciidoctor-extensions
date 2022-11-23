'use strict'

const codeChompingExtension = require('./code-chomping-extension')
const codeFoldingExtension = require('./code-folding-extension')

function register (registry) {
  if (!registry) return this.register(register)
  codeChompingExtension.register(registry)
  codeFoldingExtension.register(registry)
  return registry
}

module.exports.register = register
