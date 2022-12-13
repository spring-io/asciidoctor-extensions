/* eslint-env mocha */
'use strict'

const Asciidoctor = require('@asciidoctor/core')()
const { expect, heredoc } = require('./harness')
const { name: packageName } = require('#package')

describe('code-import-extension', () => {
  const ext = require(packageName + '/code-import-extension')

  const file = {
    src: { component: 'spring-security', version: '6.0.0', module: 'ROOT', family: 'page', relative: 'index.adoc' },
  }

  let contentCatalog

  const addExample = (relative, contents) => {
    contents = Buffer.from(contents)
    const example = { contents, src: { ...file.src, family: 'example', relative } }
    contentCatalog.files.push(example)
    return example
  }

  const createContentCatalog = () => ({
    files: [],
    resolveResource (ref, context, defaultFamily, permittedFamilies) {
      const [family, relative] = ref.split('$')
      if (!permittedFamilies.includes(family)) return
      return this.files.find(
        ({ src: candidate }) =>
          candidate.relative === relative &&
          candidate.family === family &&
          candidate.component === context.component &&
          candidate.version === context.version &&
          candidate.module === context.module
      )
    },
  })

  const run = (input = [], opts = {}) => {
    opts.attributes ??= {
      'import-java': 'example$java',
      'import-kotlin': 'example$kotlin',
      'import-groovy': 'example$groovy',
    }
    const context = { file, contentCatalog }
    opts.extension_registry = ext.register(opts.extension_registry || Asciidoctor.Extensions.create(), context)
    if (opts.registerAsciidoctorTabs) {
      require('@asciidoctor/tabs').register(opts.extension_registry)
      delete opts.registerAsciidoctorTabs
    }
    return Asciidoctor.load(input, opts)
  }

  beforeEach(() => {
    contentCatalog = createContentCatalog()
  })

  describe('bootstrap', () => {
    it('should be able to require extension', () => {
      expect(ext).to.be.instanceOf(Object)
      expect(ext.register).to.be.instanceOf(Function)
    })

    it('should not register to bound extension registry if register function called with no arguments', () => {
      try {
        ext.register.call(Asciidoctor.Extensions)
        const extGroups = Asciidoctor.Extensions.getGroups()
        const extGroupKeys = Object.keys(extGroups)
        expect(extGroupKeys).to.be.empty()
      } finally {
        Asciidoctor.Extensions.unregisterAll()
      }
    })

    it('should not register extension group if context is undefined', () => {
      const input = []
      const opts = { extension_registry: ext.register(Asciidoctor.Extensions.create()) }
      const extensions = Asciidoctor.load(input, opts).getExtensions()
      expect(extensions).to.be.undefined()
    })

    it('should be able to call register function exported by extension', () => {
      const extensions = run().getExtensions()
      expect(extensions).to.exist()
      expect(extensions.getBlockMacros()).to.have.lengthOf(1)
      expect(extensions.getBlockMacros()[0].instance.name).to.equal('import')
    })
  })

  describe('import code', () => {
    const withMemoryLogger = (callback) => {
      const oldLogger = Asciidoctor.LoggerManager.getLogger()
      const logger = Asciidoctor.MemoryLogger.create()
      Asciidoctor.LoggerManager.setLogger(logger)
      try {
        callback(logger)
      } finally {
        Asciidoctor.LoggerManager.setLogger(oldLogger)
      }
    }

    it('should warn if import macro is found but no import-<lang> attributes are defined', () => {
      const expectedMessage = 'no search locations defined for import::code:hello[]'
      const expectedLineno = 1
      const input = 'import::code:hello[]'
      withMemoryLogger((logger) => {
        run(input, { attributes: {} })
        const messages = logger.getMessages()
        expect(messages).to.have.lengthOf(1)
        expect(messages[0].severity).to.equal('WARN')
        expect(messages[0].message).to.have.property('text', expectedMessage)
        expect(messages[0].message).to.have.nested.property('source_location.lineno', expectedLineno)
      })
    })

    it('should import single code snippet if only one import-<lang> attribute is set', () => {
      const expectedSource = heredoc`
      fun main(args : Array<String>) {
        println("Hello, World!")
      }
      `
      const expectedAttrs = { style: 'source', language: 'kotlin' }
      addExample('kotlin/hello.kt', expectedSource)
      const input = 'import::code:hello[]'
      const actual = run(input, { attributes: { 'import-kotlin': 'example$kotlin' } })
      expect(actual.getBlocks()).to.have.lengthOf(1)
      expect(actual.getBlocks()[0].getSource()).to.equal(expectedSource)
      expect(actual.getBlocks()[0].getAttributes()).to.include(expectedAttrs)
    })

    it('should import single code snippet if all import-<lang> attributes are set but only one resource is found', () => {
      const expectedSource = heredoc`
      fun main(args : Array<String>) {
        println("Hello, World!")
      }
      `
      const expectedAttrs = { style: 'source', language: 'kotlin' }
      addExample('kotlin/hello.kt', expectedSource)
      const input = 'import::code:hello[]'
      const actual = run(input)
      expect(actual.getBlocks()).to.have.lengthOf(1)
      expect(actual.getBlocks()[0].getSource()).to.equal(expectedSource)
      expect(actual.getBlocks()[0].getAttributes()).to.include(expectedAttrs)
    })

    it('should import multiple code snippets if all import-<lang> attributes are set and multiple resources are found', () => {
      const expected = [
        { style: 'source', language: 'java', title: 'Java' },
        { style: 'source', language: 'kotlin', title: 'Kotlin' },
        { style: 'source', language: 'groovy', title: 'Groovy' },
      ]
      addExample(
        'kotlin/hello.kt',
        heredoc`
        fun main(args : Array<String>) {
          println("Hello, World!")
        }
        `
      )
      addExample(
        'java/hello.java',
        heredoc`
        public class Hello {
          public static void main (String[] args) {
            System.out.println("Hello, World!");
          }
        }
        `
      )
      addExample('groovy/hello.groovy', 'println "Hello, World!"')
      const input = 'import::code:hello[]'
      const actual = run(input).findBy({ context: 'listing' })
      expect(actual).to.have.lengthOf(3)
      const actualProperties = actual.map((block) => {
        return { style: block.getStyle(), language: block.getAttributes().language, title: block.getTitle() }
      })
      expect(actualProperties).to.eql(expected)
    })

    it('should wrap multiple sibling code snippets in tabs block if @asciidoctor/tabs extension is registered', () => {
      const expected = [
        { style: 'source', language: 'java', title: undefined },
        { style: 'source', language: 'kotlin', title: undefined },
        { style: 'source', language: 'groovy', title: undefined },
      ]
      addExample(
        'kotlin/hello.kt',
        heredoc`
        fun main(args : Array<String>) {
          println("Hello, World!")
        }
        `
      )
      addExample(
        'java/hello.java',
        heredoc`
        public class Hello {
          public static void main (String[] args) {
            System.out.println("Hello, World!");
          }
        }
        `
      )
      addExample('groovy/hello.groovy', 'println "Hello, World!"')
      const input = 'import::code:hello[]'
      const doc = run(input, { registerAsciidoctorTabs: true })
      const tabs = doc.getBlocks()[0]
      expect(tabs).to.exist()
      expect(tabs.hasRole('tabs')).to.be.true()
      const tablist = tabs.findBy({ context: 'ulist' })[0]
      expect(tablist).to.exist()
      expect(tablist.getItems()).to.have.lengthOf(3)
      const codeBlocks = tabs.findBy({ context: 'listing' })
      expect(codeBlocks).to.have.lengthOf(3)
      const actualProperties = codeBlocks.map((block) => {
        return { style: block.getStyle(), language: block.getAttributes().language, title: block.getTitle() }
      })
      expect(actualProperties).to.eql(expected)
    })

    it('should not import code for unsupported language, even if import-<lang> is defined', () => {
      addExample('ruby/hello.rb', 'puts "Hello, World!"')
      addExample(
        'kotlin/hello.kt',
        heredoc`
        fun main(args : Array<String>) {
         println("Hello, World!")
        }
        `
      )
      const input = 'import::code:hello[]'
      const actual = run(input, { attributes: { 'docs-kotlin': 'example$kotlin', 'docs-ruby': 'example$ruby' } })
      expect(actual.getBlocks()).to.have.lengthOf(1)
      expect(actual.getBlocks()[0].getAttributes().language).to.equal('kotlin')
    })

    it('should support docs-<lang> as an alternative attribute name pattern to import-<lang>', () => {
      const expectedSource = heredoc`
      fun main(args : Array<String>) {
        println("Hello, World!")
      }
      `
      const expectedAttrs = { style: 'source', language: 'kotlin' }
      addExample('kotlin/hello.kt', expectedSource)
      const input = 'import::code:hello[]'
      const actual = run(input, { attributes: { 'docs-kotlin': 'example$kotlin' } })
      expect(actual.getBlocks()).to.have.lengthOf(1)
      expect(actual.getBlocks()[0].getSource()).to.equal(expectedSource)
      expect(actual.getBlocks()[0].getAttributes()).to.include(expectedAttrs)
    })

    it('should warn if at least one import-<lang> attribute is set but no resources are found', () => {
      const expectedMessage = 'no code imports found for hello'
      const expectedLineno = 1
      const input = 'import::code:hello[]'
      withMemoryLogger((logger) => {
        const actual = run(input)
        expect(actual.getBlocks()).to.be.empty()
        const messages = logger.getMessages()
        expect(messages).to.have.lengthOf(1)
        expect(messages[0].severity).to.equal('WARN')
        expect(messages[0].message).to.have.property('text', expectedMessage)
        expect(messages[0].message).to.have.nested.property('source_location.lineno', expectedLineno)
      })
    })

    it('should report correct line number in warning when no resources found', () => {
      const expectedLineno = 3
      const input = heredoc`
      before

      import::code:hello[]

      after
      `
      withMemoryLogger((logger) => {
        run(input)
        const messages = logger.getMessages()
        expect(messages).to.have.lengthOf(1)
        expect(messages[0].severity).to.equal('WARN')
        expect(messages[0].message).to.have.nested.property('source_location.lineno', expectedLineno)
      })
    })

    it('should use ID of parent section as base path for resource', () => {
      const expectedSource = heredoc`
      fun main(args : Array<String>) {
        println("Hello, World!")
      }
      `
      addExample('kotlin/org/spring/sampleproject/hello.kt', expectedSource)
      const input = heredoc`
      = Page Title

      [[org.spring.sample-project]]
      == Section Title

      import::code:hello[]
      `
      const actual = run(input)
      expect(actual.findBy({ context: 'listing' })).to.have.lengthOf(1)
      expect(actual.findBy({ context: 'listing' })[0].getSource()).to.equal(expectedSource)
    })

    it('should not require target to be prefixed with code:', () => {
      const expectedSource = heredoc`
      fun main(args : Array<String>) {
        println("Hello, World!")
      }
      `
      addExample('kotlin/hello.kt', expectedSource)
      const input = 'import::hello[]'
      const actual = run(input)
      expect(actual.getBlocks()).to.have.lengthOf(1)
      expect(actual.getBlocks()[0].getSource()).to.equal(expectedSource)
    })
  })
})
