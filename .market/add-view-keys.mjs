import fs from 'node:fs'

const file = 'lib/client.js'
let source = fs.readFileSync(file, 'utf8')

/** Insert keys right after an anchor line, if the key is not already present. */
const addKeys = (anchor, lines, label) => {
  const at = source.indexOf(anchor)
  if (at === -1) {
    console.error(`add-keys: anchor not found (${label})`)
    process.exit(1)
  }
  const missing = lines.filter(line => !source.includes(line.trim().split(':')[0] + ':'))
  if (missing.length === 0) {
    console.log(`add-keys: already present (${label})`)
    return
  }
  source = source.slice(0, at + anchor.length) + '\n' + missing.join('\n') + source.slice(at + anchor.length)
  console.log(`add-keys: added ${missing.length} key(s) (${label})`)
}

// zh — anchored on a key that always exists in that dictionary
addKeys(
  "      aliasDialogClear: '清除备注',",
  [
    "      showAllProviders: '全部显示',",
    "      hideAllProviders: '全部隐藏',",
    "      visibleCount: '已显示 {visible} / {total}',",
    "      providerRow: '{visible}/{total}',",
    "      retry: '重试',",
    "      emptyCatalog: '模型目录是空的。',",
    "      noMatch: '没有匹配的模型。',",
    "      allHiddenWarning: '所有模型都已隐藏，模型选择器里将没有可选模型。',",
    "      aliasEdit: '改备注',",
  ],
  'zh',
)

addKeys(
  "      aliasDialogClear: 'Clear alias',",
  [
    "      showAllProviders: 'Show all',",
    "      hideAllProviders: 'Hide all',",
    "      visibleCount: '{visible} of {total} shown',",
    "      providerRow: '{visible}/{total}',",
    "      retry: 'Retry',",
    "      emptyCatalog: 'The model catalogue is empty.',",
    "      noMatch: 'No matching models.',",
    "      allHiddenWarning: 'Every model is hidden, so the model selector has nothing to offer.',",
    "      aliasEdit: 'Edit alias',",
  ],
  'en',
)

fs.writeFileSync(file, source, 'utf8')
