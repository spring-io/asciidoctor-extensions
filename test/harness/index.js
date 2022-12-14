/* eslint-env mocha */
'use strict'

process.env.NODE_ENV = 'test'

const chai = require('chai')

chai.use(require('chai-fs'))
chai.use(require('chai-spies'))
// dirty-chai must be loaded after the other plugins
// see https://github.com/prodatakey/dirty-chai#plugin-assertions
chai.use(require('dirty-chai'))

const filterLines = (str, predicate) => str.split('\n').filter(predicate).join('\n')

const heredoc = (literals, ...vals) => {
  const str = literals
    .reduce((accum, chunk, idx) => {
      if (!idx) return [chunk]
      let val = vals[idx - 1]
      let match
      const last = accum[accum.length - 1]
      if (last.charAt(last.length - 1) === ' ' && (match = /\n( +)$/.exec(last))) {
        const indent = match[1]
        const valLines = val.split(/^/m)
        if (valLines.length > 1) val = valLines.map((l, i) => (i ? indent + l : l)).join('')
      }
      return accum.concat(val, chunk)
    }, undefined)
    .join('')
    .trimEnd()
  let lines = str.split(/^/m)
  if (lines[0] === '\n') lines = lines.slice(1)
  if (lines.length < 2) return str // discourage use of heredoc in this case
  const last = lines.pop()
  if (last != null) {
    lines.push(last[last.length - 1] === '\\' && last[last.length - 2] === ' ' ? last.slice(0, -2) + '\n' : last)
  }
  const indentRx = /^ +/
  const indentSize = Math.min(...lines.filter((l) => l.charAt() === ' ').map((l) => l.match(indentRx)[0].length))
  return (indentSize ? lines.map((l) => (l.charAt() === ' ' ? l.slice(indentSize) : l)) : lines).join('')
}

module.exports = { expect: chai.expect, filterLines, heredoc, spy: chai.spy }
