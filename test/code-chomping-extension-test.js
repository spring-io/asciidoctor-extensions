/* eslint-env mocha */
'use strict'

const Asciidoctor = require('@asciidoctor/core')()
const { expect, filterLines, heredoc, spy } = require('./harness')
const { name: packageName } = require('#package')

describe('code-chomping-extension', () => {
  const ext = require(packageName + '/code-chomping-extension')

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

  describe('chomp code', () => {
    it('should not operate on listing block', () => {
      const code = heredoc`
      keep
      // @chomp:line
      also keep
      `

      const input = heredoc`
      ----
      ${code}
      ----
      `

      const extensionRegistry = Asciidoctor.Extensions.create()
      extensionRegistry.treeProcessor(function () {
        this.process((doc) => {
          const listingBlock = doc.findBy({ context: 'listing' })[0]
          listingBlock.getAttribute = spy(listingBlock.getAttribute)
        })
      })
      const expected = code
      const block = run(input, { extension_registry: extensionRegistry }).getBlocks()[0]
      const actual = block.getSource()
      expect(actual).to.equal(expected)
      expect(block.getAttribute).to.not.have.been.called()
    })

    it('should not operate on non-Java-like source block', () => {
      const code = heredoc`
      keep
      // @chomp:line
      also keep
      `

      const input = heredoc`
      [,ruby]
      ----
      ${code}
      ----
      `

      const extensionRegistry = Asciidoctor.Extensions.create()
      extensionRegistry.treeProcessor(function () {
        this.process((doc) => {
          const listingBlock = doc.findBy({ context: 'listing' })[0]
          listingBlock.getAttribute = spy(listingBlock.getAttribute)
        })
      })
      const expected = code
      const block = run(input, { extension_registry: extensionRegistry }).getBlocks()[0]
      const actual = block.getSource()
      expect(actual).to.equal(expected)
      expect(block.getAttribute).to.not.have.been.called.with('chomp', 'default')
    })

    it('should remove header above package declaration (Java)', () => {
      const code = heredoc`
      /*
       * Copyright 2000-present ACME Corp. Free the source!
       */

      package org.example;

      public class Example {}
      `

      const input = heredoc`
      :chomp: headers

      [,java]
      ----
      ${code}
      ----
      `

      const expected = code.replace(/.*?(?=package )/s, '')
      const actual = run(input).getBlocks()[0].getSource()
      expect(actual).to.equal(expected)
    })

    it('should remove header above package declaration (Kotlin)', () => {
      const code = heredoc`
      /*
       * Copyright 2000-present ACME Corp. Free the source!
       */

      package org.example

      public class Example {}
      `

      const input = heredoc`
      :chomp-package-replacement:
      :chomp: all

      [,kotlin]
      ----
      ${code}
      ----
      `

      const expected = code.replace(/.*?(?=package )/s, '')
      const actual = run(input).getBlocks()[0].getSource()
      expect(actual).to.equal(expected)
    })

    it('should remove header above package declaration (Groovy)', () => {
      const code = heredoc`
      /*
       * Copyright 2000-present ACME Corp. Free the source!
       */

      package org.example

      public class Example {}
      `

      const input = heredoc`
      :chomp-package-replacement:

      [,groovy,chomp=all]
      ----
      ${code}
      ----
      `

      const expected = code.replace(/.*?(?=package )/s, '')
      const actual = run(input).getBlocks()[0].getSource()
      expect(actual).to.equal(expected)
    })

    it('should not remove lines above subsequent package declaration', () => {
      const code = heredoc`
      /*
       * Copyright 2000-present ACME Corp. Free the source!
       */

      package org.example

      public class Example {}

      package com.acme

      public class Thing {}
      `

      const input = heredoc`
      [,groovy]
      ----
      ${code}
      ----
      `

      const expected = code.replace(/.*?(?=package )/s, '')
      const actual = run(input, { attributes: { 'chomp@': 'headers' } })
        .getBlocks()[0]
        .getSource()
      expect(actual).to.equal(expected)
    })

    it('should remove package declaration if chomp is packages', () => {
      const input = heredoc`
      :chomp: packages

      [,java]
      ----
      package org.example;

      public class Example {}
      ----
      `

      const expected = 'public class Example {}'
      const actual = run(input).getBlocks()[0].getSource()
      expect(actual).to.equal(expected)
    })

    it('should replace package declaration with statement terminator at top of block', () => {
      const code = heredoc`
      package org.example;

      public class Example {}
      `

      const input = heredoc`
      :chomp: packages
      :chomp_package_replacement: com.acme

      [,java]
      ----
      ${code}
      ----
      `

      const expected = code.replace('package org.example', 'package com.acme')
      const actual = run(input).getBlocks()[0].getSource()
      expect(actual).to.equal(expected)
    })

    it('should replace package declaration without statement terminator', () => {
      const code = heredoc`
      package org.example

      public class Example {}
      `

      const input = heredoc`
      :chomp-package-replacement: com.acme

      [,groovy,chomp=packages]
      ----
      ${code}
      ----
      `

      const expected = code.replace('package org.example', 'package com.acme')
      const actual = run(input).getBlocks()[0].getSource()
      expect(actual).to.equal(expected)
    })

    it('should replace package declaration when configured on the block', () => {
      const code = heredoc`
      package org.example;

      public class Example {}
      `

      const input = heredoc`
      :chomp: packages
      :chomp_package_replacement: org.acme

      [chomp_package_replacement=com.acme]
      [,java]
      ----
      ${code}
      ----
      `

      const expected = code.replace('package org.example', 'package com.acme')
      const actual = run(input).getBlocks()[0].getSource()
      expect(actual).to.equal(expected)
    })

    it('should remove remaining lines after @chomp:file', () => {
      const input = heredoc`
      [,java]
      ----
      package org.example;
      // @chomp:file

      public class Example {}
      ----
      `

      const expected = 'package org.example;'
      const actual = run(input).getBlocks()[0].getSource()
      expect(actual).to.equal(expected)
    })

    it('should remove blank line before @chomp:file line', () => {
      const input = heredoc`
      [,java]
      ----
      package org.example;

      // @chomp:file
      public class Example {}
      ----
      `

      const expected = 'package org.example;'
      const actual = run(input).getBlocks()[0].getSource()
      expect(actual).to.equal(expected)
    })

    it('should remove line marked with @chomp:line', () => {
      const code = heredoc`
      @SpringBootApplication
      public class SampleApplication implements CommandLineRunner {
          @Override // @chomp:line
          public void run(String... args) {
              System.out.println("Let's go!");
          }
      }
      `

      const input = heredoc`
      [,java]
      ----
      ${code}
      ----
      `

      const expected = filterLines(code, (l) => !l.endsWith('// @chomp:line'))
      const actual = run(input).getBlocks()[0].getSource()
      expect(actual).to.equal(expected)
    })

    it('should remove lines with @Suppress or @SuppressWarnings annotation', () => {
      const code = heredoc`
      public class Person {
        @SuppressWarnings("unused")
        private String name;

        @Suppress("unused")
        private String role;
      }
      `

      const input = heredoc`
      [,java]
      ----
      ${code}
      ----
      `

      const expected = filterLines(code, (l) => !l.includes('@Suppress'))
      const actual = run(input).getBlocks()[0].getSource()
      expect(actual).to.equal(expected)
    })

    it('should remove lines with @formatter directives', () => {
      const code = heredoc`
      public class WebFluxRedisApplication {
        @Bean
        public SecurityWebFilterChain springSecurityFilterChain(ServerHttpSecurity http) {
          // @formatter:off
          return http
            .authorizeExchange()
              .anyExchange().authenticated()
              .and()
            .httpBasic().securityContextRepository(new WebSessionServerSecurityContextRepository())
              .and()
            .formLogin()
              .and()
            .build();
          // @formatter:on
        }
      }
      `

      const input = heredoc`
      [,java]
      ----
      ${code}
      ----
      `

      const expected = filterLines(code, (l) => !l.includes('// @formatter:'))
      const actual = run(input).getBlocks()[0].getSource()
      expect(actual).to.equal(expected)
    })

    it('should chomp remainder of line after /**/', () => {
      const input = heredoc`
      [,java]
      ----
      public class Example {
        private final Something something;

        public Example() {
          this.something = /**/new MockSomething();
        }
      }
      ----
      `

      const expected = heredoc`
      public class Example {
        private final Something something;

        public Example() {
          this.something = ...
        }
      }
      `

      const actual = run(input).getBlocks()[0].getSource()
      expect(actual).to.equal(expected)
    })

    it('should chomp remainder of line after /* text */ and replace with text', () => {
      const input = heredoc`
      [,java]
      ----
      public class Example {
        private final Something something;

        public Example() {
          this.something = /* @chomp:line ...your thing */ new MyThing();
        }
      }
      ----
      `

      const expected = heredoc`
      public class Example {
        private final Something something;

        public Example() {
          this.something = ...your thing
        }
      }
      `

      const actual = run(input).getBlocks()[0].getSource()
      expect(actual).to.equal(expected)
    })

    it('should not require space before chomp tag', () => {
      const input = heredoc`
      [,java]
      ----
      public class Example {
        public static void main(String[] args) {
          System.out.println(/* @chomp:line "your message"); */"Hello, World!");
        }
      }
      ----
      `

      const expected = heredoc`
      public class Example {
        public static void main(String[] args) {
          System.out.println("your message");
        }
      }
      `

      const actual = run(input).getBlocks()[0].getSource()
      expect(actual).to.equal(expected)
    })
  })
})
