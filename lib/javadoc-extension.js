'use strict'

const toProc = require('./util/to-proc')

const METHOD_REGEX = /(.*)\((.*)\)/

function register (registry, context) {
  if (!(registry && context)) return // NOTE only works as scoped extension for now
  registry.$groups().$store('springio/javadoc', toProc(createExtensionGroup(context)))
  return registry
}

function createExtensionGroup () {
  return function () {
    this.inlineMacro(function () {
      this.named('javadoc')
      this.process((parent, target, attrs) => {
        const text = process(parent.getDocument(), parseTarget(target), attrs)
        return this.createInline(parent, 'quoted', text, {
          type: 'monospaced',
        })
      })
    })
  }
}

function parseTarget (target) {
  target = target.replaceAll('&#8230;&#8203;', '...')
  const lastSlash = target.lastIndexOf('/')
  const location = lastSlash !== -1 ? target.substring(0, lastSlash) : undefined
  const reference = lastSlash !== -1 ? target.substring(lastSlash + 1, target.length) : target
  const lastHash = reference.lastIndexOf('#')
  const classReference = lastHash !== -1 ? reference.substring(0, lastHash) : reference
  const anchor = lastHash !== -1 ? reference.substring(lastHash + 1, reference.length) : undefined
  return { location, classReference, anchor }
}

function process (document, target, attrs) {
  const location = target.location || document.getAttribute('javadoc-location', 'xref:attachment$api/java')
  const format = attrs.format || document.getAttribute('javadoc-format', 'short')
  const linkLocation = link(location, target)
  const linkDescription = applyFormat(target, format, attrs.$positional)
  return `${linkLocation}['${linkDescription}',role=apiref]`
}

function link (location, target) {
  let link = location
  link = !link.endsWith('/') ? link + '/' : link
  link += target.classReference.replaceAll('.', '/').replaceAll('$', '.') + '.html'
  if (target.anchor) link += '#' + target.anchor
  return link
}

function applyFormat (target, format, positionalAttrs, annotationAnchor) {
  if (positionalAttrs?.[0]) return positionalAttrs?.[0]
  switch (format) {
    case 'full':
      return className(target.classReference, 'full') + anchorText(target.anchor, format, annotationAnchor)
    case 'annotation':
      return '@' + className(target.classReference, 'short') + anchorText(target.anchor, format)
    default:
      return className(target.classReference, 'short') + anchorText(target.anchor, format)
  }
}

function anchorText (anchor, format, annotationAnchor) {
  if (!anchor) return ''
  if (format === 'annotation' || annotationAnchor) anchor = anchor.replaceAll('()', '')
  const methodMatch = METHOD_REGEX.exec(anchor)
  if (methodMatch) {
    return '.' + methodText(methodMatch[1], methodMatch[2], format)
  }
  return '.' + anchor
}

function methodText (name, params, format) {
  const varargs = params.endsWith('...')
  if (varargs) params = params.substring(0, params.length - 3)
  return (
    name +
    '(' +
    params
      .split(',')
      .map((name) => className(name, format))
      .join(', ') +
    (!varargs ? ')' : '...)')
  )
}

function className (classReference, format) {
  if (format !== 'full') classReference = classReference.split('.').slice(-1)[0]
  return classReference.replaceAll('$', '.')
}

module.exports = { register, createExtensionGroup }
