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
  // asar stores offsets as numbers, but large entries come back as strings;
  // Number() normalises both, and NaN means an unreadable entry rather than a
  // crash halfway through a scan.
  const at = off + Number(e.offset)
  if (!Number.isFinite(at)) return null
  const f = fs.openSync(p, 'r')
  const b = Buffer.alloc(e.size)
  fs.readSync(f, b, 0, e.size, at)
  fs.closeSync(f)
  return b.toString('utf8')
}
function walk(node, path, out) {
  if (!node.files) return
  for (const [k, v] of Object.entries(node.files)) {
    const np = path + '/' + k
    if (v.files) walk(v, np, out)
    else out.push({ path: np, size: v.size, offset: v.offset })
  }
}

const all = []
walk(tree, '', all)
console.log('asar 文件总数:', all.length)

const hits = []
for (const entry of all) {
  if (!entry.path.endsWith('.js') || entry.size < 2000) continue
  if (!/dsh-/.test(entry.path)) continue
  const s = read(entry.path)
  if (s && s.includes('modelCatalog')) hits.push(entry.path)
}
console.log('')
console.log('=== 含 modelCatalog 的文件 ===')
console.log(hits.join('\n'))
