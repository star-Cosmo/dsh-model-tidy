import fs from 'node:fs'

// Confirm the model picker's provider groups come from `listProviders()` in
// array order, so wrapping that method really reorders the channels a user sees.
const asar = 'E:/AI agent/DeepseekHarness/resources/app.asar'
const fd = fs.openSync(asar, 'r')
const head = Buffer.alloc(16)
fs.readSync(fd, head, 0, 16, 0)
const headerSize = head.readUInt32LE(12)
const jsonBuf = Buffer.alloc(headerSize)
fs.readSync(fd, jsonBuf, 0, headerSize, 16)
const tree = JSON.parse(jsonBuf.toString('utf8'))
const base = 16 + headerSize
const offsetBase = base % 4 === 0 ? base : base + (4 - base % 4)

function find(path) {
  const parts = path.split('/').filter(Boolean)
  let node = tree
  for (const part of parts) {
    if (!node.files || !node.files[part]) return null
    node = node.files[part]
  }
  return node
}

function read(path) {
  const entry = find(path)
  if (!entry || entry.files) return null
  const at = offsetBase + Number(entry.offset)
  if (!Number.isFinite(at)) return null
  const handle = fs.openSync(asar, 'r')
  const buf = Buffer.alloc(entry.size)
  fs.readSync(handle, buf, 0, entry.size, at)
  fs.closeSync(handle)
  return buf.toString('utf8')
}

/** Walk the archive looking for the catalogue builder. */
const walk = (node, prefix = '', depth = 0) => {
  const out = []
  if (depth > 12 || !node.files) return out
  for (const [name, child] of Object.entries(node.files)) {
    const path = `${prefix}/${name}`
    if (child.files) out.push(...walk(child, path, depth + 1))
    else if (/model.?catalog|catalog/i.test(path) && path.endsWith('.js')) out.push(path)
  }
  return out
}

const candidates = walk(tree)
console.log('候选文件:', candidates.slice(0, 20).join('\n  '))

for (const path of candidates) {
  const src = read(path)
  if (!src) continue
  const i = src.indexOf('listProviders')
  if (i === -1) continue
  console.log(`\n=== ${path} ===`)
  console.log(src.slice(Math.max(0, i - 800), i + 1000))
  break
}
fs.closeSync(fd)
