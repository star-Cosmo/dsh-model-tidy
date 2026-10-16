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

const target = '/dsh/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js'
const s = read(target)
console.log('文件长度:', s.length)

// Where does the catalogue come from?
console.log('')
console.log('=== modelCatalog 的实现 ===')
let i = s.indexOf('modelCatalog')
let n = 0
while (i !== -1 && n < 3) {
  console.log(`\n--- 命中 ${n + 1} @${i} ---`)
  console.log(s.slice(Math.max(0, i - 500), i + 900))
  i = s.indexOf('modelCatalog', i + 1)
  n++
}

console.log('')
console.log('=== 该文件是否引用 llm 服务 ===')
for (const kw of ['ctx.llm', 'this.llm', 'listModels', 'listProviders', "inject"]) {
  const at = s.indexOf(kw)
  console.log(`${kw}: ${at === -1 ? '未出现' : '出现 @' + at}`)
}
