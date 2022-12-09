'use strict'

const toProc = require('./util/to-proc')

const CHOMP_MODES = {
  default: ['tags', 'formatters', 'suppresswarnings'],
  all: ['tags', 'formatters', 'suppresswarnings', 'headers', 'packages'],
  none: [],
}
const JAVA_LIKE = ['groovy', 'java', 'kotlin']

const ChompDirRx = /\/\/ @chomp:(file|line)$/
const ChompAndReplaceDirRx = /^(.+?)\/\*(?: @chomp:line (.+?) )?\*\/ ?\S/
const FormatterDirRx = /\/\/ @formatter:(?:on|off)$/
const PackageDeclRx = /^package (?:[a-z][a-z0-9]*(?:[.][a-z][a-z0-9]*)*)(;|)$/
const SuppressAnnotRx = /@Suppress(?:Warnings)?\(.+?\)$/

function register (registry) {
  if (!registry) return this.register('springio/code-chomping', createExtensionGroup())
  registry.groups.$store('springio/code-chomping', toProc(createExtensionGroup()))
  return registry
}

function createExtensionGroup () {
  return function () {
    this.treeProcessor(function () {
      this.process((doc) => {
        const chompDefault = doc.getAttribute('chomp', 'default')
        const package_ = doc.getAttribute('chomp_package_replacement') ?? doc.getAttribute('chomp-package-replacement')
        const blocks = doc.findBy(
          { context: 'listing' },
          (candidate) => candidate.getStyle() === 'source' && JAVA_LIKE.includes(candidate.getAttribute('language'))
        )
        blocks.forEach((block) => {
          const chomp = block.getAttribute('chomp', chompDefault)
          const ops = (CHOMP_MODES[chomp] || [chomp]).reduce((accum, mode) => (accum[mode] = true) && accum, {})
          if (ops.packages && package_ != null) ops.packages = package_
          let skipRest, match
          block.lines = block.getSourceLines().reduce((accum, line) => {
            if (skipRest) return accum
            if (line) {
              if (ops.suppresswarnings && ~line.indexOf('@Suppress') && SuppressAnnotRx.test(line)) return accum
              if (ops.formatters && ~line.indexOf('// @formatter:') && FormatterDirRx.test(line)) return accum
              if ((ops.headers || ops.packages) && line.startsWith('package ') && (match = line.match(PackageDeclRx))) {
                if (ops.headers) accum.splice(0)
                if (ops.packages) line = ops.packages === true ? undefined : `package ${ops.packages}${match[1]}`
                if (line) accum.push(line)
                ops.headers = ops.packages = false
                return accum
              }
              if (ops.tags) {
                if (~line.indexOf('// @chomp:') && (match = line.match(ChompDirRx))) {
                  if (match[1] === 'line') return accum
                  if (accum[accum.length - 1] === '') accum.pop()
                  skipRest = true
                  return accum
                } else if (~line.indexOf('/*') && (match = line.match(ChompAndReplaceDirRx))) {
                  const [, keep, replacement = '...'] = match
                  accum.push(keep + replacement)
                  return accum
                }
              }
            } else if (!accum.length) {
              return accum
            }
            accum.push(line)
            return accum
          }, [])
        })
      })
    })
  }
}

module.exports = { register, createExtensionGroup }
