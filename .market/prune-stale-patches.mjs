/**
 * Remove patch entries that reference plugins which are no longer installed.
 *
 * Why this matters: `cordis.patch.yml` is the profile's own overlay. When a
 * plugin is removed, its entry is left behind — the patch layer is not
 * rewritten by the plugin manager's uninstall path for third-party entries.
 * A patch row naming a package that is not in node_modules cannot be composed,
 * and the settings section that never appears is a hard symptom to diagnose.
 *
 * The script is deliberately conservative: it only drops rows whose `name` is a
 * third-party package (not `@deepseek-ai/*`, which ships with the harness) and
 * that is absent from the profile's node_modules. Everything else — comments,
 * order, config bodies — is preserved byte for byte.
 *
 * Run:
 *   node .market/prune-stale-patches.mjs "E:\AI agent\DeepseekHarness\dsh-data\.dsh\profiles\desktop"
 */
import fs from 'node:fs'
import path from 'node:path'

const profile = process.argv[2]
if (!profile) {
  console.error('prune-stale-patches: pass the profile directory')
  process.exit(1)
}

const patchFile = path.join(profile, 'cordis.patch.yml')
if (!fs.existsSync(patchFile)) {
  console.error(`prune-stale-patches: no ${patchFile}`)
  process.exit(1)
}

const text = fs.readFileSync(patchFile, 'utf8')
const lines = text.split('\n')

/** A row starts at `- id: x` and runs until the next top-level `- id:`. */
const starts = []
for (let i = 0; i < lines.length; i++) {
  if (/^- id:/.test(lines[i])) starts.push(i)
}
if (starts.length === 0) {
  console.log('prune-stale-patches: no entries found')
  process.exit(0)
}

const blocks = starts.map((start, index) => {
  const end = index + 1 < starts.length ? starts[index + 1] : lines.length
  return { start, end, body: lines.slice(start, end) }
})

const keep = []
const dropped = []

for (const block of blocks) {
  const idLine = block.body[0].replace(/^- id:\s*/, '').trim()
  const nameLine = block.body.find(l => /^\s+name:/.test(l))
  const name = nameLine ? nameLine.replace(/^\s+name:\s*/, '').trim().replace(/^["']|["']$/g, '') : ''

  const isFramework = name.startsWith('@deepseek-ai/')
  const installed = name !== '' && fs.existsSync(path.join(profile, 'node_modules', name))

  if (!isFramework && !installed) {
    dropped.push({ id: idLine, name })
    continue
  }
  keep.push(block)
}

if (dropped.length === 0) {
  console.log('prune-stale-patches: nothing to drop')
  process.exit(0)
}

// Rebuild: the header comment lines before the first entry, then the kept blocks.
const header = lines.slice(0, blocks[0].start)
const rebuilt = [...header, ...keep.flatMap(b => b.body)].join('\n')

// Collapse a trailing run of blank lines to exactly one, so repeated runs stay
// idempotent rather than growing the file by a newline each time.
const normalised = rebuilt.replace(/\n+$/, '\n')

fs.writeFileSync(patchFile, normalised, 'utf8')

console.log('prune-stale-patches: dropped')
for (const d of dropped) console.log(`  - ${d.id} (${d.name})`)
console.log(`kept ${keep.length} entries`)
