'use strict'

const toProc = require('./util/to-proc')

function register (registry) {
  if (!registry) return this.register('springio/section-ids', createExtensionGroup())
  registry.$groups().$store('springio/section-ids', toProc(createExtensionGroup()))
  return registry
}

function createExtensionGroup () {
  return function () {
    this.treeProcessor(function () {
      this.process((doc) => {
        const wordSeparator = doc.getAttribute('sectid-word-separator', '-')
        const levelSeparator = doc.getAttribute('sectid-level-separator', '.')
        const validLocalSectionIdRx = new RegExp(`^\\p{Ll}[\\p{Ll}0-9]*([${wordSeparator}][\\p{Ll}0-9]+)*$`, 'u')
        const header = doc.getHeader()
        doc.findBy({ context: 'section' }, (section) => {
          validate(section === header ? doc : section, wordSeparator, levelSeparator, validLocalSectionIdRx)
        })
      })
    })
  }
}

function validate (section, wordSeparator, levelSeparator, validLocalRx) {
  const id = section.getId()
  if (!id) return
  if (section.getContext() !== 'document') {
    const lastLevelSeparatorIdx = id.lastIndexOf(levelSeparator)
    const idNamespace = id.slice(0, lastLevelSeparatorIdx)
    const localId = id.slice(lastLevelSeparatorIdx + 1)
    const parentId = (nearest(section.getParent(), 'section') || section.getDocument()).getId()
    if (idNamespace !== parentId) warn.call(section, `expecting section ID to start with ${parentId}: ${id}`)
    if (!validLocalRx.test(localId)) warn.call(section, `local section ID does not match ${validLocalRx.source}: ${id}`)
  } else {
    const parts = id.split(levelSeparator)
    for (const part of parts) {
      if (!validLocalRx.test(part)) {
        warn.call(
          section,
          `local section ID does not match ${validLocalRx.source}: ${id}${parts.length !== 1 ? ' (' + part + ')' : ''}`
        )
      }
    }
  }
}

function warn (message) {
  const doc = this.getDocument()
  doc.getLogger().warn(doc.createLogMessage(message, { source_location: this.getSourceLocation() }))
}

function nearest (node, context) {
  return !node || node.getContext() === context ? node : nearest(node.getParent(), context)
}

module.exports = { register, createExtensionGroup }
