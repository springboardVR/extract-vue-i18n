#!/usr/bin/env node
const shell = require('shelljs')
const path = require('path')
const fs = require('fs')
const glob = require('glob')
const consolidate = require('consolidate')
const Promise = require('promise')
const parseVue = require('vue-loader/lib/parser')
const { uniq, compact } = require('lodash')

const argv = require('yargs')
  .alias('output', 'o')
  .describe('output', 'The output file. It should be your template.pot')
  .alias('src', 's')
  .describe('src', 'The source folder for vue/html/js files')
  .array('attrs')
  .demand(['src', 'output'])
  .argv

const outputFile = argv.output
const srcFolder = argv.src
const extractAttrs = argv.attrs

// clean up
shell.rm('-f', outputFile)

const vueFiles = glob.sync(`${srcFolder}/**/*.vue`)

// extract from templates
let renderPromises = vueFiles.map((file) => {
  let content = fs.readFileSync(file, 'utf8')
  let filename = path.basename(file)
  let output = parseVue(content, filename, false)
  let templateLang = output.template ? output.template.lang : null
  let renderFn = templateLang && consolidate[templateLang] && consolidate[templateLang].render
  let renderOpts = templateLang && require(`./extract-opts/${templateLang}`)

  // must be in html so that they can match when the app runs
  let renderPromise = renderFn
                      ? renderFn.call(consolidate, output.template.content, renderOpts)
                      : Promise.resolve(output.template ? output.template.content : '')

  return renderPromise.then((html) => {
    return {file, html}
  }).catch((error) => {
    console.log(error)
  })
})

Promise.all(renderPromises)
.then((results) => {
  return results.map(({ file, html }) => {
    // console.log(html);
    const pattern = /{{\s*\$t\(['"](.*)['"]\)\s*}}/
    const result = (html.match(new RegExp(pattern, 'g')) || []).map(str => {
      const [, match] = str.match(pattern) || []
      return `${match}`
    })
    return compact(result).join('\n')
  })
}).then((matches) => {
  let outputFolder = path.dirname(outputFile)

  if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder)
  }

  console.log(matches);
  const result = uniq(matches)
  fs.writeFileSync(outputFile, result.join('\n'))
}).catch((error) => {
  console.log(error)
})
