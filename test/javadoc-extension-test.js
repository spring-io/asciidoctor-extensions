/* eslint-env mocha */
'use strict'

const Asciidoctor = require('@asciidoctor/core')()
const AntoraLoader = require('@antora/asciidoc-loader')
const { expect, heredoc } = require('./harness')
const { name: packageName } = require('#package')

describe('javadoc-extension', () => {
  const ext = require(packageName + '/javadoc-extension')

  let config
  let contentCatalog
  let file

  const addFile = ({ component = 'acme', version = '2.0', module = 'ROOT', family = 'page', relative }, contents) => {
    contents = Buffer.from(contents)
    const entry = {
      contents,
      src: { component, version, module, family, relative, path: relative },
      pub: { moduleRootPath: '' },
    }
    contentCatalog.files.push(entry)
    return entry
  }

  const createContentCatalog = () => ({
    files: [],
    findBy (criteria) {
      const criteriaEntries = Object.entries(criteria)
      const accum = []
      for (const candidate of this.files) {
        const candidateSrc = candidate.src
        if (criteriaEntries.every(([key, val]) => candidateSrc[key] === val)) accum.push(candidate)
      }
      return accum
    },
    getComponent () {},
    resolveResource (resource) {
      resource = resource.replaceAll('attachment$', '_attachments/').replaceAll('api:', 'api/')
      return { pub: { url: 'https://docs.example.com/' + resource } }
    },
  })

  const run = (input = [], opts = {}, convert = true) => {
    file.contents = Buffer.from(Array.isArray(input) ? input.join('\n') : input)
    const context = { config, contentCatalog, file }
    opts.extension_registry = ext.register(opts.extension_registry || Asciidoctor.Extensions.create(), context)
    opts.sourcemap = true
    const document = AntoraLoader.loadAsciiDoc(file, contentCatalog, { extensions: [ext] })
    return !convert ? document : log(document.convert())
  }

  function log (data) {
    console.log(data)
    return data
  }

  beforeEach(() => {
    config = {}
    contentCatalog = createContentCatalog()
    file = addFile({ relative: 'index.adoc' }, '= Index Page')
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
      const extensions = run([], {}, false).getExtensions()
      expect(extensions.getInlineMacros()).to.have.lengthOf(1)
    })
  })

  describe('javadoc macro', () => {
    it('should convert using sensible defaults', () => {
      const input = heredoc`
        = Page Title

        javadoc:com.example.MyClass[]
        `
      const actual = run(input)
      expect(actual).to.include(
        '<a href="https://docs.example.com/_attachments/api/java/com/example/MyClass.html" class="xref page apiref"><code>MyClass</code></a>'
      )
    })

    it('should convert with specified location when has javadoc-location attribute', () => {
      const input = heredoc`
        = Page Title
        :javadoc-location: xref:api:java

        javadoc:com.example.MyClass[]
        `
      const actual = run(input)
      expect(actual).to.include(
        '<a href="https://docs.example.com/api/java/com/example/MyClass.html" class="xref page apiref"><code>MyClass</code></a>'
      )
    })

    it('should convert with specified location when has javadoc-location attribute with slash', () => {
      const input = heredoc`
        = Page Title
        :javadoc-location: xref:api:java/

        javadoc:com.example.MyClass[]
        `
      const actual = run(input)
      expect(actual).to.include(
        '<a href="https://docs.example.com/api/java/com/example/MyClass.html" class="xref page apiref"><code>MyClass</code></a>'
      )
    })

    it('should convert with specified location when has package specific javadoc-location attributes', () => {
      const input = heredoc`
        = Page Title
        :javadoc-location: xref:api:java
        :javadoc-location-com-example: xref:api:e
        :javadoc-location-com-example-one: xref:api:e1
        :javadoc-location-com-example-one-two: xref:api:e12

        javadoc:org.example.MyClass1[]
        javadoc:com.example.one.two.three.MyClass2[]
        javadoc:com.example.one.three.three.MyClass3[]
        javadoc:com.example.test.MyClass4[]
        `
      const actual = run(input)
      expect(actual).to.include(
        '<a href="https://docs.example.com/api/java/org/example/MyClass1.html" class="xref page apiref"><code>MyClass1</code></a>'
      )
      expect(actual).to.include(
        '<a href="https://docs.example.com/api/e12/com/example/one/two/three/MyClass2.html" class="xref page apiref"><code>MyClass2</code></a>'
      )
      expect(actual).to.include(
        '<a href="https://docs.example.com/api/e1/com/example/one/three/three/MyClass3.html" class="xref page apiref"><code>MyClass3</code></a>'
      )
      expect(actual).to.include(
        '<a href="https://docs.example.com/api/e/com/example/test/MyClass4.html" class="xref page apiref"><code>MyClass4</code></a>'
      )
    })

    it('should convert with specified location when has xref location in macro', () => {
      const input = heredoc`
        = Page Title

        javadoc:xref:api:java/com.example.MyClass[]
        `
      const actual = run(input)
      expect(actual).to.include(
        '<a href="https://docs.example.com/api/java/com/example/MyClass.html" class="xref page apiref"><code>MyClass</code></a>'
      )
    })

    it('should convert with specified location when has http location in macro', () => {
      const input = heredoc`
        = Page Title

        javadoc:https://javadoc.example.com/latest/com.example.MyClass[]
        `
      const actual = run(input)
      expect(actual).to.include(
        '<a href="https://javadoc.example.com/latest/com/example/MyClass.html" class="apiref"><code>MyClass</code></a>'
      )
    })

    it('should convert with specified format when has format full', () => {
      const input = heredoc`
        = Page Title

        javadoc:com.example.MyClass[format=full]
        `
      const actual = run(input)
      expect(actual).to.include(
        '<a href="https://docs.example.com/_attachments/api/java/com/example/MyClass.html" class="xref page apiref"><code>com.example.MyClass</code></a>'
      )
    })

    it('should convert with specified format when has format annotation', () => {
      const input = heredoc`
        = Page Title

        javadoc:com.example.MyAnnotation[format=annotation]
        `
      const actual = run(input)
      expect(actual).to.include(
        '<a href="https://docs.example.com/_attachments/api/java/com/example/MyAnnotation.html" class="xref page apiref"><code>@MyAnnotation</code></a>'
      )
    })

    it('should convert with specified format when has format short', () => {
      const input = heredoc`
        = Page Title

        javadoc:com.example.MyClass[format=short]
        `
      const actual = run(input)
      expect(actual).to.include(
        '<a href="https://docs.example.com/_attachments/api/java/com/example/MyClass.html" class="xref page apiref"><code>MyClass</code></a>'
      )
    })

    it('should convert with specified format when has format as document attribute', () => {
      const input = heredoc`
        = Page Title
        :javadoc-format: full

        javadoc:com.example.MyClass[]
        `
      const actual = run(input)
      expect(actual).to.include(
        '<a href="https://docs.example.com/_attachments/api/java/com/example/MyClass.html" class="xref page apiref"><code>com.example.MyClass</code></a>'
      )
    })

    it('should convert with specified text when has link text', () => {
      const input = heredoc`
      = Page Title

      javadoc:com.example.MyClass$Builder[\`Builder\`]
      `
      const actual = run(input)
      expect(actual).to.include(
        '<a href="https://docs.example.com/_attachments/api/java/com/example/MyClass.Builder.html" class="xref page apiref"><code>Builder</code></a>'
      )
    })

    it('should convert with specified text when has inner class', () => {
      const input = heredoc`
      = Page Title

      javadoc:com.example.MyClass$Builder[]
      `
      const actual = run(input)
      expect(actual).to.include(
        '<a href="https://docs.example.com/_attachments/api/java/com/example/MyClass.Builder.html" class="xref page apiref"><code>MyClass.Builder</code></a>'
      )
    })

    it('should convert with method reference', () => {
      const input = heredoc`
      = Page Title

      javadoc:com.example.MyClass#run(java.lang.Class,java.lang.String)[]
      `
      const actual = run(input)
      expect(actual).to.include(
        '<a href="https://docs.example.com/_attachments/api/java/com/example/MyClass.html#run(java.lang.Class,java.lang.String)" class="xref page apiref"><code>MyClass.run(Class, String)</code></a>'
      )
    })

    it('should convert with varargs method reference', () => {
      const input = heredoc`
      = Page Title

      javadoc:com.example.MyClass#run(java.lang.Class,java.lang.String...)[]
      `
      const actual = run(input)
      expect(actual).to.include(
        '<a href="https://docs.example.com/_attachments/api/java/com/example/MyClass.html#run(java.lang.Class,java.lang.String&#8230;&#8203;)" class="xref page apiref"><code>MyClass.run(Class, String&#8230;&#8203;)</code></a>'
      )
    })

    it('should convert with const reference', () => {
      const input = heredoc`
      = Page Title

      javadoc:com.example.MyClass#MY_CONST[]
      `
      const actual = run(input)
      expect(actual).to.include(
        '<a href="https://docs.example.com/_attachments/api/java/com/example/MyClass.html#MY_CONST" class="xref page apiref"><code>MyClass.MY_CONST</code></a>'
      )
    })

    it('should convert with annotation reference', () => {
      const input = heredoc`
      = Page Title

      javadoc:com.example.MyAnnotation#format()[format=annotation]
      `
      const actual = run(input)
      expect(actual).to.include(
        '<a href="https://docs.example.com/_attachments/api/java/com/example/MyAnnotation.html#format()" class="xref page apiref"><code>@MyAnnotation.format</code></a>'
      )
    })

    it('should convert with own formatted text', () => {
      const input = heredoc`
      = Page Title

      javadoc:com.example.MyClass[Take a _look_ at \`MyClass\` for *details*]
      `
      const actual = run(input)
      expect(actual).to.include(
        '<a href="https://docs.example.com/_attachments/api/java/com/example/MyClass.html" class="xref page apiref">Take a <em>look</em> at <code>MyClass</code> for <strong>details</strong></a>'
      )
    })
  })
})
