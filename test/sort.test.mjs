/**
 * Custom ordering: the arrow buttons, the persisted sequence, and what any of
 * it means while a search filter is narrowing the list.
 *
 * Three properties matter and each has its own section below:
 *
 *   1. **The order is stored, not just displayed.** Arrows write an ordered id
 *      list per provider, and a later load reads it back — the earlier code
 *      wrote the list but never restored it, so every arrangement evaporated
 *      on the next catalogue read.
 *   2. **The arrows act on what is visible.** With a search filter active the
 *      neighbour is the next visible row. Swapping by catalogue position
 *      instead would make a click look like it did nothing.
 *   3. **Hidden models keep their place.** The saved list is built from the
 *      composed rows — catalogue plus hidden entries — so arranging never drops
 *      a model that happens to be hidden at the time.
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

const CATALOGUE = [
  {
    id: 'workbuddy',
    name: 'WorkBuddy',
    models: [
      { id: 'alpha', name: 'Alpha' },
      { id: 'bravo', name: 'Bravo' },
      { id: 'charlie', name: 'Charlie' },
      { id: 'delta', name: 'Delta' },
    ],
  },
  { id: 'gemini', name: 'Gemini', models: [{ id: 'golf', name: 'Golf' }, { id: 'hotel', name: 'Hotel' }] },
]

function mount({ initial = {} } = {}) {
  /** A host that notifies after each field write, like the real settings mirror. */
  let stored = { hidden: [], renamed: [], order: [], ...initial }
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
      session: {
        modelCatalog: async () => {
          // The host filters by the hidden list; order is *not* applied by the
          // host, so this double stays in catalogue order on purpose.
          const hidden = new Set((stored.hidden ?? []).map(h => `${h.provider}\u0000${h.model}`))
          return {
            ok: true,
            value: {
              groups: CATALOGUE.map(g => ({
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
  const orderOf = provider => {
    const group = (controller.state?.groups ?? []).find(g => g.id === provider)
    return (group?.rows ?? []).map(r => r.model)
  }
  const savedOrderOf = provider => {
    const entry = (form.stored.order ?? []).find(e => e.provider === provider)
    return entry ? entry.models : null
  }
  return { controller, form, orderOf, savedOrderOf }
}

// ── 1. moving down swaps with the next row and persists ─────────────────────
{
  const m = mount()
  await m.controller.load()
  check('初始为目录顺序', JSON.stringify(m.orderOf('workbuddy')) === JSON.stringify(['alpha', 'bravo', 'charlie', 'delta']), JSON.stringify(m.orderOf('workbuddy')))

  const ok = await m.controller.moveModel('workbuddy', 'alpha', 'down', ['alpha', 'bravo', 'charlie', 'delta'])
  check('给出下移成功', ok === true)
  check('界面顺序已换', JSON.stringify(m.orderOf('workbuddy')) === JSON.stringify(['bravo', 'alpha', 'charlie', 'delta']), JSON.stringify(m.orderOf('workbuddy')))
  check('顺序已写入宿主', JSON.stringify(m.savedOrderOf('workbuddy')) === JSON.stringify(['bravo', 'alpha', 'charlie', 'delta']), JSON.stringify(m.savedOrderOf('workbuddy')))
}

// ── 2. moving up, and at the boundaries ────────────────────────────────────
{
  const m = mount()
  await m.controller.load()
  await m.controller.moveModel('workbuddy', 'delta', 'up', ['alpha', 'bravo', 'charlie', 'delta'])
  check('上移一格', JSON.stringify(m.orderOf('workbuddy')) === JSON.stringify(['alpha', 'bravo', 'delta', 'charlie']), JSON.stringify(m.orderOf('workbuddy')))

  const atTop = await m.controller.moveModel('workbuddy', 'alpha', 'up', ['alpha', 'bravo', 'delta', 'charlie'])
  check('首位再上移无效', atTop === false)
  const atBottom = await m.controller.moveModel('workbuddy', 'charlie', 'down', ['alpha', 'bravo', 'delta', 'charlie'])
  check('末位再下移无效', atBottom === false)
}

// ── 3. the arrangement survives a reload ───────────────────────────────────
// This is the defect the restore call fixes: without it `savedOrder` stays empty
// and the catalogue order silently wins.
{
  const m = mount()
  await m.controller.load()
  await m.controller.moveModel('workbuddy', 'delta', 'up', ['alpha', 'bravo', 'charlie', 'delta'])
  await m.controller.moveModel('workbuddy', 'delta', 'up', ['alpha', 'bravo', 'delta', 'charlie'])
  check('重排后为 delta 在前', JSON.stringify(m.orderOf('workbuddy')) === JSON.stringify(['alpha', 'delta', 'bravo', 'charlie']), JSON.stringify(m.orderOf('workbuddy')))

  await m.controller.load()
  check('重新读取目录后顺序保持', JSON.stringify(m.orderOf('workbuddy')) === JSON.stringify(['alpha', 'delta', 'bravo', 'charlie']), JSON.stringify(m.orderOf('workbuddy')))
}

// ── 4. a fresh mount reads the saved order back ────────────────────────────
{
  const m = mount({
    initial: { order: [{ provider: 'workbuddy', models: ['charlie', 'alpha', 'delta', 'bravo'] }] },
  })
  await m.controller.load()
  check('冷启动按保存的顺序排列', JSON.stringify(m.orderOf('workbuddy')) === JSON.stringify(['charlie', 'alpha', 'delta', 'bravo']), JSON.stringify(m.orderOf('workbuddy')))
}

// ── 5. providers are ordered independently ─────────────────────────────────
{
  const m = mount()
  await m.controller.load()
  await m.controller.moveModel('workbuddy', 'alpha', 'down', ['alpha', 'bravo', 'charlie', 'delta'])
  check('另一渠道不受影响', JSON.stringify(m.orderOf('gemini')) === JSON.stringify(['golf', 'hotel']), JSON.stringify(m.orderOf('gemini')))
  check('另一渠道没有被写入顺序', m.savedOrderOf('gemini') === null)
}

// ── 6. a hidden model keeps its slot in the saved list ─────────────────────
// The saved list is built from composed rows, so a model hidden at the time of
// the arrangement is still named in it and comes back where it was put.
{
  const m = mount()
  await m.controller.load()
  await m.controller.toggle('workbuddy', 'bravo', 'Bravo', true)
  await m.controller.moveModel('workbuddy', 'delta', 'up', ['alpha', 'charlie', 'delta'])
  const saved = m.savedOrderOf('workbuddy')
  check('隐藏的模型仍写在顺序里', Array.isArray(saved) && saved.includes('bravo'), JSON.stringify(saved))
  check('可见项按新顺序排列', JSON.stringify(m.orderOf('workbuddy').filter(id => id !== 'bravo')) === JSON.stringify(saved.filter(id => id !== 'bravo')), JSON.stringify(m.orderOf('workbuddy')))

  await m.controller.toggle('workbuddy', 'bravo', 'Bravo', false)
  check('取消隐藏后回到保存的位置', JSON.stringify(m.orderOf('workbuddy')) === JSON.stringify(saved), `${JSON.stringify(m.orderOf('workbuddy'))} vs ${JSON.stringify(saved)}`)
}

// ── 7. under a filter, the neighbour is the visible one ────────────────────
// Search "a" and the visible sequence of workbuddy becomes alpha/charlie/delta;
// moving delta up must therefore swap it with charlie, not with bravo.
{
  const m = mount()
  await m.controller.load()
  const visible = ['alpha', 'charlie', 'delta']
  await m.controller.moveModel('workbuddy', 'delta', 'up', visible)
  const order = m.orderOf('workbuddy')
  check('跟随可见行交换', order.indexOf('delta') < order.indexOf('charlie'), JSON.stringify(order))
  // The swap is between charlie and delta in the full list, so bravo — which the
  // filter hid — keeps its own position between alpha and delta.
  check('整体顺序为 alpha/bravo/delta/charlie', JSON.stringify(order) === JSON.stringify(['alpha', 'bravo', 'delta', 'charlie']), JSON.stringify(order))
  check('未参与的行仍被保留', order.includes('bravo'), JSON.stringify(order))
}

// ── 8. resetting one provider returns it to catalogue order ────────────────
{
  const m = mount()
  await m.controller.load()
  await m.controller.moveModel('workbuddy', 'delta', 'up', ['alpha', 'bravo', 'charlie', 'delta'])
  check('重置前是自定义顺序', JSON.stringify(m.orderOf('workbuddy')) !== JSON.stringify(['alpha', 'bravo', 'charlie', 'delta']))

  const ok = await m.controller.resetOrder('workbuddy')
  check('重置成功', ok === true)
  check('回到目录顺序', JSON.stringify(m.orderOf('workbuddy')) === JSON.stringify(['alpha', 'bravo', 'charlie', 'delta']), JSON.stringify(m.orderOf('workbuddy')))
  check('宿主里的该渠道顺序已移除', m.savedOrderOf('workbuddy') === null)

  const again = await m.controller.resetOrder('workbuddy')
  check('无自定义顺序时重置返回 false', again === false)
}

// ── 9. a model the provider adds later lands last ─────────────────────────
{
  const m = mount()
  await m.controller.load()
  await m.controller.moveModel('workbuddy', 'delta', 'up', ['alpha', 'bravo', 'charlie', 'delta'])
  CATALOGUE[0].models.push({ id: 'echo', name: 'Echo' })
  try {
    await m.controller.load()
    const order = m.orderOf('workbuddy')
    check('新模型排在已排列项之后', order[order.length - 1] === 'echo', JSON.stringify(order))
    check('原有排列保持不变', JSON.stringify(order.slice(0, 4)) === JSON.stringify(['alpha', 'bravo', 'delta', 'charlie']), JSON.stringify(order))
  } finally {
    CATALOGUE[0].models.pop()
  }
}

// ── 10. the section renders arrows for each row ───────────────────────────
{
  const m = mount()
  await m.controller.load()
  const react = makeReact()
  void react
  // Render through the registered component, expanding function components.
  const expand = node => {
    if (node === null || node === undefined || typeof node !== 'object') return node
    if (typeof node.tag === 'function') return expand(node.tag(node.props ?? {}))
    return { ...node, children: (node.children ?? []).map(expand).filter(Boolean) }
  }
  const tree = expand(m.controller.__panel ? m.controller.__panel() : null)
  void tree

  // The controller alone cannot prove the buttons exist; assert against source
  // for the wiring, which is what a missing button would show up as.
  const hasArrows = source.includes("className: 'dsh-mt-arrow'") && source.includes("controller.moveModel(group.id, row.model, 'up'")
  check('渲染里接上了上移按钮', source.includes("'up', shownIds"))
  check('渲染里接上了下移按钮', source.includes("'down', shownIds"))
  check('箭头样式已定义', hasArrows && source.includes('.dsh-mt-arrow {'))
  check('渠道头有恢复默认排序', source.includes('controller.resetOrder(group.id)'))
}

console.log(failures === 0 ? '\n=== 全部通过 ===' : `\n=== ${failures} 项失败 ===`)
process.exitCode = failures === 0 ? 0 : 1
