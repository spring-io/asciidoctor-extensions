'use strict'

const codeChompingExtension = require('./code-chomping-extension')
const codeFoldingExtension = require('./code-folding-extension')
const includeCodeExtension = require('./include-code-extension')
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
    if (context) includeCodeExtension.createExtensionGroup(context).call(this)
  }
}

module.exports = { register, createExtensionGroup }
