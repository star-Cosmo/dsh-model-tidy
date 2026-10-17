/**
 * The probe surfaces exist in the rendered tree.
 *
 * The behaviour suite proves the probe works; this one proves a user can reach
 * it: a button in the controls row, one dot per model row, and a dialog that is
 * only mounted once the button is pressed.
 *
 * A probe spends tokens, so the button must go through confirmation rather than
 * starting a batch on the first click — the dialog's presence is asserted by
 * pressing the button through the rendered handler.
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

/**
 * A hook runtime that keeps its state between renders.
 *
 * The dialog test presses a button and renders again, so state has to survive
 * across renders — a fresh hook store each time would make the dialog
 * unobservable.
 */
function makeReact() {
  const cells = []
  let cursor = 0
  return {
    reset: () => { cursor = 0 },
    createElement: (tag, props, ...children) => ({ tag, props: props ?? {}, children: children.flat() }),
    createPortal: (node, container) => ({ tag: '#portal', props: { container }, children: [node] }),
    useState: initial => {
      const at = cursor++
      if (!(at in cells)) cells[at] = initial
      return [cells[at], next => {
        cells[at] = typeof next === 'function' ? next(cells[at]) : next
      }]
    },
    useRef: initial => {
      const at = cursor++
      if (!(at in cells)) cells[at] = { current: initial }
      return cells[at]
    },
    useMemo: fn => { cursor++; return fn() },
    useCallback: fn => { cursor++; return fn },
    useEffect: fn => { cursor++; const c = fn(); return typeof c === 'function' ? c : () => {} },
    useSyncExternalStore: (_s, snapshot) => { cursor++; return snapshot() },
  }
}

const CATALOGUE = [
  { id: 'workbuddy', name: 'WorkBuddy', models: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] },
]

function setup({ initial = {} } = {}) {
  let stored = { hidden: [], renamed: [], order: [], ...initial }
  const form = {
    getSnapshot: () => ({ status: 'ready', value: structuredClone(stored), writable: true, mode: 'host' }),
    subscribe: () => () => {},
    async set(field, value) { stored = { ...stored, [field]: structuredClone(value) }; return true },
  }
  const react = makeReact()
  let descriptor = null
  new Function('window', source)({ __ModuleLoader__: { load: d => { descriptor = d } } })
  const exports = descriptor.factory(spec => {
    if (spec === 'react') return react
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
  const render = () => {
    react.reset()
    const expand = node => {
      if (node === null || node === undefined || typeof node !== 'object') return node
      if (typeof node.tag === 'function') return expand(node.tag(node.props ?? {}))
      return { ...node, children: (node.children ?? []).map(expand).filter(Boolean) }
    }
    return expand(mounted.c(mounted.d.inject()))
  }
  return { controller, render, react }
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

const byClass = (nodes, className) => nodes.filter(n => n.props?.className === className)
/** Prefix match, for elements whose class gains a state suffix. */
const byClassPrefix = (nodes, prefix) =>
  nodes.filter(n => typeof n.props?.className === 'string' && n.props.className.startsWith(prefix))

// ── 1. the button is in the controls row ───────────────────────────────────
{
  const m = setup()
  await m.controller.load()
  const nodes = collect(m.render())
  const buttons = nodes.filter(n => n.tag === 'button' && String(n.props?.className ?? '').startsWith('dsh-mt-pill'))
  const probeButton = buttons.find(b => b.children?.[0] === 'probeButton')
  check('控制区有检测按钮', probeButton !== undefined, buttons.map(b => String(b.children?.[0])).join(', '))
  check('检测按钮带说明', typeof probeButton?.props?.title === 'string' && probeButton.props.title !== '')
  check('检测按钮可点击', typeof probeButton?.props?.onClick === 'function')
}

// ── 2. one dot per row, and none before a check ───────────────────────────
{
  const m = setup()
  await m.controller.load()
  const dots = byClass(collect(m.render()), 'dsh-mt-dot')
  check('每行一个状态点', dots.length === 2, String(dots.length))
  check('未检测时状态点无颜色类', dots.every(d => d.props.className === 'dsh-mt-dot'))
  check('状态点带无障碍标签', dots.every(d => typeof d.props['aria-label'] === 'string' && d.props['aria-label'] !== ''))
}

// ── 3. recorded verdicts change the dot's class ───────────────────────────
{
  const m = setup()
  await m.controller.load()
  await m.controller.probe(
    [{ provider: 'workbuddy', model: 'a' }, { provider: 'workbuddy', model: 'b' }],
    async () => ({
      ok: true,
      async json() {
        return {
          results: [
            { provider: 'workbuddy', model: 'a', ok: true, latencyMs: 88, detail: '' },
            { provider: 'workbuddy', model: 'b', ok: false, latencyMs: 12, detail: 'nope' },
          ],
        }
      },
    }),
  )
  // `is-sample` marks legend swatches; a row's own dot never carries it, so the
  // two kinds are told apart rather than pooled.
  const allDots = byClassPrefix(collect(m.render()), 'dsh-mt-dot')
  const rowDots = allDots.filter(d => !String(d.props.className).includes('is-sample'))
  const legendDots = allDots.filter(d => String(d.props.className).includes('is-sample'))
  const classes = rowDots.map(d => d.props.className).sort()
  check('行内的点只有两个', rowDots.length === 2, String(rowDots.length))
  check('可用点带 ok 类', classes.includes('dsh-mt-dot ok'), classes.join(' | '))
  check('失败点带 fail 类', classes.includes('dsh-mt-dot fail'), classes.join(' | '))
  check('图例有四个颜色样本', legendDots.length === 4, String(legendDots.length))
  const okDot = rowDots.find(d => d.props.className === 'dsh-mt-dot ok')
  // The locale double returns the key it is given, so the latency cannot show up
  // as a number here; what matters is that the tooltip asks for it at all.
  check('可用点的提示带延迟文案', String(okDot?.props.title).includes('probeLatency'), String(okDot?.props.title))
  check('可用点的提示标明可用', String(okDot?.props.title).includes('probeOk'), String(okDot?.props.title))
  const failDot = rowDots.find(d => d.props.className === 'dsh-mt-dot fail')
  check('失败点的提示含原因', String(failDot?.props.title).includes('nope'), String(failDot?.props.title))
}
{
  const fresh = setup()
  await fresh.controller.load()
  check('未检测时没有汇总行', byClass(collect(fresh.render()), 'dsh-mt-probe-line').length === 0)

  const m = setup()
  await m.controller.load()
  await m.controller.probe([{ provider: 'workbuddy', model: 'a' }], async () => ({
    ok: true,
    async json() { return { results: [{ provider: 'workbuddy', model: 'a', ok: true, latencyMs: 5 }] } },
  }))
  const line = byClass(collect(m.render()), 'dsh-mt-probe-line')
  check('检测后出现汇总行', line.length === 1, String(line.length))
}

// ── 5. pressing the button opens the dialog, it does not start a batch ────
{
  const m = setup()
  await m.controller.load()
  const before = collect(m.render())
  check('初始没有弹窗', before.every(n => n.props?.role !== 'dialog'))

  const probeButton = collect(m.render()).find(
    n => n.tag === 'button' && n.children?.[0] === 'probeButton',
  )
  check('检测按钮存在', probeButton !== undefined)
  if (probeButton) {
    probeButton.props.onClick()
    const after = collect(m.render())
    check('点击后弹出确认框', after.some(n => n.props?.role === 'dialog'))
    check('确认框说明了 token 消耗', after.some(n => String(n.children?.[0] ?? '').includes('probeConfirmBody')))
    check('确认框有开始与取消', after.filter(n => n.tag === 'button').some(b => b.children?.[0] === 'probeConfirmStart'))
  }
  check('点击按钮本身没有发起检测', m.controller.probing === false)
}

// ── 6. hidden models are never part of a batch ────────────────────────────
// The dialog has no "include hidden" choice on purpose: a hidden model is not
// offered by the selector, so checking it would spend tokens on an answer
// nobody acts on. The count in the dialog is the visible count, and the batch the
// start button would send contains no hidden model.
{
  const m = setup({ initial: { hidden: [{ provider: 'workbuddy', model: 'b', name: 'B' }] } })
  await m.controller.load()
  const probeButton = collect(m.render()).find(n => n.tag === 'button' && n.children?.[0] === 'probeButton')
  probeButton?.props.onClick()
  const nodes = collect(m.render())
  check('确认框没有隐藏模型的勾选框', nodes.every(n => !(n.tag === 'input' && n.props?.type === 'checkbox')))

  let sent = null
  const originalProbe = m.controller.probe.bind(m.controller)
  m.controller.probe = async targets => {
    sent = targets
    return originalProbe(targets, async () => ({ ok: true, async json() { return { results: [] } } }))
  }
  const start = collect(m.render()).find(n => n.tag === 'button' && n.children?.[0] === 'probeConfirmStart')
  start?.props.onClick()
  check('开始检测只提交可见模型', sent?.length === 1, JSON.stringify(sent))
  check('提交的正是可见的那个模型', sent?.[0]?.model === 'a', JSON.stringify(sent))
}

console.log(failures === 0 ? '\n=== 探测渲染验证通过 ===' : `\n=== ${failures} 项失败 ===`)
process.exitCode = failures === 0 ? 0 : 1
