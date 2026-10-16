/**
 * Checks the host half's catalogue filter.
 *
 * The host half is the part that actually decides what the selector sees, so
 * these assertions are about behaviour rather than wiring: that a hidden model
 * leaves the catalogue, that an alias replaces the advertised name, that the
 * two are keyed independently per provider, and that unmounting restores the
 * prototype method exactly as it was found.
 *
 * The plugin is loaded as a real ES module and handed a fake `llm` service —
 * the same shape `ctx.llm` has — with `listModels` on the prototype, because
 * the override under test is an own property on the instance.
 */
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const plugin = await import(new URL('../lib/index.js', import.meta.url).href)

let failures = 0
function check(label, ok) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) failures += 1
}

/** A catalogue double: models live on the instance, listModels on the prototype. */
function makeCatalogue(seed) {
  class FakeLlm {
    async listModels(provider) {
      return (seed[provider] ?? []).map(model => ({ ...model }))
    }
  }
  return new FakeLlm()
}

/** The volatile field wrapper the loader hands to `apply`. */
const live = rows => ({ get: () => rows })

/** A minimal plugin context; effects are collected so they can be disposed. */
function makeCtx(llm) {
  const disposers = []
  return {
    llm,
    fiber: {},
    disposers,
    inject: () => {},
    effect: fn => {
      const dispose = fn()
      if (typeof dispose === 'function') disposers.push(dispose)
    },
  }
}

const seed = {
  workbuddy: [
    { id: 'gemini-3.8-flash', name: 'gemini-3.8-flash' },
    { id: 'deepseek-v4.1-flash', name: 'deepseek-v4.1-flash' },
    { id: 'grok-4.7', name: 'grok-4.7' },
  ],
  gemini: [{ id: 'gemini-3.8-flash', name: 'gemini-3.8-flash' }],
}

// ── 1. exports ──────────────────────────────────────────────────────────────
check('导出 name', plugin.name === 'dsh-model-tidy')
check('inject 含 llm', Array.isArray(plugin.inject) && plugin.inject.includes('llm'))
check('导出 Config schema', typeof plugin.Config === 'function')
check('导出 apply', typeof plugin.apply === 'function')

const resolved = plugin.Config({})
check('Config 默认 hidden 为空', Array.isArray(resolved.hidden?.get?.() ?? resolved.hidden))
check('Config 默认 renamed 为空', Array.isArray(resolved.renamed?.get?.() ?? resolved.renamed))

// ── 2. hiding ───────────────────────────────────────────────────────────────
{
  const llm = makeCatalogue(seed)
  const ctx = makeCtx(llm)
  plugin.apply(ctx, { hidden: live([{ provider: 'workbuddy', model: 'grok-4.7', name: 'grok-4.7' }]), renamed: live([]) })
  const rows = await llm.listModels('workbuddy')
  check('隐藏的模型从目录消失', !rows.some(r => r.id === 'grok-4.7'))
  check('同渠道其他模型不受影响', rows.length === 2)
  check(
    '另一个渠道的模型仍可见',
    (await llm.listModels('gemini')).some(r => r.id === 'gemini-3.8-flash'),
  )
}

// ── 3. renaming ─────────────────────────────────────────────────────────────
{
  const llm = makeCatalogue(seed)
  const ctx = makeCtx(llm)
  plugin.apply(ctx, {
    hidden: live([]),
    renamed: live([{ provider: 'workbuddy', model: 'gemini-3.8-flash', alias: 'DS 快' }]),
  })
  const rows = await llm.listModels('workbuddy')
  check('备注名替换显示名', rows.find(r => r.id === 'gemini-3.8-flash')?.name === 'DS 快')
  check('路由 id 不变', rows.find(r => r.id === 'gemini-3.8-flash')?.id === 'gemini-3.8-flash')
  check('未备注的模型保持原名', rows.find(r => r.id === 'deepseek-v4.1-flash')?.name === 'deepseek-v4.1-flash')
}

// ── 4. the same model on two routes ─────────────────────────────────────────
{
  const llm = makeCatalogue(seed)
  const ctx = makeCtx(llm)
  plugin.apply(ctx, {
    hidden: live([]),
    renamed: live([
      { provider: 'workbuddy', model: 'gemini-3.8-flash', alias: 'WB 版' },
      { provider: 'gemini', model: 'gemini-3.8-flash', alias: '谷歌版' },
    ]),
  })
  check('workbuddy 上的同名模型用自己的备注', (await llm.listModels('workbuddy')).find(r => r.id === 'gemini-3.8-flash')?.name === 'WB 版')
  check('gemini 上的同名模型用自己的备注', (await llm.listModels('gemini')).find(r => r.id === 'gemini-3.8-flash')?.name === '谷歌版')
}

// ── 5. the returned objects are copies ──────────────────────────────────────
{
  const llm = makeCatalogue(seed)
  const ctx = makeCtx(llm)
  plugin.apply(ctx, { hidden: live([]), renamed: live([{ provider: 'workbuddy', model: 'grok-4.7', alias: '快' }]) })
  await llm.listModels('workbuddy')
  check('不会写回适配器自己的对象', seed.workbuddy.find(m => m.id === 'grok-4.7').name === 'grok-4.7')
}

// ── 6. empty state is a pass-through ────────────────────────────────────────
{
  const llm = makeCatalogue(seed)
  const ctx = makeCtx(llm)
  plugin.apply(ctx, { hidden: live([]), renamed: live([]) })
  const rows = await llm.listModels('workbuddy')
  check('无配置时不改变任何模型', rows.length === 3 && rows.every(r => r.name === r.id))
}

// ── 7. unmount restores the prototype method ────────────────────────────────
{
  const llm = makeCatalogue(seed)
  const ctx = makeCtx(llm)
  plugin.apply(ctx, { hidden: live([{ provider: 'workbuddy', model: 'grok-4.7', name: 'grok-4.7' }]), renamed: live([]) })
  check('挂载时隐藏生效', (await llm.listModels('workbuddy')).length === 2)
  for (const dispose of ctx.disposers) dispose()
  const after = await llm.listModels('workbuddy')
  check('卸载后模型全部回来', after.length === 3)
  check('卸载后没有遗留覆盖', !Object.prototype.hasOwnProperty.call(llm, 'listModels'))
}

// ── 8. edits take effect without remounting ─────────────────────────────────
{
  const llm = makeCatalogue(seed)
  const ctx = makeCtx(llm)
  let hidden = []
  let renamed = []
  plugin.apply(ctx, { hidden: { get: () => hidden }, renamed: { get: () => renamed } })
  check('初始无隐藏', (await llm.listModels('workbuddy')).length === 3)
  hidden = [{ provider: 'workbuddy', model: 'grok-4.7', name: 'grok-4.7' }]
  check('改动后立即生效', (await llm.listModels('workbuddy')).length === 2)
  hidden = []
  renamed = [{ provider: 'workbuddy', model: 'grok-4.7', alias: '快' }]
  check('清隐藏加备注后名称生效', (await llm.listModels('workbuddy')).find(r => r.id === 'grok-4.7')?.name === '快')
}

// ── 9. malformed rows do not break the filter ───────────────────────────────
{
  const llm = makeCatalogue(seed)
  const ctx = makeCtx(llm)
  plugin.apply(ctx, {
    hidden: live([{ provider: 'workbuddy' }, null, { model: 'x' }]),
    renamed: live([{ provider: 'workbuddy', model: 'grok-4.7', alias: '   ' }]),
  })
  const rows = await llm.listModels('workbuddy')
  check('缺字段的条目被跳过', rows.length === 3)
  check('空白备注不生效', rows.find(r => r.id === 'grok-4.7')?.name === 'grok-4.7')
}

// ── 10. the catalogue is read once per call ─────────────────────────────────
{
  let calls = 0
  class Counting {
    async listModels(provider) {
      calls += 1
      return (seed[provider] ?? []).map(m => ({ ...m }))
    }
  }
  const ctx = makeCtx(new Counting())
  plugin.apply(ctx, { hidden: live([]), renamed: live([]) })
  await ctx.llm.listModels('workbuddy')
  check('过滤不会重复查询上游', calls === 1)
}

console.log(failures === 0 ? '\n=== 全部通过 ===' : `\n=== ${failures} 项失败 ===`)
process.exitCode = failures === 0 ? 0 : 1
