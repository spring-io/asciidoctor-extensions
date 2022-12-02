;(function () {
  'use strict'/*! Spring Asciidoctor Source Toolbox | ASL-2.0 License */

  var CMD_RX = /^\$ (\S[^\\\n]*(\\\n(?!\$ )[^\\\n]*)*)(?=\n|$)/gm
  var LINE_CONTINUATION_RX = /( ) *\\\n *|\\\n( ?) */g
  var PRE_SELECTORS = '.doc pre.highlight, .doc .content > pre:not([class])'
  var TRAILING_SPACE_RX = / +$/gm

  var supportsCopy = window.navigator.clipboard

  ;[].slice.call(document.querySelectorAll(PRE_SELECTORS)).forEach(function (pre) {
    var code, copy, fold
    if (pre.classList.contains('highlight')) {
      code = pre.querySelector('code')
    } else if (pre.innerText.startsWith('$ ')) {
      var block = pre.parentNode.parentNode
      block.classList.remove('literalblock')
      block.classList.add('listingblock')
      pre.classList.add('highlightjs', 'highlight')
      code = Object.assign(document.createElement('code'), { className: 'language-console hljs' })
      code.dataset.lang = 'console'
      code.appendChild(pre.firstChild)
      pre.appendChild(code)
    } else {
      return
    }
    var toolbox = Object.assign(document.createElement('div'), { className: 'source-toolbox' })
    if (pre.querySelector('.fold-block')) {
      fold = Object.assign(document.createElement('button'), { className: 'fold-button' })
      fold.setAttribute('title', (fold.dataset.foldedTitle = 'Expand foldable text'))
      fold.dataset.unfoldedTitle = 'Collapse foldable text'
      toolbox.appendChild(fold)
    }
    if (supportsCopy) {
      copy = Object.assign(document.createElement('button'), { className: 'copy-button' })
      copy.setAttribute('title', 'Copy to clipboard')
      var toast = Object.assign(document.createElement('span'), { className: 'copy-toast' })
      toast.appendChild(document.createTextNode('Copied!'))
      copy.appendChild(toast)
      toolbox.appendChild(copy)
    }
    if (fold || copy) {
      pre.appendChild(toolbox)
      if (fold) fold.addEventListener('click', toggleFolds.bind(fold, code))
      if (copy) copy.addEventListener('click', writeToClipboard.bind(copy, code))
    }
  })

  function extractCommands (text) {
    var cmds = []
    var match
    while ((match = CMD_RX.exec(text))) cmds.push(match[1].replace(LINE_CONTINUATION_RX, '$1$2'))
    return cmds.join(' && ')
  }

  function toggleFolds (code) {
    var scratchBlock = getScratchBlock(code)
    var newState = code.classList.contains('is-unfolded') ? 'folded' : 'unfolded'
    ;[].slice.call(code.querySelectorAll('.fold-block')).forEach(function (foldBlock) {
      if (foldBlock.classList.length === 1) return
      foldBlock.removeEventListener('transitionrun', clearMaxHeight)
      foldBlock.removeEventListener('transitionend', clearMaxHeight)
      if (foldBlock.classList.contains('is-hidden-' + newState)) {
        foldBlock.style.maxHeight = Math.round(foldBlock.getBoundingClientRect().height) + 'px'
        foldBlock.addEventListener('transitionrun', clearMaxHeight)
      } else {
        var foldBlockClone = scratchBlock.appendChild(foldBlock.cloneNode(true))
        foldBlock.style.maxHeight = Math.round(foldBlockClone.getBoundingClientRect().height) + 'px'
        foldBlock.addEventListener('transitionend', clearMaxHeight)
      }
    })
    scratchBlock.innerHTML = ''
    this.setAttribute('title', this.dataset[newState + 'Title'])
    code.classList[newState === 'unfolded' ? 'add' : 'remove']('is-unfolded')
    //if (newState === 'unfolded') return
    //window.setTimeout(function () {
    //  code.parentNode.scrollIntoView({ block: 'nearest', behavior: 'instant' })
    //}, 300)
  }

  function clearMaxHeight (e) {
    this.removeEventListener(e.type, clearMaxHeight)
    this.style.maxHeight = ''
  }

  function getScratchBlock (code) {
    var el = code.querySelector('.scratch-block')
    if (el) return el
    var style = 'clear: left; height: 0; overflow: hidden'
    return code.appendChild(Object.assign(document.createElement('div'), { className: 'scratch-block', style: style }))
  }

  function writeToClipboard (code) {
    var subject = code
    if (code.querySelector('.fold-block')) {
      subject = code.cloneNode(true)
      ;[].slice.call(subject.querySelectorAll('.is-hidden-unfolded')).forEach(function (el) {
        el.parentNode.removeChild(el)
      })
    }
    var text = subject.innerText.replace(TRAILING_SPACE_RX, '')
    if (code.dataset.lang === 'console' && text.startsWith('$ ')) text = extractCommands(text)
    window.navigator.clipboard.writeText(text).then(
      function () {
        this.classList.add('clicked')
        this.offsetHeight // eslint-disable-line no-unused-expressions
        this.classList.remove('clicked')
      }.bind(this),
      function () {}
    )
  }
})()
