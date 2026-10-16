import fs from 'node:fs'

const p = 'E:\\AI agent\\DeepseekHarness\\resources\\app.asar'
const fd = fs.openSync(p, 'r')
const head = Buffer.alloc(16)
fs.readSync(fd, head, 0, 16, 0)
const hsize = head.readUInt32LE(12)
const jb = Buffer.alloc(hsize)
fs.readSync(fd, jb, 0, hsize, 16)
const tree = JSON.parse(jb.toString('utf8'))
const base = 16 + hsize
const off = base % 4 === 0 ? base : base + (4 - base % 4)

function find(path) {
  const ps = path.split('/').filter(Boolean)
  let n = tree
  for (const s of ps) {
    if (!n.files || !n.files[s]) return null
    n = n.files[s]
  }
  return n
}
function read(path) {
  const e = find(path)
  if (!e || e.files) return null
  const at = off + Number(e.offset)
  if (!Number.isFinite(at)) return null
  const f = fs.openSync(p, 'r')
  const b = Buffer.alloc(e.size)
  fs.readSync(f, b, 0, e.size, at)
  fs.closeSync(f)
  return b.toString('utf8')
}

const s = read('/dsh/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js')

// The method body follows the decorator metadata: look for "async modelCatalog"
console.log('=== modelCatalog 方法体 ===')
for (const pattern of ['async modelCatalog', 'modelCatalog(', 'modelCatalog =', 'modelCatalog()']) {
  const i = s.indexOf(pattern)
  if (i === -1) {
    console.log(`[${pattern}] 未找到`)
    continue
  }
  console.log(`\n[${pattern}] @${i}`)
  console.log(s.slice(i, i + 1200))
  break
}

console.log('')
console.log('=== 该文件对 llm 的使用 ===')
for (const kw of ['llm.listModels', 'llm.listProviders', '.listModels(', 'ctx.llm', 'llm:']) {
  const idx = []
  let i = -1
  while ((i = s.indexOf(kw, i + 1)) !== -1 && idx.length < 3) idx.push(i)
  console.log(`\n[${kw}] ${idx.length} 处`)
  for (const at of idx) console.log('  ', JSON.stringify(s.slice(Math.max(0, at - 200), at + 250)))
}
