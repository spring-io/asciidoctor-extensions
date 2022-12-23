/* eslint-env mocha */
'use strict'

const Asciidoctor = require('@asciidoctor/core')()
const { expect, heredoc, withMemoryLogger } = require('./harness')
const { name: packageName } = require('#package')

describe('section-ids-extension', () => {
  const ext = require(packageName + '/section-ids-extension')

  const run = (input = [], opts = {}) => {
    opts.extension_registry = ext.register(opts.extension_registry || Asciidoctor.Extensions.create())
    return Asciidoctor.load(input, opts)
  }

  describe('bootstrap', () => {
    it('should be able to require extension', () => {
      expect(ext).to.be.instanceOf(Object)
      expect(ext.register).to.be.instanceOf(Function)
    })

    it('should register to bound extension registry if register function called with no arguments', () => {
      try {
        ext.register.call(Asciidoctor.Extensions)
        const extGroups = Asciidoctor.Extensions.getGroups()
        const extGroupKeys = Object.keys(extGroups)
        expect(extGroupKeys).to.have.lengthOf(1)
        const extGroup = extGroups[extGroupKeys[0]]
        expect(extGroup).to.be.instanceOf(Function)
        const extensions = Asciidoctor.load([]).getExtensions()
        expect(extensions.getTreeProcessors()).to.have.lengthOf(1)
      } finally {
        Asciidoctor.Extensions.unregisterAll()
      }
    })

    it('should be able to call register function exported by extension', () => {
      const extensions = run().getExtensions()
      expect(extensions.getTreeProcessors()).to.have.lengthOf(1)
    })
  })

  describe('omitted', () => {
    it('should not attempt to validate document ID if not specified', () => {
      const input = heredoc`
      = Document Title

      content
      `
      withMemoryLogger((logger) => {
        run(input)
        expect(logger.getMessages()).to.be.empty()
      })
    })

    it('should not attempt to validate section ID inside AsciiDoc table cell', () => {
      const input = heredoc`
      = Document Title

      |===
      a|
      [#1_not_valid]
      == Section
      content
      |===
      `
      withMemoryLogger((logger) => {
        run(input)
        expect(logger.getMessages()).to.be.empty()
      })
    })
  })

  describe('validate ID syntax', () => {
    it('should validate valid document ID', () => {
      const input = heredoc`
      [#foo]
      = Document Title

      content
      `
      withMemoryLogger((logger) => {
        run(input)
        expect(logger.getMessages()).to.be.empty()
      })
    })

    it('should warn if document ID does not match expected syntax', () => {
      const input = heredoc`
      [#id_of_document]
      = Document Title

      content
      `
      withMemoryLogger((logger) => {
        run(input)
        const messages = logger.getMessages()
        expect(messages).to.have.lengthOf(1)
        const message = messages[0]
        expect(message.severity).to.equal('WARN')
        expect(message.message.text).to.match(/^local section ID does not match .+: id_of_document$/)
      })
    })

    it('should include file and line information in log message if sourcemap is enabled', () => {
      const input = heredoc`
      [#not_valid]
      = Document Title

      [[not_valid.also_not_valid]]
      == Section

      content
      `
      withMemoryLogger((logger) => {
        run(input, { attributes: { docfile: '/path/to/test.adoc', docdir: '/path/to' }, sourcemap: true })
        const messages = logger.getMessages()
        expect(messages).to.have.lengthOf(2)
        const message1 = messages[0]
        expect(message1.message).to.have.property('source_location')
        expect(message1.message).to.have.nested.property('source_location.file', 'test.adoc')
        expect(message1.message).to.have.nested.property('source_location.lineno', 1)
        const message2 = messages[1]
        expect(message2.message).to.have.property('source_location')
        expect(message2.message).to.have.nested.property('source_location.file', 'test.adoc')
        expect(message2.message).to.have.nested.property('source_location.lineno', 5)
      })
    })

    it('should warn if document ID contains level separator', () => {
      const input = heredoc`
      [[document.title]]
      = Document Title

      content
      `
      withMemoryLogger((logger) => {
        run(input)
        const messages = logger.getMessages()
        expect(messages).to.have.lengthOf(1)
        const message = messages[0]
        expect(message.severity).to.equal('WARN')
        expect(message.message.text).to.match(/^local section ID does not match .+: document\.title$/)
      })
    })

    it('should warn if local section ID does not match expected syntax', () => {
      const input = heredoc`
      [#foo]
      = Foo
      :sectid-word-separator: _

      [[foo.bar_baz]]
      == Bar Baz
      `
      withMemoryLogger((logger) => {
        run(input)
        expect(logger.getMessages()).to.be.empty()
      })
    })

    it('should allow word separator to be customized using sectid-word-separator attribute', () => {
      const input = heredoc`
      [#foo]
      = Foo

      [[foo.bar_baz]]
      == Bar Baz
      `
      withMemoryLogger((logger) => {
        run(input)
        const messages = logger.getMessages()
        expect(messages).to.have.lengthOf(1)
        const message = messages[0]
        expect(message.severity).to.equal('WARN')
        expect(message.message.text).to.match(/^local section ID does not match .+: foo.bar_baz$/)
      })
    })
  })

  describe('validate ID nesting', () => {
    it('should validate that section ID extends parent section ID', () => {
      const input = heredoc`
      [#foo]
      = Foo

      [[foo.bar]]
      == Bar
      `
      withMemoryLogger((logger) => {
        run(input)
        expect(logger.getMessages()).to.be.empty()
      })
    })

    it('should warn if section ID does not extend parent section ID', () => {
      const input = heredoc`
      [#foo]
      = Foo

      [[yin.yang]]
      == Bar
      `
      withMemoryLogger((logger) => {
        run(input)
        const messages = logger.getMessages()
        expect(messages).to.have.lengthOf(1)
        const message = messages[0]
        expect(message.severity).to.equal('WARN')
        expect(message.message.text).to.equal('expecting section ID to start with foo: yin.yang')
      })
    })

    it('should include file and line information in log message if sourcemap is enabled', () => {
      const input = heredoc`
      [[root]]
      = Document Title

      [[docid.section]]
      == Section

      content
      `
      withMemoryLogger((logger) => {
        run(input, { attributes: { docfile: '/path/to/test.adoc', docdir: '/path/to' }, sourcemap: true })
        const messages = logger.getMessages()
        expect(messages).to.have.lengthOf(1)
        const message = messages[0]
        expect(message.message).to.have.property('source_location')
        expect(message.message).to.have.nested.property('source_location.file', 'test.adoc')
        expect(message.message).to.have.nested.property('source_location.lineno', 5)
      })
    })

    it('should warn if section ID does not have parent segment', () => {
      const input = heredoc`
      [#foo]
      = Foo

      [#bar]
      == Bar
      `
      withMemoryLogger((logger) => {
        run(input)
        const messages = logger.getMessages()
        expect(messages).to.have.lengthOf(1)
        const message = messages[0]
        expect(message.severity).to.equal('WARN')
        expect(message.message.text).to.equal('expecting section ID to start with foo: bar')
      })
    })

    it('should allow level separator to be customized using sectid-level-separator', () => {
      const input = heredoc`
      [#foo]
      = Foo
      :sectid-level-separator: $

      [[foo$bar]]
      == Bar
      `
      withMemoryLogger((logger) => {
        run(input)
        expect(logger.getMessages()).to.be.empty()
      })
    })
  })
})
