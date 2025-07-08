/* eslint-env mocha */
'use strict'

const Asciidoctor = require('@asciidoctor/core')()
const { expect, heredoc } = require('./harness')
const { name: packageName } = require('#package')

describe('configuration-properties-extension', () => {
  const ext = require(packageName + '/configuration-properties-extension')

  let config
  let contentCatalog
  let file
  let oldLogger
  let messages

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

  const addConfigurationMetadataFixture = (property = {}, ...rest) => {
    const { name = 'foo.bar.baz', type = 'java.lang.String', deprecation } = property
    const data = { properties: [{ name, type: type ?? undefined, deprecation }] }
    if (rest.length) {
      rest.forEach((it) =>
        data.properties.push({ name: it.name, type: it.type || 'java.lang.String', deprecation: it.deprecation })
      )
    }
    addFile({ family: 'partial', relative: 'acme-core/spring-configuration-metadata.json' }, JSON.stringify(data))
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
  })

  const run = (input = [], opts = {}) => {
    file.contents = Buffer.from(Array.isArray(input) ? input.join('\n') : input)
    const context = { config, contentCatalog, file }
    opts.extension_registry = ext.register(opts.extension_registry || Asciidoctor.Extensions.create(), context)
    opts.sourcemap = true
    try {
      if (opts.convert) {
        delete opts.convert
        return Asciidoctor.convert(input, opts)
      }
      return Asciidoctor.load(input, opts)
    } finally {
      messages = Asciidoctor.LoggerManager.logger.getMessages()
    }
  }

  beforeEach(() => {
    config = {}
    contentCatalog = createContentCatalog()
    file = addFile({ relative: 'index.adoc' }, '= Index Page')
    oldLogger = Asciidoctor.LoggerManager.logger
    Asciidoctor.LoggerManager.logger = Asciidoctor.MemoryLogger.create()
  })

  afterEach(() => {
    Asciidoctor.LoggerManager.logger = oldLogger
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
      expect(extensions.getBlocks()).to.have.lengthOf(1)
      expect(extensions.getInlineMacros()).to.have.lengthOf(1)
    })
  })

  describe('getConfigurationProperties', () => {
    it('should load configuration properties from configuration metadata file in content catalog', () => {
      addConfigurationMetadataFixture()
      const input = heredoc`
      = Page Title

      configprop:foo.bar.baz[]
      `
      run(input, { convert: true })
      expect(messages).to.be.empty()
      expect(config).to.have.nested.property('data.springConfigurationProperties')
      expect(config.data.springConfigurationProperties).to.have.property('2.0@acme')
    })

    it('should load configuration properties from all configuration metadata files in content catalog', () => {
      addConfigurationMetadataFixture()
      addFile(
        { family: 'partial', relative: 'acme-boot/spring-configuration-metadata.json' },
        JSON.stringify({
          properties: [{ name: 'yin.yang', type: 'java.lang.String' }],
        })
      )
      addFile({ family: 'partial', relative: 'deprecation-notice.doc' }, 'Text of deprecated notice')
      const input = heredoc`
      = Page Title

      configprop:yin.yang[]
      `
      run(input, { convert: true })
      expect(messages).to.be.empty()
      expect(config).to.have.nested.property('data.springConfigurationProperties')
      expect(Object.keys(config.data.springConfigurationProperties['2.0@acme'])).to.have.lengthOf(2)
    })

    it('should load cached configuration properties from config when extension is used multiple times on one page', () => {
      addConfigurationMetadataFixture(undefined, { name: 'debug', type: 'java.lang.Boolean' })
      const input = heredoc`
      = Page Title

      configprop:foo.bar.baz[]

      configprop:debug[]
      `
      run(input, { convert: true })
      expect(messages).to.be.empty()
      expect(config).to.have.nested.property('data.springConfigurationProperties')
      expect(Object.keys(config.data.springConfigurationProperties)).to.have.lengthOf(1)
    })

    it('should load cached configuration properties from config when extension is used on different pages', () => {
      let scopeHit, propertyHit
      const springConfigurationProperties = Object.defineProperty({}, '2.0@acme', {
        enumerable: true,
        get: () => {
          scopeHit = true
          return Object.defineProperty({}, 'foo.bar.baz', {
            enumerable: true,
            get: () => {
              propertyHit = true
              return { deprecated: false, env: 'FOO_BAR_BAZ', map: false }
            },
          })
        },
      })
      config = { data: { springConfigurationProperties } }
      const input = heredoc`
      = Page Title

      configprop:foo.bar.baz[]
      `
      run(input, { convert: true })
      expect(messages).to.be.empty()
      expect(scopeHit).to.be.true()
      expect(propertyHit).to.be.true()
    })

    it('should load configuration properties from content catalog for page in different component version', () => {
      let scopeHit, propertyHit
      const springConfigurationProperties = Object.defineProperty({}, '2.0@acme', {
        enumerable: true,
        get: () => {
          scopeHit = true
          return Object.defineProperty({}, 'foo.bar.baz', {
            enumerable: true,
            get: () => {
              propertyHit = true
              return { deprecated: false, env: 'FOO_BAR_BAZ', map: false }
            },
          })
        },
      })
      config = { data: { springConfigurationProperties } }
      addFile(
        { version: '1.0', family: 'partial', relative: 'acme-core/spring-configuration-metadata.json' },
        JSON.stringify({
          properties: [{ name: 'foo.bar.baz', type: 'java.lang.String' }],
        })
      )
      const input = heredoc`
      = Page Title

      configprop:foo.bar.baz[]
      `
      file.src.version = '1.0'
      run(input, { convert: true })
      expect(messages).to.be.empty()
      expect(scopeHit).to.be.undefined()
      expect(propertyHit).to.be.undefined()
      expect(config.data.springConfigurationProperties).to.have.property('1.0@acme')
    })
  })

  describe('configprop macro', () => {
    it('should convert valid property to monospaced phrase without warning', () => {
      addConfigurationMetadataFixture()
      const input = heredoc`
      = Page Title

      configprop:foo.bar.baz[]
      `
      const actual = run(input, { convert: true })
      expect(actual).to.include('<code>foo.bar.baz</code>')
      expect(messages).to.be.empty()
    })

    it('should convert valid property to monospaced phrase without warning when has map ancestor', () => {
      addConfigurationMetadataFixture({ name: 'management.observations.enable', type: 'java.util.Map<String, String>' })
      const input = heredoc`
      = Page Title

      configprop:management.observations.enable.my.key[]
      `
      const actual = run(input, { convert: true })
      expect(actual).to.include('<code>management.observations.enable.my.key</code>')
      expect(messages).to.be.empty()
    })

    it('should convert valid property as env var to monospaced phrase if format=envvar is set', () => {
      addConfigurationMetadataFixture({ name: 'foo.bar.baz-name' })
      const input = heredoc`
      = Page Title

      configprop:foo.bar.baz-name[format=envvar]
      `
      const actual = run(input, { convert: true })
      expect(actual).to.include('<code>FOO_BAR_BAZNAME</code>')
      expect(messages).to.be.empty()
    })

    it('should convert invalid property and log warning', () => {
      addConfigurationMetadataFixture()
      const input = heredoc`
      = Page Title

      configprop:no.such.property[]
      `
      const actual = run(input, { convert: true })
      expect(actual).to.include('<code>no.such.property</code>')
      expect(messages).to.have.lengthOf(1)
      const message = messages[0]
      expect(message.severity).to.equal('WARN')
      expect(message.message.text).to.equal('configuration property not found: no.such.property')
    })

    it('should include source location in warning message', () => {
      const input = heredoc`
      = Page Title

      configprop:no.such.property[]
      `
      const actual = run(input, { convert: true })
      expect(actual).to.include('<code>no.such.property</code>')
      expect(messages).to.have.lengthOf(1)
      const message = messages[0]
      expect(message.message.source_location.getLineNumber()).to.equal(3)
    })

    it('should convert deprecated property and log warning', () => {
      addConfigurationMetadataFixture({ deprecation: {} })
      const input = heredoc`
      = Page Title

      configprop:foo.bar.baz[]
      `
      const actual = run(input, { convert: true })
      expect(actual).to.include('<code>foo.bar.baz</code>')
      expect(messages).to.have.lengthOf(1)
      const message = messages[0]
      expect(message.severity).to.equal('WARN')
      expect(message.message.text).to.equal('configuration property is deprecated: foo.bar.baz')
    })

    it('should convert deprecated property and not log warning if first positional attribute is set', () => {
      addConfigurationMetadataFixture({ deprecation: {} })
      const input = heredoc`
      = Page Title

      configprop:foo.bar.baz[deprecated]
      `
      const actual = run(input, { convert: true })
      expect(actual).to.include('<code>foo.bar.baz</code>')
      expect(messages).to.be.empty()
    })

    it('should convert deprecated property and not log warning if deprecated option is set', () => {
      addConfigurationMetadataFixture({ deprecation: {} })
      const input = heredoc`
      = Page Title

      configprop:foo.bar.baz[opts=deprecated]
      `
      const actual = run(input, { convert: true })
      expect(actual).to.include('<code>foo.bar.baz</code>')
      expect(messages).to.be.empty()
    })

    it('should convert valid property and log warning if deprecated option is set', () => {
      addConfigurationMetadataFixture()
      const input = heredoc`
      = Page Title

      configprop:foo.bar.baz[opts=deprecated]
      `
      const actual = run(input, { convert: true })
      expect(actual).to.include('<code>foo.bar.baz</code>')
      expect(messages).to.have.lengthOf(1)
      const message = messages[0]
      expect(message.severity).to.equal('WARN')
      expect(message.message.text).to.equal('configuration property is not deprecated: foo.bar.baz')
    })
  })

  describe('configprops block', () => {
    describe('properties', () => {
      it('should convert a configprops,properties block to a source block', () => {
        addConfigurationMetadataFixture()
        const input = heredoc`
        = Page Title

        [configprops,properties]
        ----
        foo.bar.baz=value
        ----
        `
        const actual = run(input)
        expect(messages).to.be.empty()
        const blocks = actual.findBy({ context: 'listing', style: 'source' })
        expect(blocks).to.have.lengthOf(1)
        const sourceBlock = blocks[0]
        expect(sourceBlock.getAttribute('language')).to.equal('properties')
        expect(sourceBlock.getSourceLines()).to.eql(['foo.bar.baz=value'])
      })

      it('should remove leading indentation from contents of configprops,properties block', () => {
        addConfigurationMetadataFixture()
        const input = heredoc`
        = Page Title

        [configprops,properties]
        ----
        \tfoo.bar.baz=value
        ----
        `
        const actual = run(input)
        expect(messages).to.be.empty()
        const sourceBlock = actual.findBy({ context: 'listing', style: 'source' })[0]
        expect(sourceBlock.getSourceLines()).to.eql(['foo.bar.baz=value'])
      })

      it('should skip document separator in properties data', () => {
        addConfigurationMetadataFixture(undefined, { name: 'yin.yang' })
        const input = heredoc`
        = Page Title

        [configprops,properties]
        ----
        foo.bar.baz=value
        #---
        yin.yang=value
        ----
        `
        const actual = run(input)
        expect(messages).to.be.empty()
        const blocks = actual.findBy({ context: 'listing', style: 'source' })
        expect(blocks).to.have.lengthOf(1)
        const sourceBlock = blocks[0]
        expect(sourceBlock.getAttribute('language')).to.equal('properties')
        expect(sourceBlock.getSourceLines()).to.eql(['foo.bar.baz=value', '#---', 'yin.yang=value'])
      })

      it('should log warning for each invalid property in configprops,properties block', () => {
        const input = heredoc`
        = Page Title

        [configprops,properties]
        ----
        no.such.property=true
        does.not.exist=false
        ----
        `
        const actual = run(input)
        const blocks = actual.findBy({ context: 'listing', style: 'source' })
        expect(blocks).to.have.lengthOf(1)
        const sourceBlock = blocks[0]
        expect(sourceBlock.getAttribute('language')).to.equal('properties')
        expect(messages).to.have.lengthOf(2)
        ;['no.such.property', 'does.not.exist'].forEach((name, idx) => {
          expect(messages[idx].severity).to.equal('WARN')
          expect(messages[idx].message.text).to.equal(`configuration property not found: ${name}`)
        })
      })

      it('should log warning for each deprecated property in configprops,properties block', () => {
        addConfigurationMetadataFixture({ deprecation: {} })
        const input = heredoc`
        = Page Title

        [configprops,properties]
        ----
        foo.bar.baz=val
        ----
        `
        run(input)
        expect(messages).to.have.lengthOf(1)
        expect(messages[0].message.text).to.equal('configuration property is deprecated: foo.bar.baz')
      })

      it('should not log warning if property is invalid and novalidate option is set', () => {
        const input = heredoc`
        = Page Title

        [configprops%novalidate,properties]
        ----
        fake.property.name=value
        ----
        `
        run(input)
        expect(messages).to.be.empty()
      })

      it('should report source location of configprops,properties block in warning message', () => {
        const input = heredoc`
        = Page Title

        [configprops,properties]
        ----
        no.such.property=true
        ----
        `
        const actual = run(input)
        const blocks = actual.findBy({ context: 'listing', style: 'source' })
        expect(blocks).to.have.lengthOf(1)
        expect(messages).to.have.lengthOf(1)
        expect(messages[0].message.source_location.getLineNumber()).to.equal(4)
      })

      it('should not attempt to validate indicies of list property', () => {
        addConfigurationMetadataFixture({
          name: 'spring.ldap.embedded.base-dn',
          type: 'java.util.List<java.lang.String>',
        })
        const input = heredoc`
        [configprops,properties]
        ----
        spring.ldap.embedded.base-dn[0]=dc=spring,dc=io
        spring.ldap.embedded.base-dn[1]=dc=acme,dc=io
        ----
        `
        run(input)
        expect(messages).to.be.empty()
      })

      it('should not attempt to validate keys of map property', () => {
        addConfigurationMetadataFixture({
          name: 'logging.level',
          type: 'java.util.Map<java.lang.String,java.lang.String>',
        })
        const input = heredoc`
        [configprops,properties]
        ----
        logging.level.tomcat=trace
        logging.level.web=trace
        ----
        `
        run(input)
        expect(messages).to.be.empty()
      })

      it('should warn if user-defined keys are defined on non-map property', () => {
        addConfigurationMetadataFixture({ name: 'server.address', type: 'java.lang.Object' })
        const input = heredoc`
        [configprops,properties]
        ----
        server.address.host=example.org
        ----
        `
        run(input)
        expect(messages).to.have.lengthOf(1)
        expect(messages[0].message.text).to.equal('configuration property not found: server.address.host')
      })
    })

    describe('yaml', () => {
      it('should convert a configprops,yaml block with noblocks option to a source block', () => {
        addConfigurationMetadataFixture()
        const input = heredoc`
        [configprops%noblocks,yaml]
        ----
        foo:
          bar:
            baz: val
        ----
        `
        const actual = run(input)
        expect(messages).to.be.empty()
        const blocks = actual.findBy({ context: 'listing', style: 'source' })
        expect(blocks).to.have.lengthOf(1)
        const sourceBlock = blocks[0]
        expect(sourceBlock.getAttribute('language')).to.equal('yaml')
        expect(sourceBlock.getSourceLines()).to.eql(['foo:', '  bar:', '    baz: val'])
      })

      it('should remove leading indentation from contents of configprops,yaml block', () => {
        addConfigurationMetadataFixture()
        const input = heredoc`
        [configprops%noblocks,yaml]
        ----
            foo:
            \tbar:
            \t\tbaz: val
        ----
        `
        const actual = run(input)
        expect(messages).to.be.empty()
        const sourceBlock = actual.findBy({ context: 'listing', style: 'source' })[0]
        expect(sourceBlock.getSourceLines()).to.eql(['foo:', '    bar:', '        baz: val'])
      })

      it('should log warning for each invalid property in configprops,yaml block', () => {
        const input = heredoc`
        = Page Title

        [configprops%noblocks,yaml]
        ----
        no:
          such:
            property: value
          property:
            defined: 1
        ----
        `
        const actual = run(input)
        const blocks = actual.findBy({ context: 'listing', style: 'source' })
        expect(blocks).to.have.lengthOf(1)
        const sourceBlock = blocks[0]
        expect(sourceBlock.getAttribute('language')).to.equal('yaml')
        expect(messages).to.have.lengthOf(2)
        ;['no.such.property', 'no.property.defined'].forEach((name, idx) => {
          expect(messages[idx].severity).to.equal('WARN')
          expect(messages[idx].message.text).to.equal(`configuration property not found: ${name}`)
        })
      })

      it('should log warning for each deprecated property in configprops,yaml block', () => {
        addConfigurationMetadataFixture({ deprecation: {} })
        const input = heredoc`
        = Page Title

        [configprops%noblocks,yaml]
        ----
        foo:
          bar:
            baz: val
        ----
        `
        run(input)
        expect(messages).to.have.lengthOf(1)
        expect(messages[0].message.text).to.equal('configuration property is deprecated: foo.bar.baz')
      })

      it('should not log warning for each invalid property in configprops,yaml block when novalidate option is set', () => {
        const input = heredoc`
        = Page Title

        [configprops%noblocks%novalidate,yaml]
        ----
        no:
          such:
            property: value
          property:
            defined: 1
        ----
        `
        run(input)
        expect(messages).to.be.empty()
      })

      it('should generate tabs for Properties and YAML from configprops,yaml block by default', () => {
        addConfigurationMetadataFixture()
        const input = heredoc`
        [configprops,yaml]
        ----
        foo:
          bar:
            baz: val
        ----
        `
        const actual = run(input)
        expect(messages).to.be.empty()
        const tabsBlock = actual.getBlocks()[0]
        expect(tabsBlock).to.exist()
        expect(tabsBlock.getStyle()).to.equal('tabs')
        const sourceBlocks = tabsBlock.findBy({ context: 'listing', style: 'source' })
        expect(sourceBlocks).to.have.lengthOf(2)
        expect(sourceBlocks[0].getAttribute('language')).to.equal('properties')
        expect(sourceBlocks[0].getSourceLines()).to.eql(['foo.bar.baz=val'])
        expect(sourceBlocks[1].getAttribute('language')).to.equal('yaml')
        expect(sourceBlocks[1].getSourceLines()).to.eql(['foo:', '  bar:', '    baz: val'])
      })

      it('should include source location with fixed cursor in warning for invalid proeprty in configprops,yaml block', () => {
        const input = heredoc`
        = Page Title

        == Section Title

        [configprops,yaml]
        ----
        no:
          such:
            property: false
        ----
        `
        run(input)
        expect(messages).to.have.lengthOf(1)
        expect(messages[0].message.source_location.getLineNumber()).to.equal(6)
      })

      it('should convert multiple documents in configprops,yaml block to properties', () => {
        addConfigurationMetadataFixture(undefined, { name: 'yin.yang' })
        const input = heredoc`
        [configprops,yaml]
        ----
        foo:
          bar:
            baz: val
        ---
        yin:
          yang: zen
        ----
        `
        const expected = ['foo.bar.baz=val', '#---', 'yin.yang=zen']
        const actual = run(input)
        expect(messages).to.be.empty()
        const propertiesBlock = actual.findBy({ context: 'listing' })[0]
        expect(propertiesBlock.getSourceLines()).to.eql(expected)
      })

      it('should convert multi-line property in configprops,yaml block to properties', () => {
        addConfigurationMetadataFixture()
        const input = heredoc`
        [configprops,yaml]
        ----
        foo:
          bar:
            baz: |
              one
              two
              three
        ----
        `
        expect(messages).to.be.empty()
        const actual = run(input)
        const propertiesBlock = actual.findBy({ context: 'listing' })[0]
        const expected = ['foo.bar.baz=\\', 'one\\n\\', 'two\\n\\', 'three']
        expect(propertiesBlock.getSourceLines()).to.eql(expected)
      })

      it('should only warn once if invalid property is used in multiple documents in configprops,yaml block', () => {
        const input = heredoc`
        [configprops,yaml]
        ----
        foo:
          bar: baz
        ---
        foo:
          bar: buzz
        ----
        `
        const expected = ['foo.bar=baz', '#---', 'foo.bar=buzz']
        const actual = run(input)
        expect(messages).to.have.lengthOf(1)
        const propertiesBlock = actual.findBy({ context: 'listing' })[0]
        expect(propertiesBlock.getSourceLines()).to.eql(expected)
      })

      it('should not attempt to validate keys of map property', () => {
        addConfigurationMetadataFixture({
          name: 'logging.level',
          type: 'java.util.Map<java.lang.String,java.lang.String>',
        })
        const input = heredoc`
        [configprops,yaml]
        ----
        logging:
          level:
            tomcat: trace
            web: info
        ----
        `
        const expected = ['logging.level.tomcat=trace', 'logging.level.web=info']
        const actual = run(input)
        expect(messages).to.be.empty()
        const propertiesBlock = actual.findBy({ context: 'listing' })[0]
        expect(propertiesBlock.getSourceLines()).to.eql(expected)
      })

      it('should not attempt to validate keys of list property', () => {
        addConfigurationMetadataFixture({
          name: 'spring.ldap.embedded.base-dn',
          type: 'java.util.List<java.lang.String>',
        })
        const input = heredoc`
        [configprops,yaml]
        ----
        spring.ldap.embedded.base-dn:
        - "dc=spring,dc=io"
        - "dc=acme,dc=io"
        ----
        `
        const expected = [
          'spring.ldap.embedded.base-dn[0]=dc=spring,dc=io',
          'spring.ldap.embedded.base-dn[1]=dc=acme,dc=io',
        ]
        const actual = run(input)
        expect(messages).to.be.empty()
        const propertiesBlock = actual.findBy({ context: 'listing' })[0]
        expect(propertiesBlock.getSourceLines()).to.eql(expected)
      })

      it('should convert map key to properties', () => {
        addConfigurationMetadataFixture({
          name: 'spring.mail.properties',
          type: 'java.util.Map<java.lang.String,java.lang.String>',
        })
        const input = heredoc`
        [configprops,yaml]
        ----
        spring:
          mail:
            properties:
              "[mail.smtp.connectiontimeout]": 5000
              "[mail.smtp.timeout]": 3000
              "[mail.smtp.writetimeout]": 5000
        ----
        `
        const expected = [
          'spring.mail.properties[mail.smtp.connectiontimeout]=5000',
          'spring.mail.properties[mail.smtp.timeout]=3000',
          'spring.mail.properties[mail.smtp.writetimeout]=5000',
        ]
        const actual = run(input)
        expect(messages).to.be.empty()
        const propertiesBlock = actual.findBy({ context: 'listing' })[0]
        expect(propertiesBlock.getSourceLines()).to.eql(expected)
      })

      it('should convert property which is already partially flattened and has no type', () => {
        addConfigurationMetadataFixture({ name: 'spring.jpa.hibernate.ddl-auto', type: null })
        const input = heredoc`
        [configprops,yaml]
        ----
        spring:
          jpa:
            hibernate.ddl-auto: create-drop
        ----
        `
        const expected = ['spring.jpa.hibernate.ddl-auto=create-drop']
        const actual = run(input)
        expect(messages).to.be.empty()
        const propertiesBlock = actual.findBy({ context: 'listing' })[0]
        expect(propertiesBlock.getSourceLines()).to.eql(expected)
      })

      it('should warn if user-defined keys are defined on non-map property', () => {
        addConfigurationMetadataFixture({ name: 'server.address', type: 'java.lang.Object' })
        const input = heredoc`
        [configprops,yaml]
        ----
        server:
          address:
            host: example.org
        ----
        `
        run(input)
        expect(messages).to.have.lengthOf(1)
        expect(messages[0].message.text).to.equal('configuration property not found: server.address.host')
      })

      it('should not convert property whose value is null', () => {
        addConfigurationMetadataFixture()
        const input = heredoc`
        [configprops,yaml]
        ----
        foo:
          bar:
            baz: val
        ignored:
          property: ~
        ----
        `
        const expected = ['foo.bar.baz=val']
        const actual = run(input)
        expect(messages).to.have.lengthOf(1)
        expect(messages[0].message.text).to.equal('configuration property not found: ignored.property')
        const propertiesBlock = actual.findBy({ context: 'listing' })[0]
        expect(propertiesBlock.getSourceLines()).to.eql(expected)
      })
    })
  })
})
