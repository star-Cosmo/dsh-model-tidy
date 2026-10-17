/**
 * The rendered tree carries the order arrows, with the right ones disabled.
 *
 * The behaviour tests drive the controller; this one answers what a user sees:
 * every row has an up and a down arrow, the first row cannot go up, the last
 * cannot go down, and the provider head offers a way back to catalogue order.
 *
 * Function components are expanded while walking, so an assertion about a
 * `button` is about the element the component produced, not about the component
 * function itself.
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
    useState: v => {
      const i = cursor++
      if (hooks.length <= i) hooks[i] = v
      return [hooks[i], nv => { hooks[i] = typeof nv === 'function' ? nv(hooks[i]) : nv }]
    },
    useRef: v => {
      const i = cursor++
      if (hooks.length <= i) hooks[i] = { current: v }
      return hooks[i]
    },
    useMemo: fn => { cursor++; return fn() },
    useCallback: fn => { cursor++; return fn },
    useEffect: fn => { cursor++; const c = fn(); return typeof c === 'function' ? c : () => {} },
    useSyncExternalStore: (_s, snap) => { cursor++; return snap() },
  }
}

const CATALOGUE = [
  { id: 'workbuddy', name: 'WorkBuddy', models: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }] },
]

function setup({ initial = {} } = {}) {
  let stored = { hidden: [], renamed: [], order: [], ...initial }
  const form = {
    getSnapshot: () => ({ status: 'ready', value: structuredClone(stored), writable: true, mode: 'host' }),
    subscribe: () => () => {},
    async set(field, value) {
      stored = { ...stored, [field]: structuredClone(value) }
      return true
    },
  }

  let descriptor = null
  new Function('window', source)({ __ModuleLoader__: { load: d => { descriptor = d } } })
  const exports = descriptor.factory(spec => {
    if (spec === 'react') return makeReact()
    throw new Error(spec)
  })

  let mounted = null
  const ctx = {
    effect: fn => { fn() },
    locale: { register: () => {}, bind: () => key => key },
    configForms: { get: () => form, whileServed: (_n, fn) => fn() },
    slots: { inject: (_n, fn) => fn(), register: (d, c) => { mounted = { d, c }; return () => {} } },
    remote: {
      session: { modelCatalog: async () => ({ ok: true, value: { groups: CATALOGUE } }) },
      $on: () => () => {},
    },
  }
  exports.apply(ctx)

  const controller = mounted.d.inject().controller
  /** Render and expand function components into plain element nodes. */
  const render = () => {
    const expand = node => {
      if (node === null || node === undefined || typeof node !== 'object') return node
      if (typeof node.tag === 'function') return expand(node.tag(node.props ?? {}))
      return { ...node, children: (node.children ?? []).map(expand).filter(Boolean) }
    }
    return expand(mounted.c(mounted.d.inject()))
  }
  return { controller, render, form }
}

const collect = tree => {
  const out = []
  const walk = node => {
    if (!node || typeof node !== 'object') return
    out.push(node)
    for (const child of node.children ?? []) walk(child)
  }
  walk(tree)
  return out
}

// ── 1. every row has both arrows ────────────────────────────────────────────
{
  const m = setup()
  await m.controller.load()
  const nodes = collect(m.render())
  const arrows = nodes.filter(n => n.props?.className === 'dsh-mt-arrow')
  const ups = arrows.filter(a => a.children?.[0] === '▲')
  const downs = arrows.filter(a => a.children?.[0] === '▼')

  check('每行两个箭头', arrows.length === 6, String(arrows.length))
  check('上移按钮数量正确', ups.length === 3, String(ups.length))
  check('下移按钮数量正确', downs.length === 3, String(downs.length))
  check('箭头是 button 元素', arrows.every(a => a.tag === 'button'))
}

// ── 2. boundaries are disabled ──────────────────────────────────────────────
{
  const m = setup()
  await m.controller.load()
  const nodes = collect(m.render())
  const arrows = nodes.filter(n => n.props?.className === 'dsh-mt-arrow')
  const ups = arrows.filter(a => a.children?.[0] === '▲')
  const downs = arrows.filter(a => a.children?.[0] === '▼')

  check('首行上移被禁用', ups[0]?.props?.disabled === true)
  check('末行下移被禁用', downs[downs.length - 1]?.props?.disabled === true)
  check('中间行上移可用', ups[1]?.props?.disabled === false)
  check('首行下移可用', downs[0]?.props?.disabled === false)
  check('末行上移可用', ups[ups.length - 1]?.props?.disabled === false)
}

// ── 3. every arrow carries a label for assistive technology ────────────────
{
  const m = setup()
  await m.controller.load()
  const arrows = collect(m.render()).filter(n => n.props?.className === 'dsh-mt-arrow')
  check('箭头都有 aria-label', arrows.every(a => typeof a.props?.['aria-label'] === 'string' && a.props['aria-label'] !== ''))
  check('箭头都有 title', arrows.every(a => typeof a.props?.title === 'string' && a.props.title !== ''))
  check('箭头都绑定了点击处理', arrows.every(a => typeof a.props?.onClick === 'function'))
}

// ── 4. the provider head offers a reset, disabled until an order exists ────
{
  const fresh = setup()
  await fresh.controller.load()
  const resetFresh = collect(fresh.render()).find(
    n => n.props?.className === 'dsh-mt-mini' && n.props?.title === 'resetOrder',
  )
  check('存在恢复默认排序按钮', resetFresh !== undefined)
  check('无自定义顺序时禁用', resetFresh?.props?.disabled === true)

  // With a saved order the button becomes usable.
  const arranged = setup({ initial: { order: [{ provider: 'workbuddy', models: ['c', 'b', 'a'] }] } })
  await arranged.controller.load()
  const resetArranged = collect(arranged.render()).find(
    n => n.props?.className === 'dsh-mt-mini' && n.props?.title === 'resetOrder',
  )
  check('有自定义顺序时可用', resetArranged?.props?.disabled === false)
}

// ── 5. a row missing from the provider still renders arrows ───────────────
{
  const m = setup({ initial: { hidden: [{ provider: 'workbuddy', model: 'b', name: 'B' }] } })
  await m.controller.load()
  const arrows = collect(m.render()).filter(n => n.props?.className === 'dsh-mt-arrow')
  check('隐藏行也有箭头', arrows.length === 6, String(arrows.length))
}

console.log(failures === 0 ? '\n=== 排序渲染验证通过 ===' : `\n=== ${failures} 项失败 ===`)
process.exitCode = failures === 0 ? 0 : 1
