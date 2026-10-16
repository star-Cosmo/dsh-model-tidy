// Verify the profile can actually compose this bundle, the way the harness and
// the marketplace CI do: the dependency resolves, package.json declares
// `dsh.bundle`, the referenced patch file exists and targets this package, and
// the host half imports cleanly from the installed location.
//
// Run from the profile root:
//   node <repo>/test/install-check.mjs
import fs from 'node:fs'
import path from 'node:path'

const profile = process.argv[2] ?? process.cwd()
const pkgPath = path.join(profile, 'node_modules', 'dsh-model-tidy', 'package.json')

let failures = 0
const check = (label, ok, extra = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`)
  if (!ok) failures += 1
}

// ── 1. the package is present and resolves ─────────────────────────────────
check('包已安装到 profile', fs.existsSync(pkgPath), pkgPath)
if (!fs.existsSync(pkgPath)) {
  console.log('\n=== 安装缺失，无法继续 ===')
  process.exit(1)
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
check('包名正确', pkg.name === 'dsh-model-tidy', pkg.name)
check('声明 dsh.bundle（市场 CI 硬性要求）', Boolean(pkg.dsh?.bundle?.patch), JSON.stringify(pkg.dsh?.bundle))
check('声明 dsh.client 平台为 web', pkg.dsh?.client?.platform === 'web')
check('main 指向存在的文件', fs.existsSync(path.join(path.dirname(pkgPath), pkg.main)), pkg.main)
check('exports 暴露 ./client', Boolean(pkg.exports?.['./client']?.default))

// ── 2. the bundle patch exists and targets this package ────────────────────
const patchRel = pkg.dsh?.bundle?.patch
const patchPath = patchRel ? path.join(path.dirname(pkgPath), patchRel) : ''
check('cordis.patch.yml 存在', Boolean(patchPath) && fs.existsSync(patchPath), patchRel)
if (patchPath && fs.existsSync(patchPath)) {
  const patch = fs.readFileSync(patchPath, 'utf8')
  check('补丁 insert 了本包', patch.includes('dsh-model-tidy'))
  check('补丁未引用其他包', !/name:\s*(?!dsh-model-tidy)\S/.test(patch.replace(/#[^\n]*/g, '')))
}

// ── 3. the profile lists it as a bundle ────────────────────────────────────
const profilePkg = JSON.parse(fs.readFileSync(path.join(profile, 'package.json'), 'utf8'))
const bundles = profilePkg.dsh?.profile?.bundles ?? []
check('profile 的 bundles 已包含本包', bundles.includes('dsh-model-tidy'), bundles.length + ' 个 bundle')
check('profile 的 dependencies 已包含本包', Boolean(profilePkg.dependencies?.['dsh-model-tidy']))
check('旧的 dsh-model-visibility 已从 bundles 移除', !bundles.includes('dsh-model-visibility'))
check('旧的 dsh-model-visibility 已从 dependencies 移除', !profilePkg.dependencies?.['dsh-model-visibility'])

// ── 4. the host half imports and filters ───────────────────────────────────
const mod = await import('dsh-model-tidy')
check('可被 import', Boolean(mod))
check('导出 name', mod.name === 'dsh-model-tidy')
check('导出 apply', typeof mod.apply === 'function')
check('导出 Config', typeof mod.Config === 'function')
check('inject 含 llm', mod.inject?.includes('llm') === true)

class FakeLlm {
  async listModels(provider) {
    return [
      { id: 'visible', name: 'visible', provider },
      { id: 'hidden', name: 'hidden', provider },
    ]
  }
}
const llm = new FakeLlm()
const disposers = []
mod.apply(
  { llm, fiber: {}, inject: () => {}, effect: fn => { const d = fn(); if (typeof d === 'function') disposers.push(d) } },
  {
    hidden: { get: () => [{ provider: 'p', model: 'hidden', name: 'hidden' }] },
    renamed: { get: () => [{ provider: 'p', model: 'visible', alias: '显示名' }] },
  },
)
const rows = await llm.listModels('p')
check('隐藏生效', !rows.some(r => r.id === 'hidden'))
check('改名生效', rows.find(r => r.id === 'visible')?.name === '显示名')
for (const d of disposers) d()
check('卸载后还原', (await llm.listModels('p')).length === 2)

// ── 5. the browser half is a loader factory ────────────────────────────────
const clientPath = path.join(path.dirname(pkgPath), pkg.exports['./client'].default)
const clientSrc = fs.readFileSync(clientPath, 'utf8')
check('浏览器半使用 __ModuleLoader__.load', clientSrc.includes('__ModuleLoader__.load'))
check('浏览器半 require react', clientSrc.includes("require('react')"))
check('浏览器半声明 id', clientSrc.includes("id: 'dsh-model-tidy'"))
check('浏览器半不访问网络', !/fetch\(|XMLHttpRequest|WebSocket/.test(clientSrc))

console.log(failures === 0 ? '\n=== 安装与组合验证通过 ===' : `\n=== ${failures} 项失败 ===`)
process.exitCode = failures === 0 ? 0 : 1
