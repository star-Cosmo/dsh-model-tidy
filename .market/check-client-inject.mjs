/**
 * Verify the client-side module list in package.json names real packages.
 *
 * `dsh.client.inject` is the browser half's dependency declaration. A name
 * that does not exist makes the loader fail the entry outright — the section
 * simply never appears, with no obvious symptom. So the list is worth checking
 * against the harness rather than trusting it.
 *
 * Run: node .market/check-client-inject.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'))

let failures = 0
const check = (label, ok, extra = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`)
  if (!ok) failures += 1
}

const inject = pkg.dsh?.client?.inject ?? []
check('声明了 client.platform', pkg.dsh?.client?.platform === 'web', pkg.dsh?.client?.platform)
check('inject 是非空数组', Array.isArray(inject) && inject.length > 0)

// Which client halves ship in the harness?
const asar = 'E:\\AI agent\\DeepseekHarness\\resources\\app.asar'
const fd = fs.openSync(asar, 'r')
const head = Buffer.alloc(16)
fs.readSync(fd, head, 0, 16, 0)
const hsize = head.readUInt32LE(12)
const jb = Buffer.alloc(hsize)
fs.readSync(fd, jb, 0, hsize, 16)
const tree = JSON.parse(jb.toString('utf8'))

const shipped = new Set()
function walk(node, prefix) {
  if (!node.files) return
  for (const [k, v] of Object.entries(node.files)) {
    const np = prefix ? `${prefix}/${k}` : k
    if (v.files) {
      if (k === 'client.js' || k === 'index.js') shipped.add(prefix)
      walk(v, np)
    }
  }
}
walk(tree, '')

// Normalise: strip the '/lib' or '/lib/client.js' tail so a package name can
// be compared against what the asar holds. `shipped` holds directory paths
// like '/dsh/node_modules/@deepseek-ai/dsh-api-remotes/lib', so match on the
// prefix rather than expecting a trailing 'client.js' at that exact level.
const packages = new Set()
function collect(node, prefix) {
  if (!node.files) return
  for (const [k, v] of Object.entries(node.files)) {
    const np = `${prefix}/${k}`
    if (v.files) {
      const m = /^\/(?:dsh\/)?node_modules\/(@[^/]+\/[^/]+|[^/]+)$/.exec(np)
      if (m) packages.add(m[1])
      collect(v, np)
    }
  }
}
collect(tree, '')

console.log(`  宿主内可见的包: ${packages.size} 个`)

for (const name of inject) {
  check(`声明的依赖存在: ${name}`, packages.has(name), packages.has(name) ? '' : '未在 asar 中找到')
}

// The plugin's own runtime imports must also be satisfiable: the browser half
// requires 'react' from the shell, and the host half imports schemastery.
const host = fs.readFileSync(path.join(repo, 'lib', 'index.js'), 'utf8')
const hostImports = [...host.matchAll(/from '([^']+)'/g)].map(m => m[1])
check('宿主半只导入 schemastery', hostImports.every(i => i === '@deepseek-ai/schemastery'), hostImports.join(', '))
check('schemastery 在 dependencies', Boolean(pkg.dependencies?.['@deepseek-ai/schemastery']))

const client = fs.readFileSync(path.join(repo, 'lib', 'client.js'), 'utf8')
const requires = [...client.matchAll(/require\('([^']+)'\)/g)].map(m => m[1])
const uniqueRequires = [...new Set(requires)]
check('浏览器半只 require react', uniqueRequires.every(r => r === 'react'), uniqueRequires.join(', '))

// Framework packages that the harness provides belong in peerDependencies per
// the marketplace guidance. `schemastery` is a direct dependency on purpose:
// it is a small standalone library the host half imports itself, whereas the
// dsh-* runtime packages are supplied by the harness.
const peer = pkg.peerDependencies ?? {}
check('cordis 在 peerDependencies', Boolean(peer['@deepseek-ai/cordis']), JSON.stringify(peer))

console.log(failures === 0 ? '\n=== 客户端依赖声明验证通过 ===' : `\n=== ${failures} 项失败 ===`)
process.exitCode = failures === 0 ? 0 : 1
