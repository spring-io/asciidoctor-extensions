'use strict'

const codeChompingExtension = require('./code-chomping-extension')
const codeFoldingExtension = require('./code-folding-extension')
const codeImportExtension = require('./code-import-extension')
const toProc = require('./util/to-proc')

function register (registry, context) {
  if (!registry) return this.register('springio', createExtensionGroup())
  registry.groups.$store('springio', toProc(createExtensionGroup(context)))
  return registry
}

function createExtensionGroup (context) {
  return function () {
    codeChompingExtension.createExtensionGroup().call(this)
    codeFoldingExtension.createExtensionGroup().call(this)
    if (context) codeImportExtension.createExtensionGroup(context).call(this)
  }
}

module.exports = { register, createExtensionGroup }
