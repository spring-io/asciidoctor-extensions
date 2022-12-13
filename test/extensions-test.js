/* eslint-env mocha */
'use strict'

const Asciidoctor = require('@asciidoctor/core')()
const { configureLogger } = require('@antora/logger')
const loadAsciiDoc = require('@antora/asciidoc-loader')
const { expect, heredoc } = require('./harness')
const { name: packageName } = require('#package')

describe('extensions', () => {
  const ext = require(packageName)

  let contentCatalog, file

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
      if (!permittedFamilies.includes(family)) return
      return this.getById(Object.assign({}, context, { family, relative }))
    },
  })

  const run = (input = [], opts = {}) => {
    opts.extensions = [ext]
    const inputFile = { ...file, contents: Buffer.from(input) }
    return loadAsciiDoc(inputFile, contentCatalog, opts)
  }

  beforeEach(() => {
    contentCatalog = createContentCatalog()
    configureLogger()
  })

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
        expect(extGroupKeys).to.eql(['springio'])
        expect(extGroups[extGroupKeys[0]]).to.be.instanceOf(Function)
        const extensions = Asciidoctor.load([]).getExtensions()
        expect(extensions.getTreeProcessors()).to.have.lengthOf(2)
        expect(extensions.hasBlockMacros()).to.be.false()
      } finally {
        Asciidoctor.Extensions.unregisterAll()
      }
    })

    it('should be able to call register function exported by extension', () => {
      const context = { file, contentCatalog }
      const opts = {}
      opts.extension_registry = ext.register(opts.extension_registry || Asciidoctor.Extensions.create(), context)
      const extensions = Asciidoctor.load([], opts).getExtensions()
      expect(extensions.getTreeProcessors()).to.have.lengthOf(2)
      expect(extensions.getBlockMacros()).to.have.lengthOf(1)
    })
  })

  describe('import, chomp, and fold code', () => {
    it('should import code, chomp source, and add fold blocks to converted content', () => {
      const inputSource = heredoc`
      /*
       * Copyright 2012-2021 the original author or authors.
       */
      package com.acme;

      import java.io.IOException;

      import jakarta.servlet.*;

      import org.springframework.boot.*;
      import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
      import org.springframework.boot.builder.SpringApplicationBuilder;
      import org.springframework.boot.web.servlet.support.SpringBootServletInitializer;
      import org.springframework.context.annotation.Bean;

      @SpringBootConfiguration
      @EnableAutoConfiguration
      public class SampleServletApplication extends SpringBootServletInitializer {
        @SuppressWarnings("serial")
        @Bean
        public Servlet dispatcherServlet() {
          return new GenericServlet() {
            @Override // @chomp:line
            public void service(ServletRequest req, ServletResponse res) throws ServletException, IOException {
              res.setContentType("text/plain");
              // @formatter:off
              res
                .getWriter()
                /* @chomp:line .append("your message..."); */.append("/Hello World");
              // @formatter:on
            }
          };
        }

        @Override // @chomp:line
        protected SpringApplicationBuilder configure(SpringApplicationBuilder application) {
          return application.sources(SampleServletApplication.class);
        }

        // @fold:on // main
        public static void main(String[] args) {
          SpringApplication.run(SampleServletApplication.class, args);
        }
        // @fold:off
      }
      `

      file = {
        src: {
          component: 'spring-security',
          version: '6.0.0',
          module: 'ROOT',
          family: 'page',
          relative: 'index.adoc',
        },
        pub: { moduleRootPath: '' },
      }
      contentCatalog.files.push({
        contents: Buffer.from(inputSource),
        src: { ...file.src, family: 'example', relative: 'java/SampleServletApplication.java' },
      })

      const input = heredoc`
      :docs-java: example$java
      :chomp: all
      :fold: all

      import::code:SampleServletApplication[]
      `

      const expectedSource = heredoc`
      import java.io.IOException;

      import jakarta.servlet.*;

      import org.springframework.boot.*;
      import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
      import org.springframework.boot.builder.SpringApplicationBuilder;
      import org.springframework.boot.web.servlet.support.SpringBootServletInitializer;
      import org.springframework.context.annotation.Bean;

      @SpringBootConfiguration
      @EnableAutoConfiguration
      public class SampleServletApplication extends SpringBootServletInitializer {
        @Bean
        public Servlet dispatcherServlet() {
          return new GenericServlet() {
            public void service(ServletRequest req, ServletResponse res) throws ServletException, IOException {
              res.setContentType("text/plain");
              res
                .getWriter()
                .append("your message...");
            }
          };
        }

        protected SpringApplicationBuilder configure(SpringApplicationBuilder application) {
          return application.sources(SampleServletApplication.class);
        }

        // @fold:on // main
        public static void main(String[] args) {
          SpringApplication.run(SampleServletApplication.class, args);
        }
        // @fold:off
      }
      `

      const expectedContent = heredoc`
      <span class="fold-block is-hidden-folded">import java.io.IOException;

      import jakarta.servlet.*;

      import org.springframework.boot.*;
      import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
      import org.springframework.boot.builder.SpringApplicationBuilder;
      import org.springframework.boot.web.servlet.support.SpringBootServletInitializer;
      import org.springframework.context.annotation.Bean;

      </span><span class="fold-block">@SpringBootConfiguration
      @EnableAutoConfiguration
      public class SampleServletApplication extends SpringBootServletInitializer {
        @Bean
        public Servlet dispatcherServlet() {
          return new GenericServlet() {
            public void service(ServletRequest req, ServletResponse res) throws ServletException, IOException {
              res.setContentType("text/plain");
              res
                .getWriter()
                .append("your message...");
            }
          };
        }

        protected SpringApplicationBuilder configure(SpringApplicationBuilder application) {
          return application.sources(SampleServletApplication.class);
        }

      </span><span class="fold-block is-hidden-unfolded">  // main
      </span><span class="fold-block is-hidden-folded">  public static void main(String[] args) {
          SpringApplication.run(SampleServletApplication.class, args);
        }
      </span><span class="fold-block">}</span>
      `

      const block = run(input).getBlocks()[0]
      expect(block.getSource()).to.equal(expectedSource)
      expect(block.getContent()).to.equal(expectedContent)
    })
  })
})
