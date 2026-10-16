/**
 * The browser half must capture the vendor suffix when a rename is written.
 *
 * The host half puts `alias` and `suffix` back together, but it can only do that
 * with a suffix it was given: the settings document stores the pair, and the
 * catalogue name it reads later already reads `alias · suffix`, so a second
 * derivation would double the suffix. Capturing happens here, at rename time.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(here, '..')
const source = fs.readFileSync(path.join(repo, 'lib', 'client.js'), 'utf8')

let failures = 0
const check = (label, ok, extra = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`)
  if (!ok) failures += 1
}

function makeReact() {
  const hooks = []
  let cursor = 0
  return {
    createElement: (tag, props, ...children) => ({ tag, props: props ?? {}, children: children.flat() }),
    createPortal: (node, container) => ({ tag: '#portal', props: { container }, children: [node] }),
    useState: v => { const i = cursor++; if (hooks.length <= i) hooks[i] = v; return [hooks[i], nv => { hooks[i] = typeof nv === 'function' ? nv(hooks[i]) : nv }] },
    useRef: v => { const i = cursor++; if (hooks.length <= i) hooks[i] = { current: v }; return hooks[i] },
    useMemo: fn => { cursor++; return fn() },
    useCallback: fn => { cursor++; return fn },
    useEffect: fn => { cursor++; const c = fn(); return typeof c === 'function' ? c : () => {} },
    useSyncExternalStore: (_s, snap) => { cursor++; return snap() },
  }
}

/** One provider whose models carry the shapes real catalogues produce. */
const CATALOGUE = [
  {
    id: 'workbuddy',
    name: 'WorkBuddy',
    models: [
      { id: 'glm', name: 'GLM-5.3 · x0.79' },
      { id: 'promo', name: 'GLM-5.2 · x0.79 · 夜间折扣' },
      { id: 'auto', name: 'Auto' },
    ],
  },
]

function mount() {
  let stored = { hidden: [], renamed: [] }
  const listeners = new Set()

  const form = {
    getSnapshot: () => ({ status: 'ready', value: structuredClone(stored), writable: true, mode: 'host' }),
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async set(field, value) {
      stored = { ...stored, [field]: structuredClone(value) }
      for (const listener of [...listeners]) listener()
      return true
    },
    get stored() {
      return stored
    },
  }

  let descriptor = null
  const win = { __ModuleLoader__: { load: d => { descriptor = d } } }
  new Function('window', source)(win)
  const exports = descriptor.factory(spec => {
    if (spec === 'react') return makeReact()
    throw new Error(spec)
  })

  let mounted = null
  const ctx = {
    effect: fn => { fn() },
    locale: { register: () => {}, bind: () => key => key },
    configForms: { get: () => form, whileServed: (_ns, fn) => fn() },
    slots: { inject: (_n, fn) => fn(), register: (d, c) => { mounted = { d, c }; return () => {} } },
    remote: {
      // The catalogue the browser half reads. It is NOT filtered by renames —
      // only by the hidden list — which is why the suffix must be captured from
      // it before the rename lands.
      session: { modelCatalog: async () => ({ ok: true, value: { groups: CATALOGUE.map(g => ({ ...g, models: g.models.map(m => ({ ...m })) })) } }) },
      $on: () => () => {},
    },
  }
  exports.apply(ctx)
  return { controller: mounted.d.inject().controller, form }
}

// ── 1. a rename records the suffix alongside the alias ─────────────────────
{
  const m = mount()
  await m.controller.load()
  await m.controller.setAlias('workbuddy', 'glm', 'GLM 便宜')
  const entry = (m.form.stored.renamed ?? [])[0]
  check('备注条目已写入', entry !== undefined)
  check('别名正确', entry?.alias === 'GLM 便宜', String(entry?.alias))
  check('后缀被一并记录', entry?.suffix === 'x0.79', String(entry?.suffix))
}

// ── 2. a multi-part suffix is recorded whole ───────────────────────────────
{
  const m = mount()
  await m.controller.load()
  await m.controller.setAlias('workbuddy', 'promo', '促销款')
  const entry = (m.form.stored.renamed ?? [])[0]
  check('多段后缀整体记录', entry?.suffix === 'x0.79 · 夜间折扣', String(entry?.suffix))
}

// ── 3. a model with no rate records no suffix ──────────────────────────────
{
  const m = mount()
  await m.controller.load()
  await m.controller.setAlias('workbuddy', 'auto', '自动')
  const entry = (m.form.stored.renamed ?? [])[0]
  check('无倍率时不写 suffix 字段', entry !== undefined && entry.suffix === undefined, JSON.stringify(entry))
}

// ── 4. clearing the alias removes the entry, suffix included ───────────────
{
  const m = mount()
  await m.controller.load()
  await m.controller.setAlias('workbuddy', 'glm', 'GLM 便宜')
  await m.controller.setAlias('workbuddy', 'glm', '')
  check('清空备注后条目被移除', (m.form.stored.renamed ?? []).length === 0, JSON.stringify(m.form.stored.renamed))
}

// ── 5. re-saving the same model does not stack suffixes ───────────────────
// The catalogue the browser reads is not rewritten by the plugin's own rename,
// so the suffix captured is always the vendor's own. This asserts the entry set
// stays at one per model, which is what makes that safe.
{
  const m = mount()
  await m.controller.load()
  await m.controller.setAlias('workbuddy', 'glm', '第一次')
  await m.controller.setAlias('workbuddy', 'glm', '第二次')
  const entries = m.form.stored.renamed ?? []
  check('同一模型只保留一条记录', entries.length === 1, JSON.stringify(entries))
  check('记录的是最新别名', entries[0]?.alias === '第二次', String(entries[0]?.alias))
  check('后缀未被叠加', entries[0]?.suffix === 'x0.79', String(entries[0]?.suffix))
}

// ── 6. the row carries what the host will publish ─────────────────────────
{
  const m = mount()
  await m.controller.load()
  await m.controller.setAlias('workbuddy', 'glm', 'GLM 便宜')
  let row = null
  for (const group of m.controller.state?.groups ?? []) {
    row = group.rows.find(r => r.model === 'glm') ?? row
  }
  check('行上带出别名', row?.alias === 'GLM 便宜', String(row?.alias))
  // The row's `name` is the catalogue's own name; the composed name is the host
  // half's job, and rate.test.mjs covers that end.
  check('行保留目录原名（供展示原值）', row?.name === 'GLM-5.3 · x0.79', String(row?.name))
}

console.log(failures === 0 ? '\n=== 全部通过 ===' : `\n=== ${failures} 项失败 ===`)
process.exitCode = failures === 0 ? 0 : 1
