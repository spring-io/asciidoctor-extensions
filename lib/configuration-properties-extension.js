'use strict'

const toProc = require('./util/to-proc')
const { posix: path } = require('path')
const yaml = require('js-yaml')

function register (registry, context) {
  if (!(registry && context)) return // NOTE only works as scoped extension for now
  registry.groups.$store('springio/configuration-properties', toProc(createExtensionGroup(context)))
  return registry
}

function createExtensionGroup (context) {
  return function () {
    const adjustIndentation = global.Opal.Asciidoctor.Parser['$adjust_indentation!']
    const Reader = global.Opal.Asciidoctor.Reader
    this.block(function () {
      this.named('configprops')
      this.onContext(['listing'])
      this.positionalAttributes(['language'])
      this.process((parent, reader, attrs) => {
        const lines = reader.getLines()
        adjustIndentation(lines, 0, 4)
        let validate = !('novalidate-option' in attrs)
        let block = this.createListingBlock(parent, lines, Object.assign(attrs, { style: 'source' }))
        const cursor = (block.source_location = reader.$cursor_before_mark())
        const referenceBlock = block
        const configurationProperties = getScopedConfigurationProperties(context)
        if (attrs.language === 'properties') {
          validate &&= lines.reduce((accum, line) => {
            const name = extractPropertyName(line, configurationProperties)
            return name ? accum.add(name) : accum
          }, new Set())
        } else {
          block.setAttribute('language', 'yaml')
          const converter = new YamlToPropertiesConverter(configurationProperties)
          const yamlString = block.getSource()
          const propertiesString = converter.convert(yaml.loadAll(yamlString, yaml.CORE_SCHEMA))
          validate &&= converter.propertiesUsed
          if (!('noblocks-option' in attrs)) {
            const tabsSource = generateTabsSource([
              { label: 'Properties', lang: 'properties', source: propertiesString },
              { label: 'YAML', lang: 'yaml', source: yamlString },
            ])
            block = this.parseContent(parent, Reader.$new(tabsSource, cursor))
          }
        }
        if (validate) {
          for (const name of validate) validateConfigurationProperty(referenceBlock, configurationProperties, name)
        }
        return block
      })
    })
    this.inlineMacro(function () {
      this.named('configprop')
      this.positionalAttributes(['deprecated'])
      this.process((parent, name, attrs) => {
        const configurationProperties = getScopedConfigurationProperties(context)
        const deprecated = 'deprecated' in attrs || 'deprecated-option' in attrs
        const property = validateConfigurationProperty(parent, configurationProperties, name, deprecated)
        const text = property && attrs.format === 'envvar' ? property.env : name
        return this.createInline(parent, 'quoted', text, { type: 'monospaced' })
      })
    })
  }
}

class YamlToPropertiesConverter {
  constructor (configProps) {
    this.configProps = configProps
  }

  convert (docs) {
    this.propertiesUsed = new Set()
    return docs.length === 1
      ? this.toPropertiesData(docs[0])
      : docs.map(this.toPropertiesData.bind(this)).join('\n#---\n')
  }

  toPropertiesData (obj) {
    return this.toProperties(obj).join('\n')
  }

  toProperties (obj, prefix = '', open = false) {
    return Object.entries(obj).reduce((accum, [key, val]) => accum.concat(this.toProperty(key, val, prefix, open)), [])
  }

  toProperty (key, val, prefix, open) {
    const type = val?.constructor
    const propertyName = `${prefix && key[0] === '[' ? prefix.slice(0, -1) : prefix}${key}`
    if (type === Object) {
      if (!open && (open = this.configProps[propertyName]?.map || false)) this.propertiesUsed.add(propertyName)
      return this.toProperties(val, `${prefix}${key}.`, open)
    }
    if (!open) this.propertiesUsed.add(propertyName)
    if (!type) return []
    if (type === Array) {
      return val.reduce((accum, it, idx) => accum.concat(this.toProperty(`${key}[${idx}]`, it, prefix, true)), [])
    }
    return [`${propertyName}=${val}`]
  }
}

function extractPropertyName (line, configurationProperties) {
  let splitIdx = (line.indexOf('[') + 1 || line.indexOf('=') + 1 || 0) - 1
  if (!~splitIdx) return
  const name = line.slice(0, splitIdx)
  if (name in configurationProperties) return name
  let candidate = name
  while (~(splitIdx = candidate.lastIndexOf('.'))) {
    if ((candidate = line.slice(0, splitIdx)) in configurationProperties) {
      return configurationProperties[candidate].map ? candidate : name
    }
  }
  return name
}

function generateTabsSource (tabItems) {
  const lastIdx = tabItems.length - 1
  return tabItems.reduce((accum, { label, lang, source }, idx) => {
    idx ? accum.push('') : accum.push('[tabs]', '======')
    accum.push(label + '::', '+', `[,${lang}]`, '----', ...source.split('\n'), '----')
    if (idx === lastIdx) accum.push('======')
    return accum
  }, [])
}

function getScopedConfigurationProperties ({ contentCatalog, file, config }) {
  const { component, version } = file.src
  const scope = version + '@' + component
  const cache = ((config.data ??= {}).springConfigurationProperties ??= {})
  if (scope in cache) return cache[scope]
  return (cache[scope] = contentCatalog
    .findBy({ component, version, family: 'partial' })
    .reduce((accum, { contents, src }) => {
      if ((src.basename || path.basename(src.relative)) !== 'spring-configuration-metadata.json') return accum
      JSON.parse(contents).properties.forEach(({ name, type = 'java.lang.Object', deprecation }) => {
        accum[name] = {
          deprecated: !!deprecation,
          env: name.replaceAll('.', '_').replaceAll('-', '').toUpperCase(),
          map: type.startsWith('java.util.Map<'),
        }
      })
      return accum
    }, {}))
}

function log (node, severity, message) {
  node.getLogger()[severity](node.createLogMessage(message, { source_location: node.getSourceLocation() }))
}

function validateConfigurationProperty (node, configurationProperties, name, deprecated) {
  if (name in configurationProperties) {
    const property = configurationProperties[name]
    if (property.deprecated) {
      if (!deprecated) log(node, 'warn', `configuration property is deprecated: ${name}`)
    } else if (deprecated) {
      log(node, 'warn', `configuration property is not deprecated: ${name}`)
    }
    return property
  } else {
    log(node, 'warn', `configuration property not found: ${name}`)
  }
}

module.exports = { register, createExtensionGroup }
