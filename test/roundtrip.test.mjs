/**
 * End-to-end exercise of the round trip a single switch performs.
 *
 * The user reports that hiding ONE model does nothing at all, while the batch
 * buttons work. That difference is the clue: both call `apply`, so the fault
 * must be in what `apply` derives — `stateOf(rows)` — or in how the host reads
 * the document back.
 *
 * This test drives the real controller against a host that behaves like the
 * real one: the catalogue it serves is FILTERED by the hidden list, exactly as
 * the plugin's own host half filters `llm.listModels`. So a hidden model is
 * absent from the next catalogue read and can only be reconstructed from the
 * saved snapshot. Any round trip that loses the snapshot loses the row.
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
    useState: v => { const i = cursor++; if (hooks.length <= i) hooks[i] = v; return [hooks[i], nv => { hooks[i] = nv }] },
    useRef: v => { const i = cursor++; if (hooks.length <= i) hooks[i] = { current: v }; return hooks[i] },
    useMemo: fn => { cursor++; return fn() },
    useCallback: fn => { cursor++; return fn },
    useEffect: fn => { cursor++ },
    useSyncExternalStore: (_s, snap) => { cursor++; return snap() },
  }
}

/** The full catalogue, before any filtering. */
const FULL = [
  { provider: 'workbuddy', name: 'WorkBuddy', models: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] },
  { provider: 'gemini', name: 'Gemini', models: [{ id: 'g', name: 'G' }] },
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

  // The host filters the catalogue the way the plugin's own host half does:
  // a hidden model is simply not advertised any more.
  const hiddenKeys = new Set()
  const readCatalog = async () => {
    const hidden = new Set((stored.hidden ?? []).map(h => `${h.provider}\u0000${h.model}`))
    return FULL.map(group => ({
      id: group.provider,
      name: group.name,
      models: group.models
        .filter(m => !hidden.has(`${group.provider}\u0000${m.id}`))
        .map(m => ({ ...m })),
    }))
  }
  void hiddenKeys

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
    remote: { session: { modelCatalog: async () => ({ ok: true, value: { groups: await readCatalog() } }) }, $on: () => () => {} },
  }
  exports.apply(ctx)
  return { controller: mounted.d.inject().controller, form }
}

const shape = c => c.store.rows.map(r => `${r.provider}/${r.model}:${r.hidden ? 'H' : 'V'}`).join(' ')

// ── A. hide one model, read the document back ───────────────────────────────
{
  const { controller, form } = mount()
  await controller.load()
  check('初始三行都可见', shape(controller) === 'workbuddy/a:V workbuddy/b:V gemini/g:V', shape(controller))

  controller.toggle('workbuddy\u0000a', true)
  await controller.flush()

  const hidden = form.stored.hidden ?? []
  check('单个隐藏写入了宿主', hidden.length === 1, JSON.stringify(hidden))
  check('写入的是正确的模型', hidden[0]?.model === 'a' && hidden[0]?.provider === 'workbuddy', JSON.stringify(hidden[0]))
  check('写入带上了快照名', hidden[0]?.name === 'A', String(hidden[0]?.name))
}

// ── B. hide two models, one at a time ───────────────────────────────────────
{
  const { controller, form } = mount()
  await controller.load()
  controller.toggle('workbuddy\u0000a', true)
  await controller.flush()
  controller.toggle('workbuddy\u0000b', true)
  await controller.flush()
  const hidden = (form.stored.hidden ?? []).map(h => h.model).sort()
  check('连续隐藏两个模型都写入', JSON.stringify(hidden) === JSON.stringify(['a', 'b']), JSON.stringify(hidden))
}

// ── C. unhide one, then hide another ────────────────────────────────────────
{
  const { controller, form } = mount()
  await controller.load()
  controller.toggle('workbuddy\u0000a', true)
  await controller.flush()
  controller.toggle('workbuddy\u0000a', false)
  await controller.flush()
  check('隐藏后立刻恢复也写入', (form.stored.hidden ?? []).length === 0, JSON.stringify(form.stored.hidden))
}

// ── D. a full reload reconstructs the hidden row from the snapshot ──────────
// This is the case that depends on `name` being carried in the saved entry.
{
  const { controller, form } = mount()
  await controller.load()
  controller.toggle('workbuddy\u0000a', true)
  await controller.flush()

  // The catalogue no longer advertises 'a'; only the snapshot can bring it back.
  await controller.load()
  const rowA = controller.store.rows.find(r => r.model === 'a')
  check('隐藏的模型仍出现在列表里', Boolean(rowA), shape(controller))
  check('该行标记为隐藏', rowA?.hidden === true)
  check('该行沿用快照名', rowA?.name === 'A', String(rowA?.name))
  check('该行被标记为快照行', rowA?.stale === true)
}

// ── E. the same, but through the aliases field ──────────────────────────────
{
  const { controller, form } = mount()
  await controller.load()
  controller.setAlias('workbuddy\u0000a', '别名叫法')
  await controller.flush()
  check('备注写入宿主', (form.stored.renamed ?? [])[0]?.alias === '别名叫法', JSON.stringify(form.stored.renamed))
  await controller.load()
  check('重载后备注仍在', controller.store.rows.find(r => r.model === 'a')?.alias === '别名叫法')
}

console.log(failures === 0 ? '\n=== 全部通过 ===' : `\n=== ${failures} 项失败 ===`)
process.exitCode = failures === 0 ? 0 : 1
