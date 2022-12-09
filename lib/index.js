'use strict'

const codeChompingExtension = require('./code-chomping-extension')
const codeFoldingExtension = require('./code-folding-extension')
const toProc = require('./util/to-proc')

function register (registry) {
  if (!registry) return this.register('springio', createExtensionGroup())
  registry.groups.$store('springio', toProc(createExtensionGroup()))
  return registry
}

function createExtensionGroup () {
  return function () {
    codeChompingExtension.createExtensionGroup().call(this)
    codeFoldingExtension.createExtensionGroup().call(this)
  }
}

module.exports = { register, createExtensionGroup }
