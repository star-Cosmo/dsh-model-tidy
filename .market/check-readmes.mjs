/**
 * The README language switch must be complete and honest.
 *
 * A language bar is the first thing a reader clicks, and every entry has to go
 * somewhere real. This checks that:
 *
 *   1. every README links to all the others, so no language is a dead end;
 *   2. each file marks exactly one language as current, and it is its own;
 *   3. a link to a file that does not exist yet is reported — the Russian slot
 *      is reserved on purpose, and this is the check that notices the day it is
 *      still missing (or the day someone forgets to add it to one file).
 *
 * Run: node .market/check-readmes.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const LANGS = [
  { file: 'README.md', label: '中文', name: 'Chinese' },
  { file: 'README.en.md', label: 'English', name: 'English' },
  { file: 'README.ja.md', label: '日本語', name: 'Japanese' },
  { file: 'README.ru.md', label: 'Русский', name: 'Russian' },
]

let failures = 0
const check = (label, ok, extra = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`)
  if (!ok) failures += 1
}

const present = LANGS.filter(lang => fs.existsSync(path.join(repo, lang.file)))
check('至少存在一份 README', present.length > 0, present.map(l => l.file).join(', '))

const missing = LANGS.filter(lang => !fs.existsSync(path.join(repo, lang.file)))
if (missing.length > 0) {
  console.log(`  NOTE 尚未创建：${missing.map(l => l.file).join(', ')}（语言栏已预留）`)
}

/** The first non-blank line after the H1 is the language bar. */
function languageBar(source) {
  const lines = source.split('\n')
  const h1 = lines.findIndex(line => line.startsWith('# '))
  if (h1 === -1) return null
  for (let i = h1 + 1; i < lines.length; i++) {
    if (lines[i].trim() === '') continue
    return lines[i]
  }
  return null
}

const sources = new Map()
for (const lang of present) {
  sources.set(lang.file, fs.readFileSync(path.join(repo, lang.file), 'utf8'))
}

// ── every present file carries a bar naming every present language ──────────
for (const lang of present) {
  const bar = languageBar(sources.get(lang.file))
  check(`${lang.file} 有语言栏`, typeof bar === 'string' && bar.includes(']('), String(bar).slice(0, 80))

  for (const other of present) {
    // The current language is plain bold text, not a link — every *other*
    // language must be a link. So `README.md` is required to link to
    // `README.en.md`/`README.ja.md`, and to mark itself without a link.
    if (other.file === lang.file) continue
    const linked = new RegExp(`\\]\\(${other.file.replace('.', '\\.')}\\)`).test(bar ?? '')
    check(`  ${lang.file} 链接到 ${other.file}`, linked)
  }

  // Exactly one language is marked current, and it is this file's own.
  const bolded = [...(bar ?? '').matchAll(/\*\*([^*]+)\*\*/g)].map(m => m[1])
  check(`  ${lang.file} 恰好标出一处当前语言`, bolded.length === 1, bolded.join(', '))
  check(`  ${lang.file} 标出的当前语言是自身`, bolded[0] === lang.label, `${bolded[0]} vs ${lang.label}`)

  // A language must not link to itself: that is what "current" means here.
  const selfLink = new RegExp(`\\]\\(${lang.file.replace('.', '\\.')}\\)`).test(bar ?? '')
  check(`  ${lang.file} 未把自身作为链接`, !selfLink)
}

// ── links to files that do not exist are reported, not silently broken ─────
for (const lang of present) {
  const bar = languageBar(sources.get(lang.file)) ?? ''
  for (const match of bar.matchAll(/\]\(([^)]+)\)/g)) {
    const target = match[1]
    if (target.startsWith('http')) continue
    const exists = fs.existsSync(path.join(repo, target))
    if (!exists) {
      console.log(`  NOTE ${lang.file} 指向尚未创建的文件：${target}`)
    }
  }
}

console.log(failures === 0 ? '\n=== README 语言栏校验通过 ===' : `\n=== ${failures} 项失败 ===`)
process.exitCode = failures === 0 ? 0 : 1
