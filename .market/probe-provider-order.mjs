import fs from 'node:fs'

// Provider order: which call decides the order of providers in the model
// selector? `buildModelCatalog` composes the picker's groups from
// `listProviders()`, so that is the seam to inspect.
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

const llm = read('/dsh/node_modules/@deepseek-ai/dsh-llm/lib/index.js')
const at = llm.indexOf('listProviders(')
console.log('=== listProviders 定义 ===')
console.log(llm.slice(Math.max(0, at - 600), at + 900))

// And how the picker builds groups from it.
const candidates = [
  '/dsh/node_modules/@deepseek-ai/dsh-model-catalog/lib/index.js',
  '/dsh/node_modules/@deepseek-ai/dsh-client-ui-model-catalog/lib/client.js',
]
for (const path of candidates) {
  const src = read(path)
  if (!src) continue
  const i = src.indexOf('listProviders')
  if (i === -1) continue
  console.log(`\n=== ${path} @${i} ===`)
  console.log(src.slice(Math.max(0, i - 700), i + 900))
}
fs.closeSync(fd)
