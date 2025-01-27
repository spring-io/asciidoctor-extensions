/* eslint-env mocha */
'use strict'

const Asciidoctor = require('@asciidoctor/core')()
const { configureLogger } = require('@antora/logger')
const loadAsciiDoc = require('@antora/asciidoc-loader')
const { expect, heredoc } = require('./harness')
const { name: packageName } = require('#package')

describe('include-code-extension', () => {
  const ext = require(packageName + '/include-code-extension')

  const defaultFile = {
    src: {
      component: 'spring-security',
      version: '6.0.0',
      module: 'ROOT',
      family: 'page',
      relative: 'index.adoc',
      path: 'index.adoc',
    },
    pub: { moduleRootPath: '' },
  }

  let contentCatalog
  let messages

  const addExample = (relative, contents) => {
    contents = Buffer.from(contents)
    const example = { contents, src: { ...defaultFile.src, family: 'example', relative, path: relative } }
    contentCatalog.files.push(example)
    return example
  }

  const createContentCatalog = () => ({
    files: [],
    getById ({ component, version, module, family, relative }) {
      return this.files.find(
        ({ src: candidate }) =>
          candidate.relative === relative &&
          candidate.family === family &&
          candidate.component === component &&
          candidate.version === version &&
          candidate.module === module
      )
    },
    getComponent: () => undefined,
    resolveResource (ref, context, defaultFamily, permittedFamilies) {
      const [family, relative] = ref.split('$')
      if (permittedFamilies && !permittedFamilies.includes(family)) return
      return this.getById(Object.assign({}, context, { family, relative }))
    },
  })

  const run = (input = [], opts = {}, file = defaultFile) => {
    opts.attributes ??= {
      'include-java@': 'example$java',
      'include-kotlin@': 'example$kotlin',
      'include-groovy@': 'example$groovy',
      'include-xml@': 'example$xml',
    }
    opts.extensions = [ext]
    if (opts.registerAsciidoctorTabs) {
      opts.extensions.push(require('@asciidoctor/tabs'))
      delete opts.registerAsciidoctorTabs
    }
    const inputFile = { ...file, contents: Buffer.from(input) }
    return loadAsciiDoc(inputFile, contentCatalog, opts)
  }

  const relativeFile = (relative) => {
    return {
      ...defaultFile,
      src: {
        ...defaultFile.src,
        relative,
      },
    }
  }

  beforeEach(() => {
    contentCatalog = createContentCatalog()
    messages = []
    configureLogger({ destination: { write: (messageString) => messages.push(messageString) } })
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
      expect(extensions.getBlockMacros()[0].instance.name).to.equal('include-code')
    })
  })

  describe('include code', () => {
    it('should warn if include-code block macro is found but no include-<lang> attributes are defined', () => {
      const expectedMessage = 'no search locations defined for include-code::hello[]'
      const expectedLineno = 1
      const input = 'include-code::hello[]'
      run(input, { attributes: {} })
      expect(messages).to.have.lengthOf(1)
      const message = JSON.parse(messages[0])
      expect(message.level).to.equal('warn')
      expect(message.msg).to.equal(expectedMessage)
      expect(message).to.have.nested.property('file.line', expectedLineno)
    })

    it('should include single code snippet if only one include-<lang> attribute is set', () => {
      const expectedSource = heredoc`
      fun main(args : Array<String>) {
        println("Hello, World!")
      }
      `
      const expectedAttrs = { style: 'source', language: 'kotlin' }
      addExample('kotlin/hello.kt', expectedSource)
      const input = 'include-code::hello[]'
      const actual = run(input, { attributes: { 'include-kotlin': 'example$kotlin' } })
      expect(actual.getBlocks()).to.have.lengthOf(1)
      expect(actual.getBlocks()[0].getSource()).to.equal(expectedSource)
      expect(actual.getBlocks()[0].getAttributes()).to.include(expectedAttrs)
    })

    it('should include single code snippet if all include-<lang> attributes are set but only one resource is found', () => {
      const expectedSource = heredoc`
      fun main(args : Array<String>) {
        println("Hello, World!")
      }
      `
      const expectedAttrs = { style: 'source', language: 'kotlin' }
      addExample('kotlin/hello.kt', expectedSource)
      const input = 'include-code::hello[]'
      const actual = run(input)
      expect(actual.getBlocks()).to.have.lengthOf(1)
      expect(actual.getBlocks()[0].getSource()).to.equal(expectedSource)
      expect(actual.getBlocks()[0].getAttributes()).to.include(expectedAttrs)
    })

    it('should include multiple code snippets if all include-<lang> attributes are set and multiple resources are found', () => {
      const expected = [
        { style: 'source', language: 'java', title: 'Java' },
        { style: 'source', language: 'kotlin', title: 'Kotlin' },
        { style: 'source', language: 'groovy', title: 'Groovy' },
        { style: 'source', language: 'xml', title: 'Xml' },
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
      addExample('xml/hello.xml', 'println "<hello />"')
      const input = 'include-code::hello[]'
      const actual = run(input).findBy({ context: 'listing' })
      expect(actual).to.have.lengthOf(4)
      const actualProperties = actual.map((block) => {
        return { style: block.getStyle(), language: block.getAttributes().language, title: block.getTitle() }
      })
      expect(actualProperties).to.eql(expected)
    })

    it('should support title attribute on block macro with single include', () => {
      const inputSource = heredoc`
      fun main(args : Array<String>) {
        println("Hello, World!")
      }
      `
      addExample('kotlin/hello.kt', inputSource)
      const input = heredoc`
      .Describe This
      include-code::hello[]
      `
      const actual = run(input, { attributes: { 'include-kotlin': 'example$kotlin' } })
      expect(actual.getBlocks()).to.have.lengthOf(1)
      expect(actual.getBlocks()[0].getTitle()).to.equal('Describe This')
    })

    it('should pass attribute on block macro for single include through to resulting source block', () => {
      const inputSource = heredoc`
      package org.example

      fun main(args : Array<String>) {
        println("Hello, World!")
      }
      `
      addExample('kotlin/hello.kt', inputSource)
      const input = heredoc`
      [some-attribute=alpha]
      include-code::hello[]
      `
      const actual = run(input, { attributes: { 'include-kotlin': 'example$kotlin' } })
      expect(actual.getBlocks()).to.have.lengthOf(1)
      expect(actual.getBlocks()[0].getAttribute('some-attribute')).to.equal('alpha')
    })

    it('should report correct line number in warning for block title', () => {
      const inputSource = heredoc`
      fun main(args : Array<String>) {
        println("Hello, World!")
      }
      `
      addExample('kotlin/hello.kt', inputSource)
      const input = heredoc`
      before

      .xref:no-such-file.adoc[]
      include-code::hello[]

      after
      `
      const actual = run(input, { attributes: { 'include-kotlin': 'example$kotlin' }, sourcemap: true })
      expect(actual.getBlocks()[1].getTitle()).to.include('unresolved')
      expect(messages).to.have.lengthOf(1)
      const message = JSON.parse(messages[0])
      expect(message.msg).to.equal('target of xref not found: no-such-file.adoc')
      expect(message.file.line).to.equal(4)
    })

    it('should support title attribute on block macro with multiple includes', () => {
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
      const input = heredoc`
      .Describe This
      include-code::hello[]
      `
      const actual = run(input)
      expect(actual.getBlocks()).to.have.lengthOf(2)
      expect(actual.getBlocks()[0].getTitle()).to.equal('Describe This - Java')
      expect(actual.getBlocks()[1].getTitle()).to.equal('Describe This - Kotlin')
    })

    it('should pass attribute on block macro for multiple includes through to resulting source block', () => {
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
      const input = heredoc`
      [some-attribute=alpha]
      include-code::hello[]
      `
      const actual = run(input)
      expect(actual.getBlocks()).to.have.lengthOf(2)
      expect(actual.getBlocks()[0].getAttribute('some-attribute')).to.equal('alpha')
      expect(actual.getBlocks()[1].getAttribute('some-attribute')).to.equal('alpha')
    })

    it('should support attributes on include directive of included file', () => {
      const inputSource = heredoc`
      fun main(args : Array<String>) {
        // tag::print[]
        println("Hello, World!")
        // end::print[]
      }
      `
      const expectedSource = 'println("Hello, World!")'
      const expectedAttrs = { style: 'source', language: 'kotlin' }
      addExample('kotlin/hello.kt', inputSource)
      const input = 'include-code::hello[tag=print,indent=0]'
      const actual = run(input, { attributes: { 'include-kotlin': 'example$kotlin' } })
      expect(actual.getBlocks()).to.have.lengthOf(1)
      expect(actual.getBlocks()[0].getSource()).to.equal(expectedSource)
      expect(actual.getBlocks()[0].getAttributes()).to.include(expectedAttrs)
    })

    it('should support sync-group-id', () => {
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
      const input = heredoc`
      = Test
      :tabs-sync-option:

      include-code::hello[sync-group-id=thisisauniqueid]
      `
      const actual = run(input, { registerAsciidoctorTabs: true })
      expect(actual.convert()).to.contain(
        'class="openblock tabs is-sync data-sync-group-id=thisisauniqueid is-loading"'
      )
    })

    it('should support sync-group-id not defined', () => {
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
      const input = heredoc`
      = Test
      :tabs-sync-option:

      include-code::hello[]
      `
      const actual = run(input, { registerAsciidoctorTabs: true })
      expect(actual.convert()).to.contain('class="openblock tabs is-sync is-loading"')
    })

    it('should report line number of block macro when include tag not found', () => {
      const inputSource = heredoc`
      fun main(args : Array<String>) {
        // tag::print[]
        println("Hello, World!")
        // end::print[]
      }
      `
      const expectedSource = ''
      const expectedMessage = "tag 'no-such-tag' not found in include file"
      const expectedAttrs = { style: 'source', language: 'kotlin' }
      addExample('kotlin/hello.kt', inputSource)
      const input = heredoc`
      before

      include-code::hello[tag=no-such-tag,indent=0]

      after
      `
      const actual = run(input, { attributes: { 'include-kotlin': 'example$kotlin' } })
      expect(actual.getBlocks()).to.have.lengthOf(3)
      expect(actual.getBlocks()[1].getSource()).to.equal(expectedSource)
      expect(actual.getBlocks()[1].getAttributes()).to.include(expectedAttrs)
      expect(messages).to.have.lengthOf(1)
      const message = JSON.parse(messages[0])
      expect(message.level).to.equal('warn')
      expect(message.msg).to.equal(expectedMessage)
      expect(message).to.have.nested.property('file.path', 'kotlin/hello.kt')
      expect(message).to.have.nested.property('stack[0].file.path', 'index.adoc')
      expect(message).to.have.nested.property('stack[0].file.line', 3)
    })

    it('should wrap multiple sibling code snippets in tabs block if @asciidoctor/tabs extension is registered', () => {
      const expected = [
        { style: 'source', language: 'java', title: undefined },
        { style: 'source', language: 'kotlin', title: undefined },
        { style: 'source', language: 'groovy', title: undefined },
        { style: 'source', language: 'xml', title: undefined },
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
      addExample('xml/hello.xml', 'println "<hello />"')
      const input = 'include-code::hello[]'
      const doc = run(input, { registerAsciidoctorTabs: true })
      const tabs = doc.getBlocks()[0]
      expect(tabs).to.exist()
      expect(tabs.hasRole('tabs')).to.be.true()
      expect(tabs.getTitle()).to.be.undefined()
      const tablist = tabs.findBy({ context: 'ulist' })[0]
      expect(tablist).to.exist()
      expect(tablist.getItems()).to.have.lengthOf(4)
      const codeBlocks = tabs.findBy({ context: 'listing' })
      expect(codeBlocks).to.have.lengthOf(4)
      const actualProperties = codeBlocks.map((block) => {
        return { style: block.getStyle(), language: block.getAttributes().language, title: block.getTitle() }
      })
      expect(actualProperties).to.eql(expected)
    })

    it('should pass attribute on block macro to each tabbed block if @asciidoctor/tabs extension is registered', () => {
      const expected = [
        { style: 'source', language: 'java', title: undefined, someAttribute: 'alpha' },
        { style: 'source', language: 'kotlin', title: undefined, someAttribute: 'alpha' },
        { style: 'source', language: 'groovy', title: undefined, someAttribute: 'alpha' },
        { style: 'source', language: 'xml', title: undefined, someAttribute: 'alpha' },
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
      addExample('xml/hello.xml', 'println "<hello />"')
      const input = heredoc`
      [some-attribute=alpha]
      include-code::hello[]`
      const doc = run(input, { registerAsciidoctorTabs: true })
      const tabs = doc.getBlocks()[0]
      console.log(tabs)
      expect(tabs).to.exist()
      expect(tabs.hasRole('tabs')).to.be.true()
      expect(tabs.getTitle()).to.be.undefined()
      const tablist = tabs.findBy({ context: 'ulist' })[0]
      expect(tablist).to.exist()
      expect(tablist.getItems()).to.have.lengthOf(4)
      const codeBlocks = tabs.findBy({ context: 'listing' })
      expect(codeBlocks).to.have.lengthOf(4)
      const actualProperties = codeBlocks.map((block) => {
        return { style: block.getStyle(), language: block.getAttributes().language, title: block.getTitle(), someAttribute: block.getAttribute('some-attribute') }
      })
      console.log(actualProperties)
      expect(actualProperties).to.eql(expected)
    })

    it('should apply title to tabs when @asciidoctor/tabs extension is registered', () => {
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
      const input = heredoc`
      .Tabs Title
      include-code::hello[]
      `
      const doc = run(input, { registerAsciidoctorTabs: true })
      const tabs = doc.getBlocks()[0]
      expect(tabs).to.exist()
      expect(tabs.getTitle()).to.equal('Tabs Title')
      const codeBlocks = tabs.findBy({ context: 'listing' })
      expect(codeBlocks).to.have.lengthOf(2)
      for (const block of codeBlocks) {
        expect(block.getTitle()).to.be.undefined()
      }
    })

    it('should not include code if include-<lang> is defined, even if file is present', () => {
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
      const input = heredoc`
      :!include-java:

      include-code::hello[]
      `
      const actual = run(input)
      expect(actual.getBlocks()).to.have.lengthOf(1)
      expect(actual.getBlocks()[0].getAttributes().language).to.equal('kotlin')
    })

    it('should not include code for Kotlin file with .kotlin extension', () => {
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
      addExample(
        'kotlin/hello.kotlin',
        heredoc`
        fun main(args : Array<String>) {
         println("Hello, World!")
        }
        `
      )
      const input = 'include-code::hello[]'
      const actual = run(input)
      expect(actual.getBlocks()).to.have.lengthOf(1)
      expect(actual.getBlocks()[0].getAttributes().language).to.equal('java')
    })

    it('should not include code for unsupported language, even if include-<lang> is defined', () => {
      addExample('ruby/hello.rb', 'puts "Hello, World!"')
      addExample(
        'kotlin/hello.kt',
        heredoc`
        fun main(args : Array<String>) {
         println("Hello, World!")
        }
        `
      )
      const input = 'include-code::hello[]'
      const actual = run(input, { attributes: { 'include-kotlin': 'example$kotlin', 'include-ruby': 'example$ruby' } })
      expect(actual.getBlocks()).to.have.lengthOf(1)
      expect(actual.getBlocks()[0].getAttributes().language).to.equal('kotlin')
    })

    it('should warn if at least one include-<lang> attribute is set but no resources are found', () => {
      const expectedMessage = 'no code includes found for hello'
      const expectedLineno = 1
      const input = 'include-code::hello[]'
      const actual = run(input)
      expect(actual.getBlocks()).to.be.empty()
      expect(messages).to.have.lengthOf(1)
      const message = JSON.parse(messages[0])
      expect(message.level).to.equal('warn')
      expect(message.msg).to.equal(expectedMessage)
      expect(message).to.have.nested.property('file.line', expectedLineno)
    })

    it('should report correct line number in warning when no resources found', () => {
      const expectedLineno = 3
      const input = heredoc`
      before

      include-code::hello[]

      after
      `
      run(input)
      expect(messages).to.have.lengthOf(1)
      const message = JSON.parse(messages[0])
      expect(message.level).to.equal('warn')
      expect(message).to.have.nested.property('file.line', expectedLineno)
    })

    it('should use ID of parent section as intermediary path for resource', () => {
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

      include-code::hello[]
      `
      const actual = run(input)
      expect(actual.findBy({ context: 'listing' })).to.have.lengthOf(1)
      expect(actual.findBy({ context: 'listing' })[0].getSource()).to.equal(expectedSource)
    })

    it('should use ID of document as intermediary path for resource outside of section', () => {
      const expectedSource = heredoc`
      fun main(args : Array<String>) {
        println("Hello, World!")
      }
      `
      addExample('kotlin/org/spring/sampleproject/hello.kt', expectedSource)
      const input = heredoc`
      [[org.spring.sample-project]]
      = Page Title

      include-code::hello[]
      `
      const actual = run(input)
      expect(actual.findBy({ context: 'listing' })).to.have.lengthOf(1)
      expect(actual.findBy({ context: 'listing' })[0].getSource()).to.equal(expectedSource)
    })

    it('should use ID of document as intermediary path for resource outside of section and path when enabled', () => {
      const expectedSource = heredoc`
      fun main(args : Array<String>) {
        println("Hello, World!")
      }
      `
      addExample('kotlin/org/spring/sampleproject/hello.kt', expectedSource)
      const input = heredoc`
      [[sample-project]]
      = Page Title

      include-code::./hello[]
      `
      const actual = run(
        input,
        {
          attributes: { 'include-kotlin': 'example$kotlin' },
        },
        relativeFile('org/spring/index.adoc')
      )
      expect(actual.findBy({ context: 'listing' })).to.have.lengthOf(1)
      expect(actual.findBy({ context: 'listing' })[0].getSource()).to.equal(expectedSource)
    })

    it('should use ID of document as intermediary path and escaped file path when enabled for resource outside of section', () => {
      const expectedSource = heredoc`
      fun main(args : Array<String>) {
        println("Hello, World!")
      }
      `
      addExample('kotlin/org/springmvc/sampleproject/hello.kt', expectedSource)
      const input = heredoc`
      [[sample-project]]
      = Page Title

      include-code::./hello[]
      `
      const actual = run(
        input,
        {
          attributes: { 'include-kotlin': 'example$kotlin' },
        },
        relativeFile('org/spring-mvc/index.adoc')
      )
      expect(actual.findBy({ context: 'listing' })).to.have.lengthOf(1)
      expect(actual.findBy({ context: 'listing' })[0].getSource()).to.equal(expectedSource)
    })

    it('should handle relative path with no directory', () => {
      const expectedSource = heredoc`
      fun main(args : Array<String>) {
        println("Hello, World!")
      }
      `
      addExample('kotlin/sampleproject/hello.kt', expectedSource)
      const input = heredoc`
      [[sample-project]]
      = Page Title

      include-code::./hello[]
      `
      // default relative is index.adoc (no path) so no need to override
      const actual = run(input, {
        attributes: { 'include-kotlin': 'example$kotlin' },
      })
      expect(actual.findBy({ context: 'listing' })).to.have.lengthOf(1)
      expect(actual.findBy({ context: 'listing' })[0].getSource()).to.equal(expectedSource)
    })

    it('should use ID of document as intermediary path for resource outside of section and not path when not enabled', () => {
      const expectedSource = heredoc`
      fun main(args : Array<String>) {
        println("Hello, World!")
      }
      `
      addExample('kotlin/org/spring/sampleproject/hello.kt', expectedSource)
      const input = heredoc`
      [[org.spring.sample-project]]
      = Page Title

      include-code::hello[]
      `
      const actual = run(
        input,
        {
          attributes: { 'include-kotlin': 'example$kotlin' },
        },
        relativeFile('org/spring/index.adoc')
      )
      expect(actual.findBy({ context: 'listing' })).to.have.lengthOf(1)
      expect(actual.findBy({ context: 'listing' })[0].getSource()).to.equal(expectedSource)
    })

    it('should not use intermediary path for resource outside of section when document has no ID', () => {
      const expectedSource = heredoc`
      fun main(args : Array<String>) {
        println("Hello, World!")
      }
      `
      addExample('kotlin/hello.kt', expectedSource)
      const input = heredoc`
      = Page Title

      include-code::hello[]
      `
      const actual = run(input)
      expect(actual.findBy({ context: 'listing' })).to.have.lengthOf(1)
      expect(actual.findBy({ context: 'listing' })[0].getSource()).to.equal(expectedSource)
    })

    it('should preserve letter case in target', () => {
      const expectedSource = heredoc`
      fun main(args : Array<String>) {
        println("Hello, World!")
      }
      `
      addExample('kotlin/HelloWorld.kt', expectedSource)
      const input = 'include-code::HelloWorld[]'
      const actual = run(input)
      expect(actual.getBlocks()).to.have.lengthOf(1)
      expect(actual.getBlocks()[0].getSource()).to.equal(expectedSource)
    })
  })
})
