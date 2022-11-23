/* eslint-env mocha */
'use strict'

const Asciidoctor = require('@asciidoctor/core')()
const { expect, heredoc } = require('./harness')
const { name: packageName } = require('#package')

describe('extensions', () => {
  const ext = require(packageName)

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
        expect(extGroups[extGroupKeys[0]]).to.be.instanceOf(Function)
        const extensions = Asciidoctor.load([]).getExtensions()
        expect(extensions.getTreeProcessors()).to.have.lengthOf(2)
      } finally {
        Asciidoctor.Extensions.unregisterAll()
      }
    })

    it('should be able to call register function exported by extension', () => {
      const extensions = run().getExtensions()
      expect(extensions.getTreeProcessors()).to.have.lengthOf(2)
    })
  })

  describe('chomp and fold code', () => {
    it('should chomp source and add fold blocks to converted content', () => {
      const input = heredoc`
        :chomp: all
        :chomp-package-replacement: com.mydomain
        :fold: all

        [,java]
        ----
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

          protected SpringApplicationBuilder configure(SpringApplicationBuilder application) {
            return application.sources(SampleServletApplication.class);
          }

          // @fold:on // main
          public static void main(String[] args) {
            SpringApplication.run(SampleServletApplication.class, args);
          }
          // @fold:off
        }
        ----
      `
      const expectedSource = heredoc`
        package com.mydomain;

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
        <span class="fold-block">package com.mydomain;

        </span><span class="fold-block hide-when-folded">import java.io.IOException;

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

        </span><span class="fold-block hide-when-unfolded">  // main
        </span><span class="fold-block hide-when-folded">  public static void main(String[] args) {
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
