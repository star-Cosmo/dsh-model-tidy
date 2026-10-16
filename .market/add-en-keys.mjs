import fs from 'node:fs'

const file = 'lib/client.js'
let source = fs.readFileSync(file, 'utf8')

// The anchor sits in the EN dictionary; insert the EN lines after it.
const anchor = "      aliasDialogClear: 'Clear alias',"
const at = source.indexOf(anchor)
if (at === -1) {
  console.error('add-en-keys: anchor not found')
  process.exit(1)
}

// Slice out the EN dictionary so the "already present" test can be scoped to it.
const enStart = source.indexOf('const en = {')
const enEnd = source.indexOf('\n    }', enStart)
const enBlock = source.slice(enStart, enEnd)

const EN = [
  "      showAllProviders: 'Show all',",
  "      hideAllProviders: 'Hide all',",
  "      visibleCount: '{visible} of {total} shown',",
  "      providerRow: '{visible}/{total}',",
  "      retry: 'Retry',",
  "      emptyCatalog: 'The model catalogue is empty.',",
  "      noMatch: 'No matching models.',",
  "      allHiddenWarning: 'Every model is hidden, so the model selector has nothing to offer.',",
  "      aliasEdit: 'Edit alias',",
]

const missing = EN.filter(line => !enBlock.includes(line.trim().split(':')[0] + ':'))
if (missing.length === 0) {
  console.log('add-en-keys: already present')
  process.exit(0)
}

source = source.slice(0, at + anchor.length) + '\n' + missing.join('\n') + source.slice(at + anchor.length)
fs.writeFileSync(file, source, 'utf8')
console.log(`add-en-keys: added ${missing.length} key(s)`)
