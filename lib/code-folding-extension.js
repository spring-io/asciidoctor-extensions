'use strict'

const FOLD_MODES = { default: ['imports', 'tags'], all: ['imports', 'tags'], none: [] }
const JAVA_LIKE = ['groovy', 'java', 'kotlin']

const FoldDirectiveRx = /^\s*\/\/ @fold:(?:(on)( \S.*)?|off)$/

function register (registry) {
  if (!registry) return this.register(register)
  registry.treeProcessor(function () {
    this.process((doc) => {
      const foldDefault = doc.getAttribute('fold', 'default')
      const blocks = doc.findBy({ context: 'listing' }, (candidate) => candidate.getStyle() === 'source')
      blocks.forEach((block) => {
        const fold = block.getAttribute('fold', foldDefault)
        const ops = (FOLD_MODES[fold] || [fold]).reduce((accum, mode) => (accum[mode] = true) && accum, {})
        if (ops.imports && !JAVA_LIKE.includes(block.getAttribute('language'))) delete ops.imports
        if (Object.keys(ops).length) {
          block.$content = addFolds.bind(block, block.$content, ops)
          return
        }
        const sourceLines = block.getSourceLines()
        sourceLines.splice(0).forEach((line) => {
          if (~line.indexOf('// ') && FoldDirectiveRx.test(line)) return
          sourceLines.push(line)
        })
      })
    })
  })
  return registry
}

function addFolds (getContent, { tags: foldTags, imports: foldImports }) {
  const source = getContent.call(this)
  if (source['$nil?']()) return source
  let chunks, inFoldBlock, replacementTextIdx, match
  chunks = source.split('\n').reduce((accum, line) => {
    if (foldImports && line.startsWith('import ')) {
      if (!inFoldBlock) {
        accum.push('<span class="fold-block is-hidden-folded">')
      } else if (inFoldBlock !== 'imports') {
        accum.push('</span>', '<span class="fold-block is-hidden-folded">')
      }
      inFoldBlock = 'imports'
      accum.push(line + '\n')
    } else if (~line.indexOf('// ') && (match = line.match(FoldDirectiveRx))) {
      if (!foldTags) return accum
      foldImports = false
      let [, state, replacement] = match
      if (state === 'on') {
        if (inFoldBlock) accum.push('</span>')
        if (replacement) {
          replacement = line.split('// ')[0] + replacement.trimStart()
          replacementTextIdx = accum.length + 1
          accum.push('<span class="fold-block is-hidden-unfolded">', replacement + '\n', '</span>')
        }
        accum.push('<span class="fold-block is-hidden-folded">')
        inFoldBlock = true
      } else {
        accum.push('</span>')
        inFoldBlock = false
      }
    } else if (inFoldBlock) {
      if (line && inFoldBlock === 'imports') {
        accum.push('</span>', '<span class="fold-block">')
        inFoldBlock = true
      }
      accum.push(line + '\n')
    } else {
      inFoldBlock = accum.length ? true : 'initial'
      if (line) {
        accum.push('<span class="fold-block">', line + '\n')
      } else {
        if (replacementTextIdx) accum[replacementTextIdx] += '\n'
        accum.push('\n', accum.pop(), '<span class="fold-block">')
      }
      replacementTextIdx = undefined
    }
    return accum
  }, [])
  if (inFoldBlock) inFoldBlock === 'initial' ? (chunks = chunks.splice(1)) : chunks.push('</span>')
  return chunks.join('').replace(/\n(?=$|<\/span>$)/, '')
}

module.exports.register = register
