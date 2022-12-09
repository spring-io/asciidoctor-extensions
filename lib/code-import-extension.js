'use strict'

const toProc = require('./util/to-proc')

const IMPORT_FAMILIES = ['attachment', 'example', 'partial']

function register (registry, context) {
  if (!(registry && context)) return // NOTE only works as scoped extension for now
  registry.groups.$store('springio/code-import', toProc(createExtensionGroup(context)))
  return registry
}

function createExtensionGroup (context) {
  return function () {
    let langs, tabsEnabled
    this.blockMacro(function () {
      this.named('import')
      this.process((parent, target) => {
        const doc = parent.getDocument()
        langs ??= [['java'], ['kotlin', '.kt'], ['groovy']].reduce((accum, [lang, ext]) => {
          const base = doc.getAttribute(`import-${lang}`) || doc.getAttribute(`docs-${lang}`)
          if (base) accum.push({ name: lang[0].toUpperCase() + lang.slice(1), lang, ext: ext || '.' + lang, base })
          return accum
        }, [])
        if (!langs.length) return log(doc, 'warn', `no search locations defined for import::${target}[]`)
        tabsEnabled ??= doc.getExtensions().hasBlocks() && !!doc.getExtensions().getBlockFor('tabs', 'example')
        if (target.startsWith('code:')) target = target.slice(5)
        const section = nearest(parent, 'section')
        const relative = section ? section.getId().replaceAll('-', '').replaceAll('.', '/') + '/' + target : target
        const { file, contentCatalog } = context
        const imports = langs.reduce((accum, { name, lang, ext, base }) => {
          const resourceRef = base + '/' + relative + ext
          const resource = contentCatalog.resolveResource(resourceRef, file.src, undefined, IMPORT_FAMILIES)
          if (resource) accum.push({ name, lang, contents: resource.contents.toString().trimEnd() })
          return accum
        }, [])
        if (!imports.length) return log(doc, 'warn', `no code imports found for ${target}`)
        const source = []
        if (imports.length > 1) {
          if (tabsEnabled) {
            source.push('[tabs]', '======')
            imports.forEach(({ name, lang, contents }) => {
              if (source.length > 2) source.push('')
              source.push(`${name}::`, '+', `[,${lang}]`, '----', contents, '----')
            })
            source.push('======')
          } else {
            imports.forEach(({ name, lang, contents }) => {
              if (source.length) source.push('')
              source.push(`.${name}`, `[,${lang}]`, '----', contents, '----')
            })
          }
        } else {
          source.push(`[,${imports[0].lang}]`, '----', imports[0].contents, '----')
        }
        return this.parseContent(parent, source.join('\n'))
      })
    })
  }
}

function log (doc, severity, message) {
  doc.getLogger()[severity](doc.createLogMessage(message, { source_location: doc.getReader().$cursor_at_mark() }))
}

function nearest (node, context) {
  return !node || node.context === context ? node : nearest(node.parent, context)
}

module.exports = { register, createExtensionGroup }
