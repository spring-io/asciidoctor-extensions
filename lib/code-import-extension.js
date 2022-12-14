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
    const PreprocessorReader = global.Opal.Asciidoctor.PreprocessorReader
    let langs, tabsEnabled
    this.blockMacro(function () {
      this.named('import')
      this.process((parent, target, attrs) => {
        const doc = parent.getDocument()
        langs ??= [['java'], ['kotlin', '.kt'], ['groovy']].reduce((accum, [lang, ext]) => {
          const base = doc.getAttribute(`import-${lang}`) || doc.getAttribute(`docs-${lang}`)
          if (base) accum.push({ name: lang[0].toUpperCase() + lang.slice(1), lang, ext: ext || '.' + lang, base })
          return accum
        }, [])
        if (!langs.length) return log(doc, 'warn', `no search locations defined for import::${target}[]`)
        tabsEnabled ??= doc.getExtensions().hasBlocks() && !!doc.getExtensions().getBlockFor('tabs', 'example')
        if (target.startsWith('code:')) target = target.slice(5)
        const attrsStr = Object.entries(attrs)
          .reduce((accum, [n, v]) => accum.concat(`${n}=${v}`), [])
          .join(',')
        const sectionId = (nearest(parent, 'section') || doc).getId()
        const relative = sectionId ? sectionId.replaceAll('-', '').replaceAll('.', '/') + '/' + target : target
        const { file, contentCatalog } = context
        const imports = langs.reduce((accum, { name, lang, ext, base }) => {
          const ref = base + '/' + relative + ext
          const resource = contentCatalog.resolveResource(ref, file.src, undefined, IMPORT_FAMILIES)
          return resource ? accum.concat({ name, lang, includeDirective: `include::${ref}[${attrsStr}]` }) : accum
        }, [])
        if (!imports.length) return log(doc, 'warn', `no code imports found for ${target}`)
        const source = []
        const title = attrs.title
        if (imports.length > 1) {
          if (tabsEnabled) {
            if (title) source.push('.' + title)
            source.push('[tabs]', '======')
            imports.forEach(({ name, lang, includeDirective }) => {
              if (source.length > 3) source.push('')
              source.push(`${name}::`, '+', `[,${lang}]`, '----', includeDirective, '----')
            })
            source.push('======')
          } else {
            imports.forEach(({ name, lang, includeDirective }) => {
              if (source.length) source.push('')
              source.push('.' + (title ? title + ' - ' + name : name), `[,${lang}]`, '----', includeDirective, '----')
            })
          }
        } else {
          if (title) source.push('.' + title)
          source.push(`[,${imports[0].lang}]`, '----', imports[0].includeDirective, '----')
        }
        const cursor = doc.getReader().$cursor_at_mark()
        const reader = PreprocessorReader.$new(doc, source, cursor)
        reader.$cursor_at_prev_line = () => cursor
        Object.defineProperty(reader, 'lineno', { get: () => cursor.lineno + 1 })
        return this.parseContent(parent, reader)
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
