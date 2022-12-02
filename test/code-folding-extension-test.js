/* eslint-env mocha */
'use strict'

const Asciidoctor = require('@asciidoctor/core')()
const { expect, filterLines, heredoc } = require('./harness')
const { name: packageName } = require('#package')

describe('code-folding-extension', () => {
  const ext = require(packageName + '/code-folding-extension')

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

  describe('fold code', () => {
    it('should remove fold directive lines if fold is not enabled on document', () => {
      const code = heredoc`
      public class Example {
        // @fold:on
        public static void main (String[] args) {
          new Example().sayHello();
        }
        // @fold:off

        public void sayHello () {
          System.out.println("Hello!");
        }
      }
      `

      const input = heredoc`
      :fold: none

      [,java]
      ----
      ${code}
      ----
      `

      const expected = filterLines(code, (l) => !l.includes('// @fold:'))
      const actual = run(input).getBlocks()[0].getSource()
      expect(actual).to.equal(expected)
    })

    it('should remove fold directive lines if fold is not enabled on block', () => {
      const code = heredoc`
      public class Example {
        public static void main (String[] args) {
          new Example().sayHello();
        }

        public void sayHello () {
          System.out.println("Hello!");
        }
      }
      `

      const input = heredoc`
      [,java,fold=none]
      ----
      ${code}
      ----
      `

      const expected = filterLines(code, (l) => !l.includes('// @fold:'))
      const actual = run(input).getBlocks()[0].getSource()
      expect(actual).to.equal(expected)
    })

    it('should remove fold directive lines if fold is imports and block has no imports', () => {
      const code = heredoc`
      public class Example {
        public static void main (String[] args) {
          new Example().sayHello();
        }

        public void sayHello () {
          println("Hello!");
        }
      }
      `

      const input = heredoc`
      :fold: imports

      [,java]
      ----
      ${code}
      ----
      `

      const expected = filterLines(code, (l) => !l.includes('// @fold:'))
      const actual = run(input).getBlocks()[0].getContent()
      expect(actual).to.equal(expected)
    })

    it('should not wrap contents of block in fold span if empty', () => {
      const input = heredoc`
      [,java]
      ----
      ----

      [,js,subs=attributes+]
      ----
      {empty}
      ----
      `

      run(input)
        .getBlocks()
        .map((it) => it.getContent())
        .forEach((actual) => expect(actual['$nil?']()).to.be.true())
    })

    it('should not wrap contents of block in fold span if no directives are found', () => {
      const code = heredoc`
      public class Example {
        public static void main (String[] args) {
          new Example().sayHello();
        }

        public void sayHello () {
          System.out.println("Hello!");
        }
      }
      `

      const input = heredoc`
      [,java]
      ----
      ${code}
      ----
      `

      const expected = code
      const actual = run(input).getBlocks()[0].getContent()
      expect(actual).to.equal(expected)
    })

    it('should wrap folded and unfolded chunks when fold directives are found', () => {
      const input = heredoc`
      [,java]
      ----
      public class Example {
        // @fold:on
        public static void main (String[] args) {
          new Example().sayHello();
        }

        // @fold:off
        public void sayHello () {
          System.out.println("Hello!");
        }
      }
      ----
      `

      const expected = heredoc`
      <span class="fold-block">public class Example {
      </span><span class="fold-block is-hidden-folded">  public static void main (String[] args) {
          new Example().sayHello();
        }

      </span><span class="fold-block">  public void sayHello () {
          System.out.println("Hello!");
        }
      }</span>
      `
      const actual = run(input).getBlocks()[0].getContent()
      expect(actual).to.equal(expected)
    })

    it('should collapse blank line above fold directive', () => {
      const input = heredoc`
      [,java]
      ----
      public class Team {
        public String getName() {
          return this.name;
        }

        // @fold:on
        public String getMascot() {
          return this.mascot;
        }
        // @fold:off

        public String[] getColors() {
          return this.colors;
        }
      }
      ----
      `

      const expected = heredoc`
      <span class="fold-block">public class Team {
        public String getName() {
          return this.name;
        }

      </span><span class="fold-block is-hidden-folded">  public String getMascot() {
          return this.mascot;
        }

      </span><span class="fold-block">  public String[] getColors() {
          return this.colors;
        }
      }</span>
      `

      const actual = run(input).getBlocks()[0].getContent()
      expect(actual).to.equal(expected)
    })

    it('should replace folded text with text when folded', () => {
      const input = heredoc`
      [,java]
      ----
      public class Example {
        // @fold:on // main
        public static void main (String[] args) {
          new Example().sayHello();
        }
        // @fold:off

        public void sayHello () {
          System.out.println("Hello!");
        }
      }
      ----
      `

      const expected = heredoc`
      <span class="fold-block">public class Example {
      </span><span class="fold-block is-hidden-unfolded">  // main

      </span><span class="fold-block is-hidden-folded">  public static void main (String[] args) {
          new Example().sayHello();
        }

      </span><span class="fold-block">  public void sayHello () {
          System.out.println("Hello!");
        }
      }</span>
      `
      const actual = run(input).getBlocks()[0].getContent()
      expect(actual).to.equal(expected)
    })

    it('should wrap whole contents of block in fold span if starts with unclosed fold directive', () => {
      const code = 'public class Example {}'
      const input = heredoc`
      [,java]
      ----
      // @fold:on
      ${code}
      ----
      `

      const expected = `<span class="fold-block is-hidden-folded">${code}</span>`
      const actual = run(input).getBlocks()[0].getContent()
      expect(actual).to.equal(expected)
    })

    it('should wrap whole contents of block in fold span if starts and ends with fold directive', () => {
      const code = 'public class Example {}'
      const input = heredoc`
      [,java]
      ----
      // @fold:on
      ${code}
      // @fold:off
      ----
      `

      const expected = `<span class="fold-block is-hidden-folded">${code}</span>`
      const actual = run(input).getBlocks()[0].getContent()
      expect(actual).to.equal(expected)
    })

    it('should handle case of contents that starts and ends with single fold directive with replacement text', () => {
      const code = 'public class Example {}'
      const input = heredoc`
      [,java]
      ----
      // @fold:on // reveal answer
      ${code}
      // @fold:off
      ----
      `

      const expected = heredoc`
      <span class="fold-block is-hidden-unfolded">// reveal answer
      </span><span class="fold-block is-hidden-folded">${code}</span>
      `

      const actual = run(input).getBlocks()[0].getContent()
      expect(actual).to.equal(expected)
    })

    it('should fold import statements by default', () => {
      const input = heredoc`
      [,java]
      ----
      import java.util.Arrays;

      import org.springframework.boot.SpringApplication;
      import org.springframework.boot.autoconfigure.SpringBootApplication;

      @SpringBootApplication
      public class MyApplication {
          public static void main(String[] args) {
              SpringApplication.run(MyApplication.class, Arrays.asList(args));
          }
      }
      ----
      `

      const expected = heredoc`
      <span class="fold-block is-hidden-folded">import java.util.Arrays;

      import org.springframework.boot.SpringApplication;
      import org.springframework.boot.autoconfigure.SpringBootApplication;

      </span><span class="fold-block">@SpringBootApplication
      public class MyApplication {
          public static void main(String[] args) {
              SpringApplication.run(MyApplication.class, Arrays.asList(args));
          }
      }</span>
      `
      const actual = run(input).getBlocks()[0].getContent()
      expect(actual).to.equal(expected)
    })

    it('should fold block with only import statements', () => {
      const code = heredoc`
      import org.springframework.context.annotation.*;
      import org.springframework.security.config.annotation.authentication.builders.*;
      import org.springframework.security.config.annotation.web.configuration.*;
      `

      const input = heredoc`
      [,java]
      ----
      ${code}
      ----
      `

      const expected = `<span class="fold-block is-hidden-folded">${code}</span>`
      const actual = run(input).getBlocks()[0].getContent()
      expect(actual).to.equal(expected)
    })

    it('should fold import statements that follow package declaration', () => {
      const input = heredoc`
      [,java]
      ----
      package org.example;

      import org.springframework.boot.SpringApplication;
      import org.springframework.boot.autoconfigure.SpringBootApplication;

      @SpringBootApplication
      public class MyApplication {
          public static void main(String[] args) {
              SpringApplication.run(MyApplication.class, args);
          }
      }
      ----
      `

      const expected = heredoc`
      <span class="fold-block">package org.example;

      </span><span class="fold-block is-hidden-folded">import org.springframework.boot.SpringApplication;
      import org.springframework.boot.autoconfigure.SpringBootApplication;

      </span><span class="fold-block">@SpringBootApplication
      public class MyApplication {
          public static void main(String[] args) {
              SpringApplication.run(MyApplication.class, args);
          }
      }</span>
      `

      const actual = run(input).getBlocks()[0].getContent()
      expect(actual).to.equal(expected)
    })

    it('should fold import statements that follow header and package declaration', () => {
      const input = heredoc`
      [,java]
      ----
      /*
       * License header
       */
      package org.example;

      import org.springframework.boot.SpringApplication;
      import org.springframework.boot.autoconfigure.SpringBootApplication;

      @SpringBootApplication
      public class MyApplication {
          public static void main(String[] args) {
              SpringApplication.run(MyApplication.class, args);
          }
      }
      ----
      `

      const expected = heredoc`
      <span class="fold-block">/*
       * License header
       */
      package org.example;

      </span><span class="fold-block is-hidden-folded">import org.springframework.boot.SpringApplication;
      import org.springframework.boot.autoconfigure.SpringBootApplication;

      </span><span class="fold-block">@SpringBootApplication
      public class MyApplication {
          public static void main(String[] args) {
              SpringApplication.run(MyApplication.class, args);
          }
      }</span>
      `

      const actual = run(input).getBlocks()[0].getContent()
      expect(actual).to.equal(expected)
    })

    it('should not fold import statements if fold is tags', () => {
      const code = heredoc`
      import org.springframework.beans.factory.annotation.Autowired;

      import org.springframework.context.annotation.*;
      import org.springframework.security.config.annotation.authentication.builders.*;
      import org.springframework.security.config.annotation.web.configuration.*;

      @Configuration
      @EnableWebSecurity
      public class WebSecurityConfig {
        @Bean
        public UserDetailsService userDetailsService() {
          InMemoryUserDetailsManager manager = new InMemoryUserDetailsManager();
          manager.createUser(User.withDefaultPasswordEncoder())
          return manager;
        }
      }
      `

      const input = heredoc`
      [,java]
      ----
      ${code}
      ----
      `

      const expected = code
      const actual = run(input, { attributes: { 'fold@': 'tags' } })
        .getBlocks()[0]
        .getContent()
      expect(actual).to.equal(expected)
    })

    it('should remove fold directive lines if fold is imports and block has imports', () => {
      const input = heredoc`
      :fold: imports

      [,java]
      ----
      import static java.lang.System.out;

      public class Example {
        // @fold:on
        public static void main (String[] args) {
          new Example().sayHello();
        }
        // @fold:off

        public void sayHello () {
          out.println("Hello!");
        }
      }
      ----
      `

      const expected = heredoc`
      <span class="fold-block is-hidden-folded">import static java.lang.System.out;

      </span><span class="fold-block">public class Example {
        public static void main (String[] args) {
          new Example().sayHello();
        }

        public void sayHello () {
          out.println("Hello!");
        }
      }</span>
      `

      const actual = run(input).getBlocks()[0].getContent()
      expect(actual).to.equal(expected)
    })

    it('should not fold import statements if language is not Java-like', () => {
      const code = heredoc`
      import { unlink } from 'node:fs/promises';

      try {
        await unlink('/tmp/scratch.txt');
      } catch (error) {
        console.error('there was an error:', error.message);
      }
      `

      const input = heredoc`
      [,js]
      ----
      ${code}
      ----
      `

      const expected = code
      const actual = run(input).getBlocks()[0].getContent()
      expect(actual).to.equal(expected)
    })

    it('should apply substitutions before adding fold spans', () => {
      const input = heredoc`
      [,java]
      ----
      import java.util.List;

      import org.springframework.boot.ApplicationArguments;
      import org.springframework.stereotype.Component;

      @Component
      public class MyBean {
          public MyBean(ApplicationArguments args) {
              boolean debug = args.containsOption("debug");
              List<String> files = args.getNonOptionArgs();
              // @fold:on // if debug && number of files > 0
              if (debug && !files.isEmpty()) System.out.println(files);
              // @fold:off
          }
      }
      ----
      `

      const expected = heredoc`
      <span class="fold-block is-hidden-folded">import java.util.List;

      import org.springframework.boot.ApplicationArguments;
      import org.springframework.stereotype.Component;

      </span><span class="fold-block">@Component
      public class MyBean {
          public MyBean(ApplicationArguments args) {
              boolean debug = args.containsOption("debug");
              List&lt;String&gt; files = args.getNonOptionArgs();
      </span><span class="fold-block is-hidden-unfolded">        // if debug &amp;&amp; number of files &gt; 0
      </span><span class="fold-block is-hidden-folded">        if (debug &amp;&amp; !files.isEmpty()) System.out.println(files);
      </span><span class="fold-block">    }
      }</span>
      `

      const actual = run(input).getBlocks()[0].getContent()
      expect(actual).to.equal(expected)
    })
  })
})
