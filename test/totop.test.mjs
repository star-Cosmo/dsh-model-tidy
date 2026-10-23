/**
 * The back-to-top control.
 *
 * What deserves a test here is narrow: the button is rendered in the corner,
 * carries an accessible name, and pressing it scrolls the pane the section
 * actually lives in — which is the host's scroll container, not `window`.
 *
 * Getting the ref right is the whole difficulty. React attaches `ref.current`
 * to the DOM node when it commits, so this test stands in for that: the element
 * tree is walked, and any node carrying an object `ref` has that ref pointed at
 * the fake element. That is exactly the contract the component relies on, and
 * it means no changes to production code exist only for the test.
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
  const cells = []
  let cursor = 0
  /**
   * Effects queue until the tree exists.
   *
   * Real React runs effects after commit, when refs are already attached; the
   * panel's mount effects read `rootRef.current`, so running them during render
   * — before the walk attaches the ref — would hand them a null root and never
   * find the scroll pane. Queueing and flushing after the walk mirrors that
   * ordering.
   */
  const pendingEffects = []
  return {
    reset: () => {
      cursor = 0
      pendingEffects.length = 0
    },
    flushEffects: () => {
      while (pendingEffects.length > 0) pendingEffects.shift()()
    },
    createElement: (tag, props, ...children) => ({ tag, props: props ?? {}, children: children.flat() }),
    createPortal: (node, container) => ({ tag: '#portal', props: { container }, children: [node] }),
    useState: initial => {
      const at = cursor++
      if (!(at in cells)) cells[at] = initial
      return [cells[at], next => { cells[at] = typeof next === 'function' ? next(cells[at]) : next }]
    },
    useRef: initial => {
      const at = cursor++
      if (!(at in cells)) cells[at] = { current: initial }
      return cells[at]
    },
    useMemo: fn => { cursor++; return fn() },
    useCallback: fn => { cursor++; return fn },
    useEffect: fn => { cursor++; pendingEffects.push(() => { const c = fn(); return typeof c === 'function' ? c : () => {} }) },
    useSyncExternalStore: (_s, snapshot) => { cursor++; return snapshot() },
  }
}

const CATALOGUE = [
  { id: 'workbuddy', name: 'WorkBuddy', models: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] },
]

function setup({ scrollable = true } = {}) {
  let stored = { hidden: [], renamed: [], order: [], providerOrder: [], providerRenamed: [] }
  const form = {
    getSnapshot: () => ({ status: 'ready', value: structuredClone(stored), writable: true, mode: 'host' }),
    subscribe: () => () => {},
    async set(field, value) { stored = { ...stored, [field]: structuredClone(value) }; return true },
  }

  const calls = []
  const scrollHandlers = []
  /** The fake scroll container the panel sits inside. */
  const pane = {
    scrollHeight: 2400,
    clientHeight: 700,
    scrollTop: 0,
    scrollTo: options => { calls.push(options) },
    addEventListener: (_type, fn) => { scrollHandlers.push(fn) },
    removeEventListener: (_type, fn) => {
      const at = scrollHandlers.indexOf(fn)
      if (at !== -1) scrollHandlers.splice(at, 1)
    },
    // The corner button is portalled into this container; the appendChild shape
    // is what the component checks before choosing the portal path.
    appendChild: () => {},
    parentElement: null,
  }

  // A fake document: `ensureStyles` asks for a stylesheet id, and the ancestor
  // walk stops at body/documentElement.
  const head = { children: [], appendChild: node => { head.children.push(node) } }
  globalThis.document = {
    head,
    body: { parentElement: null },
    documentElement: { parentElement: null },
    getElementById: () => null,
    createElement: () => ({ id: '', textContent: '' }),
  }
  globalThis.getComputedStyle = () => ({ overflowY: scrollable ? 'auto' : 'visible' })
  globalThis.window = { scrollTo: options => { calls.push(options) } }

  const react = makeReact()
  let descriptor = null
  const win = { __ModuleLoader__: { load: d => { descriptor = d } } }
  new Function('window', source)(win)
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
      const expanded = { ...node, children: (node.children ?? []).map(expand).filter(Boolean) }
      // Stand in for React's ref attachment: this is what makes the panel able
      // to walk up from its own element to the scrolling ancestor.
      const ref = expanded.props?.ref
      if (ref !== null && typeof ref === 'object' && 'current' in ref) ref.current = { parentElement: pane }
      return expanded
    }
    const tree = expand(mounted.c(mounted.d.inject()))
    // Effects run after commit, refs attached — the ordering real React gives.
    react.flushEffects()
    return tree
  }

  return { render, calls, controller, pane, scrollHandlers }
}

const walk = (node, visit) => {
  if (node === null || node === undefined || typeof node !== 'object') return
  visit(node)
  for (const child of node.children ?? []) walk(child, visit)
}

const find = (tree, predicate) => {
  let found = null
  walk(tree, node => { if (found === null && predicate(node)) found = node })
  return found
}

const findTotop = tree => find(tree, n => n.tag === 'button' && n.props?.className === 'dsh-mt-totop')

// ── 1. hidden until the pane scrolls ────────────────────────────────────────
{
  const { render, controller } = setup()
  render()
  await controller.load()
  const tree = render()
  check('未滚动时按钮不存在', findTotop(tree) === null)
}

// ── 2. the first scroll reveals it; the corner holds a named, round button ──
{
  const { render, controller, pane, scrollHandlers } = setup()
  render()
  await controller.load()
  render() // effects ran; the scroll listener is attached by now
  check('滚动监听已挂到容器上', scrollHandlers.length === 1)

  // One scroll event — the user moved the pane at all — is the whole trigger.
  // The event fires after the position changed, so the fake pane is moved first.
  pane.scrollTop = 200
  scrollHandlers[0]()
  const tree = render()
  const button = findTotop(tree)
  check('一滚动按钮就出现', button !== null)
  check('带有无障碍名称', typeof button?.props?.['aria-label'] === 'string' && button.props['aria-label'] !== '')
  check('带有 title 提示', typeof button?.props?.title === 'string' && button.props.title !== '')
  check('点击处理器已挂上', typeof button?.props?.onClick === 'function')
  check('显示向上箭头', (button?.children ?? []).includes('↑'))
}

// ── 3. pressing it scrolls the pane and hides the button again ──────────────
{
  const { render, calls, controller, pane, scrollHandlers } = setup()
  render()
  await controller.load()
  render()
  pane.scrollTop = 200
  scrollHandlers[0]()
  let tree = render()
  findTotop(tree)?.props?.onClick?.()
  check('滚动了滚动祖先', calls.length === 1, `调用 ${calls.length} 次`)
  check('滚到顶部', calls[0]?.top === 0)
  check('使用平滑滚动', calls[0]?.behavior === 'smooth')

  // The smooth scroll ends back at the top, so the button hides again.
  pane.scrollTop = 0
  scrollHandlers[0]()
  tree = render()
  check('回到顶部后按钮消失', findTotop(tree) === null)
}

// ── 4. the button is portalled out of the settings pane ─────────────────────
{
  const { render, controller, pane, scrollHandlers } = setup()
  render()
  await controller.load()
  render()
  pane.scrollTop = 200
  scrollHandlers[0]()
  const tree = render()
  // find() returns the sticky wrapper *inside* the portal; what proves the
  // placement is that its container is a portal into the scrolling pane itself,
  // so the sticky bottom pins to that pane's edge — the settings page's corner,
  // not the whole DSH window's.
  let container = null
  walk(tree, node => {
    if (container === null && (node.children ?? []).some(child => child?.props?.className === 'dsh-mt-totop-wrap')) {
      container = node
    }
  })
  check('按钮 portal 进滚动容器', container?.tag === '#portal', `tag=${String(container?.tag)}`)
  const stickyWrapper = find(tree, n => n.props?.className === 'dsh-mt-totop-wrap')
  check('wrapper 用 sticky 定位在 pane 底部', stickyWrapper !== null)
}

// ── 3. the probe left nothing behind ───────────────────────────────────────
{
  const { render, controller } = setup()
  render()
  await controller.load()
  const tree = render()
  const dot = find(tree, n => typeof n.props?.className === 'string' && n.props.className.includes('dsh-mt-dot'))
  const legend = find(tree, n => typeof n.props?.className === 'string' && n.props.className.includes('dsh-mt-legend'))
  const probeTitle = find(tree, n => n.props?.title === 'probeTitle')
  check('已移除状态点', dot === null)
  check('已移除图例', legend === null)
  check('已移除检测按钮', probeTitle === null)
}

// ── 4. the provider head can wrap instead of overflowing ───────────────────
{
  check('渠道按钮组允许换行', /\.dsh-mt-prov-btns\s*\{[^}]*flex-wrap:\s*wrap/.test(source))
  check('渠道头部允许换行', /\.dsh-mt-prov-head\s*\{[^}]*flex-wrap:\s*wrap/.test(source))
  check('小按钮有最大宽度约束', /\.dsh-mt-mini\s*\{[^}]*max-width:\s*100%/.test(source))
}

console.log(failures === 0 ? '\n=== 返回顶部验证通过 ===' : `\n=== ${failures} 项失败 ===`)
process.exitCode = failures === 0 ? 0 : 1
