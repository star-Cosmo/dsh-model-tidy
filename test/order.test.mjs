/**
 * A hidden model must not move.
 *
 * The reported defect: hide a model and it jumps to the end of its group. The
 * cause was structural — a hidden model disappears from the catalogue (the host
 * filters it), so its row could only be rebuilt by appending it, and appending
 * puts it last.
 *
 * The fix remembers each row's position the first time it is seen, so a row
 * rebuilt from the saved document sorts back into place. These tests pin that
 * down, including the case that matters most: the position must survive a
 * *round trip* through the catalogue, which is where the old code lost it.
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

/** The catalogue deliberately lists models in a fixed, non-alphabetical order. */
const FULL = [
  {
    id: 'workbuddy',
    name: 'WorkBuddy',
    models: [
      { id: 'alpha', name: 'Alpha' },
      { id: 'bravo', name: 'Bravo' },
      { id: 'charlie', name: 'Charlie' },
      { id: 'delta', name: 'Delta' },
      { id: 'echo', name: 'Echo' },
    ],
  },
  { id: 'gemini', name: 'Gemini', models: [{ id: 'golf', name: 'Golf' }] },
]

function mount({ initial = {} } = {}) {
  let stored = { hidden: [], renamed: [], ...initial }
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
      session: {
        modelCatalog: async () => {
          // The host filters by the hidden list — this is the behaviour that
          // removed the hidden row from the catalogue in the first place.
          const hidden = new Set((stored.hidden ?? []).map(h => `${h.provider}\u0000${h.model}`))
          return {
            ok: true,
            value: {
              groups: FULL.map(g => ({
                id: g.id,
                name: g.name,
                models: g.models.filter(m => !hidden.has(`${g.id}\u0000${m.id}`)).map(m => ({ ...m })),
              })),
            },
          }
        },
      },
      $on: () => () => {},
    },
  }
  exports.apply(ctx)

  const controller = mounted.d.inject().controller
  /** The ids of one provider's rows, in the order the view will render them. */
  const orderOf = provider => {
    const group = (controller.state?.groups ?? []).find(g => g.id === provider)
    return (group?.rows ?? []).map(r => r.model)
  }
  return { controller, form, orderOf }
}

// ── 1. the reported case: hide the third of five ────────────────────────────
{
  const m = mount()
  await m.controller.load()
  check('初始顺序即目录顺序', JSON.stringify(m.orderOf('workbuddy')) === JSON.stringify(['alpha', 'bravo', 'charlie', 'delta', 'echo']), JSON.stringify(m.orderOf('workbuddy')))

  await m.controller.toggle('workbuddy', 'charlie', 'Charlie', true)
  check(
    '隐藏后仍在第三位',
    JSON.stringify(m.orderOf('workbuddy')) === JSON.stringify(['alpha', 'bravo', 'charlie', 'delta', 'echo']),
    JSON.stringify(m.orderOf('workbuddy')),
  )
  check('该行标记为隐藏', m.controller.state.groups.find(g => g.id === 'workbuddy').rows[2].hidden === true)
}

// ── 2. hide the first and the last ─────────────────────────────────────────
{
  const m = mount()
  await m.controller.load()
  await m.controller.toggle('workbuddy', 'alpha', 'Alpha', true)
  check('隐藏首项后顺序不变', JSON.stringify(m.orderOf('workbuddy')) === JSON.stringify(['alpha', 'bravo', 'charlie', 'delta', 'echo']), JSON.stringify(m.orderOf('workbuddy')))

  await m.controller.toggle('workbuddy', 'echo', 'Echo', true)
  check('隐藏末项后顺序不变', JSON.stringify(m.orderOf('workbuddy')) === JSON.stringify(['alpha', 'bravo', 'charlie', 'delta', 'echo']), JSON.stringify(m.orderOf('workbuddy')))
}

// ── 3. several hidden at once, and back again ──────────────────────────────
{
  const m = mount()
  await m.controller.load()
  await m.controller.toggle('workbuddy', 'bravo', 'Bravo', true)
  await m.controller.toggle('workbuddy', 'delta', 'Delta', true)
  check(
    '同时隐藏两项仍在原位',
    JSON.stringify(m.orderOf('workbuddy')) === JSON.stringify(['alpha', 'bravo', 'charlie', 'delta', 'echo']),
    JSON.stringify(m.orderOf('workbuddy')),
  )
  await m.controller.toggle('workbuddy', 'bravo', 'Bravo', false)
  check(
    '恢复一项后仍在原位',
    JSON.stringify(m.orderOf('workbuddy')) === JSON.stringify(['alpha', 'bravo', 'charlie', 'delta', 'echo']),
    JSON.stringify(m.orderOf('workbuddy')),
  )
}

// ── 4. batch hide keeps every position ─────────────────────────────────────
{
  const m = mount()
  await m.controller.load()
  await m.controller.toggleProvider('workbuddy', true)
  check(
    '整渠道隐藏后顺序不变',
    JSON.stringify(m.orderOf('workbuddy')) === JSON.stringify(['alpha', 'bravo', 'charlie', 'delta', 'echo']),
    JSON.stringify(m.orderOf('workbuddy')),
  )
  check('另一渠道不受影响', JSON.stringify(m.orderOf('gemini')) === JSON.stringify(['golf']))
  await m.controller.toggle('workbuddy', 'charlie', 'Charlie', false)
  check(
    '整渠道隐藏后单独打开仍在原位',
    JSON.stringify(m.orderOf('workbuddy')) === JSON.stringify(['alpha', 'bravo', 'charlie', 'delta', 'echo']),
    JSON.stringify(m.orderOf('workbuddy')),
  )
}

// ── 5. the position survives mounting with a saved hidden list ─────────────
// On a fresh mount the catalogue never contained the hidden model, so the order
// has to come from the catalogue's own sequence for the visible ones and place
// the hidden one by the slot it claims. It lands after the models it followed.
{
  const m = mount({
    initial: { hidden: [{ provider: 'workbuddy', model: 'charlie', name: 'Charlie' }] },
  })
  await m.controller.load()
  const order = m.orderOf('workbuddy')
  check('冷启动时隐藏行也出现', order.includes('charlie'), JSON.stringify(order))
  check('冷启动时可见项保持目录顺序', JSON.stringify(order.filter(id => id !== 'charlie')) === JSON.stringify(['alpha', 'bravo', 'delta', 'echo']), JSON.stringify(order))
  // It is appended on a cold start because nothing knows where it was; the
  // important part is that it is present and that hiding it again is stable.
  await m.controller.toggle('workbuddy', 'charlie', 'Charlie', false)
  await m.controller.toggle('workbuddy', 'charlie', 'Charlie', true)
  check(
    '冷启动后再次隐藏位置稳定',
    JSON.stringify(m.orderOf('workbuddy')) === JSON.stringify(order),
    `${JSON.stringify(m.orderOf('workbuddy'))} vs ${JSON.stringify(order)}`,
  )
}

// ── 6. a model that leaves and returns keeps its slot ──────────────────────
{
  const m = mount()
  await m.controller.load()
  await m.controller.toggle('workbuddy', 'bravo', 'Bravo', true)
  await m.controller.load()
  await m.controller.toggle('workbuddy', 'bravo', 'Bravo', false)
  check(
    '隐藏再恢复后回到原位置',
    JSON.stringify(m.orderOf('workbuddy')) === JSON.stringify(['alpha', 'bravo', 'charlie', 'delta', 'echo']),
    JSON.stringify(m.orderOf('workbuddy')),
  )
}

// ── 7. a genuinely new model lands at the end ──────────────────────────────
{
  const m = mount()
  await m.controller.load()
  await m.controller.toggle('workbuddy', 'charlie', 'Charlie', true)
  // The catalogue grows: a provider advertising a new model must show it last.
  FULL[0].models.push({ id: 'foxtrot', name: 'Foxtrot' })
  try {
    await m.controller.load()
    const order = m.orderOf('workbuddy')
    check('新模型排在末位', order[order.length - 1] === 'foxtrot', JSON.stringify(order))
    check('隐藏项仍在原位', order.indexOf('charlie') === 2, JSON.stringify(order))
  } finally {
    FULL[0].models.pop()
  }
}

console.log(failures === 0 ? '\n=== 全部通过 ===' : `\n=== ${failures} 项失败 ===`)
process.exitCode = failures === 0 ? 0 : 1
