/**
 * Render the section component once and inspect the tree it produces.
 *
 * The other suites check behaviour and wiring; this one answers the question a
 * user actually asks — "is the star button on the page, does it say what it
 * should, and does it point where it should". It renders through a minimal
 * element-tree runtime, no DOM needed, because the component is a pure
 * function of (controller, t).
 *
 * Run from the profile or repo root:
 *   node test/render.test.mjs [path-to-lib]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const explicit = process.argv[2]
const clientPath = explicit
  ? path.join(explicit, 'client.js')
  : path.join(here, '..', 'lib', 'client.js')

let failures = 0
const check = (label, ok, extra = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`)
  if (!ok) failures += 1
}

// ── a hook runtime that renders one pass ────────────────────────────────────
function makeReact() {
  const hooks = []
  let cursor = 0
  const effects = []
  return {
    createElement: (tag, props, ...children) => ({ tag, props: props ?? {}, children: children.flat() }),
    createPortal: (node, container) => ({ tag: '#portal', props: { container }, children: [node] }),
    useState: initial => {
      const i = cursor++
      if (hooks.length <= i) hooks[i] = initial
      return [hooks[i], v => { hooks[i] = typeof v === 'function' ? v(hooks[i]) : v }]
    },
    useRef: initial => {
      const i = cursor++
      if (hooks.length <= i) hooks[i] = { current: initial }
      return hooks[i]
    },
    useMemo: fn => { cursor++; return fn() },
    useCallback: fn => { cursor++; return fn },
    useEffect: fn => { cursor++; effects.push(fn) },
    useSyncExternalStore: (_sub, snap) => { cursor++; return snap() },
    __effects: effects,
  }
}

const source = fs.readFileSync(clientPath, 'utf8')
const react = makeReact()
let descriptor = null
const window = { __ModuleLoader__: { load: d => { descriptor = d } } }
const missing = []
const require = spec => {
  if (spec === 'react') return react
  missing.push(spec)
  throw new Error(`unexpected require(${spec})`)
}
new Function('window', source)(window)
const exports = descriptor.factory(require)

// ── a controller double is not enough here: use the real one ────────────────
const groups = [
  { id: 'workbuddy', name: 'WorkBuddy', models: [{ id: 'wb-1', name: 'WB One' }] },
  { id: 'gemini', name: 'Gemini', models: [{ id: 'gm-1', name: 'GM One' }] },
]
let stored = { hidden: [], renamed: [] }
const form = {
  getSnapshot: () => ({ status: 'ready', value: stored, writable: true, mode: 'host' }),
  subscribe: () => () => {},
  set: async (field, value) => {
    stored = { ...stored, [field]: value }
    return true
  },
}
let section = null
const ctx = {
  effect: fn => { fn() },
  locale: {
    register: () => {},
    bind: () => key => key,
  },
  configForms: { get: () => form, whileServed: (_ns, fn) => fn() },
  slots: {
    inject: (_name, fn) => fn(),
    register: (desc, comp) => { section = { desc, comp }; return () => {} },
  },
  remote: {
    session: { modelCatalog: async () => ({ ok: true, value: { groups } }) },
    $on: () => () => {},
  },
}
exports.apply(ctx)

check('已注册设置分区', section !== null)
check('组件可渲染', typeof section?.comp === 'function')

// The panel reads its snapshot synchronously, so the catalogue must be loaded
// first — in the browser that happens in an effect the runtime would run.
const controller = section.desc.inject().controller
await controller.load()
check('目录已载入', controller.store?.rows?.length === 2, String(controller.store?.rows?.length))

const props = section.desc.inject()
const tree = section.comp(props)

// ── walk the tree ───────────────────────────────────────────────────────────
const walk = (node, visit) => {
  if (node === null || node === undefined || typeof node !== 'object') return
  visit(node)
  for (const child of node.children ?? []) walk(child, visit)
}

let star = null
let headRow = null
walk(tree, node => {
  if (node.props?.className === 'dsh-mt-star') star = node
  if (node.props?.className === 'dsh-mt-head-row') headRow = node
})

check('页面上有 star 按钮', star !== null)
check('star 是 a 标签', star?.tag === 'a', star?.tag)
check('指向本仓库', star?.props?.href === 'https://github.com/star-Cosmo/dsh-model-tidy', star?.props?.href)
check('新标签打开', star?.props?.target === '_blank')
check('带 noopener/noreferrer', star?.props?.rel === 'noreferrer noopener')
check('有悬停提示', typeof star?.props?.title === 'string' && star.props.title !== '')
check('按钮带图标', (star?.children ?? []).some(c => c?.tag === 'svg'))
check(
  '按钮带可见文字',
  (star?.children ?? []).some(c => c?.tag === 'span' && typeof c.children?.[0] === 'string' && c.children[0] !== ''),
)
check('按钮位于标题行', headRow !== null && (headRow.children ?? []).includes(star))

// Ordering inside the head row: description first, button last, which is what
// puts the button at the right edge.
const headChildren = headRow?.children ?? []
check('按钮在标题行最后（即右侧）', headChildren[headChildren.length - 1] === star)

// ── the rest of the page still renders ──────────────────────────────────────
const classes = new Set()
walk(tree, node => { if (typeof node.props?.className === 'string') classes.add(node.props.className) })
for (const name of ['dsh-mt-toolbar', 'dsh-mt-actions', 'dsh-mt-summary', 'dsh-mt-card', 'dsh-mt-tip']) {
  check(`页面含 ${name}`, classes.has(name))
}

let checkboxCount = 0
let buttonCount = 0
walk(tree, node => {
  if (node.tag === 'input' && node.props?.type === 'checkbox') checkboxCount += 1
  if (node.tag === 'button') buttonCount += 1
})
check('每个模型一个开关', checkboxCount === 2, String(checkboxCount))
check('存在操作按钮', buttonCount >= 4, String(buttonCount))

check('只加载 react 一个外部模块', missing.length === 0, missing.join(', '))

console.log(failures === 0 ? '\n=== 渲染验证通过 ===' : `\n=== ${failures} 项失败 ===`)
process.exitCode = failures === 0 ? 0 : 1
