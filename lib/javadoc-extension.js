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
        const processed = process(parent.getDocument(), parseTarget(target), attrs)
        return this.createInline(parent, 'quoted', processed.text, processed.opts)
      })
    })
  }
}

function parseTarget (target) {
  target = target.replaceAll('&#8230;&#8203;', '\\...')
  const lastSlash = target.lastIndexOf('/')
  const location = lastSlash !== -1 ? target.substring(0, lastSlash) : undefined
  const reference = lastSlash !== -1 ? target.substring(lastSlash + 1, target.length) : target
  const lastHash = reference.lastIndexOf('#')
  const classReference = lastHash !== -1 ? reference.substring(0, lastHash) : reference
  const lastDot = classReference.lastIndexOf('.')
  const packageReference = classReference.substring(0, lastDot)
  const anchor = lastHash !== -1 ? reference.substring(lastHash + 1, reference.length) : undefined
  return { location, packageReference, classReference, anchor }
}

function process (document, target, attrs) {
  const description = attrs.$positional?.[0]
  if (description) {
    // Substitutions have already been applied to positional attributes
    return createLinkMarkup(document, target, description, { subs: 'none' })
  }
  const format = attrs.format || document.getAttribute('javadoc-format', 'short')
  const formattedDescription = applyFormat(target, format).replaceAll(',', ',')
  return createLinkMarkup(document, target, formattedDescription, { subs: 'normal' })
}

function createLinkMarkup (document, target, description, attributes) {
  const location = target.location || getTargetLocation(document, target)
  const text = `${link(location, target)}[${description},role=apiref]`
  return { text, opts: { attributes } }
}

function getTargetLocation (document, target) {
  let name = target.packageReference
  while (name !== '') {
    const location = document.getAttribute('javadoc-location-' + name.replaceAll('.', '-'))
    if (location) return location
    const lastDot = name.lastIndexOf('.')
    name = lastDot > 0 ? name.substring(0, lastDot) : ''
  }
  return document.getAttribute('javadoc-location', 'xref:attachment$api/java')
}

function link (location, target) {
  let link = location
  link = !link.endsWith('/') ? link + '/' : link
  link += target.classReference.replaceAll('.', '/').replaceAll('$', '.') + '.html'
  if (target.anchor) link += '#' + target.anchor
  return link
}

function applyFormat (target, format, annotationAnchor) {
  switch (format) {
    case 'full':
      return '`' + className(target.classReference, 'full') + anchorText(target.anchor, format, annotationAnchor) + '`'
    case 'annotation':
      return '`@' + className(target.classReference, 'short') + anchorText(target.anchor, format) + '`'
    default:
      return '`' + className(target.classReference, 'short') + anchorText(target.anchor, format) + '`'
  }
}

function anchorText (anchor, format, annotationAnchor) {
  if (!anchor) return ''
  if (format === 'annotation' || annotationAnchor) anchor = anchor.replaceAll('()', '')
  const methodMatch = METHOD_REGEX.exec(anchor)
  const result = '.' + (methodMatch ? methodText(methodMatch[1], methodMatch[2], format) : anchor)
  return result.replaceAll(',', '+++,+++')
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
