'use strict'

const toProc = require('./util/to-proc')
const { posix: path } = require('path')

const INCLUDE_FAMILIES = ['attachment', 'example', 'partial']

function register (registry, context) {
  if (!(registry && context)) return // NOTE only works as scoped extension for now
  registry.$groups().$store('springio/include-code', toProc(createExtensionGroup(context)))
  return registry
}

function createExtensionGroup (context) {
  return function () {
    const PreprocessorReader = global.Opal.Asciidoctor.PreprocessorReader
    let langs, tabsEnabled
    this.blockMacro(function () {
      this.named('include-code')
      this.process((parent, target, attrs) => {
        const doc = parent.getDocument()
        const realtivePathPrefix = './'
        const useRelativePath = target && target.startsWith(realtivePathPrefix)
        const sanitizedTarget = useRelativePath ? target.slice(realtivePathPrefix.length) : target
        langs ??= [['java'], ['kotlin', '.kt'], ['groovy'], ['xml']].reduce((accum, [lang, ext]) => {
          const base = doc.getAttribute(`include-${lang}`)
          if (base) accum.push({ name: lang[0].toUpperCase() + lang.slice(1), lang, ext: ext || '.' + lang, base })
          return accum
        }, [])
        if (!langs.length) return log(doc, 'warn', `no search locations defined for include-code::${target}[]`)
        const cursor = doc.getReader().$cursor_at_mark()
        tabsEnabled ??= doc.getExtensions().hasBlocks() && !!doc.getExtensions().getBlockFor('tabs', 'example')
        const attrsStr = Object.entries(attrs)
          .filter(([n, v]) => n !== 'title')
          .reduce((buf, [n, v]) => `${buf}${buf ? ',' : ''}${n}=${v}`, '')
        const sectionId = (nearest(parent, 'section') || doc).getId()
        const relativeIdPath = sectionId
          ? sectionId.replaceAll('-', '').replaceAll('.', '/') + '/' + sanitizedTarget
          : sanitizedTarget
        const srcPath = doc.getAttribute('page-relative-src-path')
        const dirPath = path.dirname(srcPath).replaceAll('-', '')
        const relative = useRelativePath && dirPath !== '.' ? dirPath + '/' + relativeIdPath : relativeIdPath
        const { file, contentCatalog } = context
        const resources = langs.reduce((accum, { name, lang, ext, base }) => {
          const ref = base + '/' + relative + ext
          const exists = !!contentCatalog.resolveResource(ref, file.src, undefined, INCLUDE_FAMILIES)
          const lines = exists
            ? PreprocessorReader.$new(doc, [`include::${ref}[${attrsStr}]`], cursor).readLines()
            : null
          return accum.concat({ ref, name, lang, lines, exists })
        }, [])
        const includes = resources.filter((r) => {
          return r.exists
        })
        const resouresInfo = resources.map((r) => `{ref: ${r.ref}, exists: ${r.exists}}`)
        if (!includes.length) {
          return log(doc, 'warn', `no code includes found for ${target}. Checked ${resouresInfo}`)
        } else {
          log(doc, 'info', `Checked the resources ${resouresInfo} for target ${target}`)
        }
        const tabsSource = generateTabsSource(attrs.title, attrs['sync-group-id'], includes, tabsEnabled, attrsStr)
        const reader = PreprocessorReader.$new(doc, tabsSource, cursor)
        Object.defineProperty(reader, 'lineno', { get: () => cursor.lineno })
        return this.parseContent(parent, reader)
      })
    })
  }
}

function generateTabsSource (title, syncGroupId, includes, tabsEnabled, attrsStr) {
  const source = []
  if (includes.length === 1) {
    if (title) source.push('.' + title)
    source.push(`[${attrsStr}]`)
    source.push(`[,${includes[0].lang}]`, '----', ...includes[0].lines, '----')
  } else if (tabsEnabled) {
    if (title) source.push('.' + title)
    const lastIdx = includes.length - 1
    const tabAttrs = syncGroupId ? `,sync-group-id=${syncGroupId}` : ''
    includes.forEach(({ name, lang, lines }, idx) => {
      idx ? source.push('') : source.push(`[tabs${tabAttrs}]`, '======')
      source.push(`${name}::`, '+', `[${attrsStr}]`, `[,${lang}]`, '----', ...lines, '----')
      if (idx === lastIdx) source.push('======')
    })
  } else {
    includes.forEach(({ name, lang, lines }) => {
      if (source.length) source.push('')
      source.push('.' + (title ? title + ' - ' + name : name), `[${attrsStr}]`, `[,${lang}]`, '----', ...lines, '----')
    })
  }
  return source
}

function log (doc, severity, message) {
  doc.getLogger()[severity](doc.createLogMessage(message, { source_location: doc.getReader().$cursor_at_mark() }))
}

function nearest (node, context) {
  return !node || node.getContext() === context ? node : nearest(node.getParent(), context)
}

module.exports = { register, createExtensionGroup }
