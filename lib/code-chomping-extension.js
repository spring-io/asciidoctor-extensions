'use strict'

const CHOMP_MODES = {
  default: ['tags', 'formatters', 'suppresswarnings'],
  all: ['tags', 'formatters', 'suppresswarnings', 'headers', 'packages'],
  none: [],
}
const JAVA_LIKE = ['java', 'groovy', 'kt']

const ChompLineDirRx = /^(.+?)\/\*(?: @chomp:line (.+?) )?\*\/ ?\S/
const FormatterDirRx = /\/\/ @formatter:(?:on|off)$/
const PackageDeclRx = /^package (?:[a-z][a-z0-9]*(?:[.][a-z][a-z0-9]*)*)(;|)$/
const SuppressAnnotRx = /@Suppress(?:Warnings)?\(.+?\)$/

function register (registry) {
  if (!registry) return this.register(register)
  registry.treeProcessor(function () {
    this.process((doc) => {
      const chompDefault = doc.getAttribute('chomp', 'default')
      const newPackage = doc.getAttribute('chomp_package_replacement') ?? doc.getAttribute('chomp-package-replacement')
      const blocks = doc.findBy(
        { context: 'listing' },
        (candidate) => candidate.getStyle() === 'source' && JAVA_LIKE.includes(candidate.getAttribute('language'))
      )
      blocks.forEach((block) => {
        const chomp = block.getAttribute('chomp', chompDefault)
        const ops = (CHOMP_MODES[chomp] || [chomp]).reduce((accum, mode) => (accum[mode] = true) && accum, {})
        if (ops.packages && newPackage != null) ops.packages = newPackage
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
              if (line.endsWith('// @chomp:file')) {
                if (accum[accum.length - 1] === '') accum.pop()
                return (skipRest = true) && accum
              } else if (~line.indexOf('/*') && (match = line.match(ChompLineDirRx))) {
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
  return registry
}

module.exports.register = register
