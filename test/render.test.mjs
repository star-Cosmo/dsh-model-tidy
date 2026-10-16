/**
 * The rendered tree, on the reference layout.
 *
 * The behaviour tests check the controller; this one answers the question a user
 * asks: is the page shaped the way it should be — one card per provider, one
 * switch per model, search and bulk controls on top, the star link in the
 * heading, and that heading present in every phase?
 *
 * It renders the real component through a minimal element-tree runtime, so no
 * DOM is needed: the component is a pure function of the controller's state.
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

const FULL = [
  { id: 'workbuddy', name: 'WorkBuddy', models: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] },
  { id: 'gemini', name: 'Gemini', models: [{ id: 'g', name: 'G' }] },
]

function setup({ initial = {}, failCatalog = false } = {}) {
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
    configForms: { get: () => form, whileServed: (_ns, fn) => fn() },
    slots: { inject: (_n, fn) => fn(), register: (d, c) => { mounted = { d, c }; return () => {} } },
    remote: {
      session: {
        modelCatalog: async () => {
          if (failCatalog) return { ok: false, error: { code: 'X', message: 'boom' } }
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
  /**
   * Render, expanding function components.
   *
   * React calls a function component to get its element; the element tree the
   * component builds is one level below. Expanding here keeps the assertions
   * about the *rendered* shape — a switch is a `button[role=switch]`, not the
   * `Switch` function that produced it.
   */
  const expand = node => {
    if (node === null || node === undefined || typeof node !== 'object') return node
    if (typeof node.tag === 'function') {
      const inner = node.tag(node.props ?? {})
      return expand(inner)
    }
    return { ...node, children: (node.children ?? []).map(expand).filter(Boolean) }
  }
  const render = () => expand(mounted.c(mounted.d.inject()))
  return { controller, render, form }
}

const walk = (node, visit) => {
  if (node === null || node === undefined || typeof node !== 'object') return
  visit(node)
  for (const child of node.children ?? []) walk(child, visit)
}

const classesOf = tree => {
  const set = new Set()
  walk(tree, n => {
    if (typeof n.props?.className === 'string') set.add(n.props.className)
  })
  return set
}

const countClass = (tree, className) => {
  let n = 0
  walk(tree, node => {
    if (typeof node.props?.className === 'string' && node.props.className === className) n += 1
  })
  return n
}

const countSwitch = tree => {
  let n = 0
  walk(tree, node => {
    const cls = node.props?.className
    if (typeof cls === 'string' && cls.startsWith('dsh-mt-switch') && node.tag === 'button') n += 1
  })
  return n
}

const findStar = tree => {
  let found = null
  walk(tree, n => {
    if (n.props?.className === 'dsh-mt-star') found = n
  })
  return found
}

// ── 1. the loaded page ──────────────────────────────────────────────────────
{
  const m = setup()
  await m.controller.load()
  const tree = m.render()
  const classes = classesOf(tree)

  check('含 heading 行', classes.has('dsh-mt-head-row'))
  check('含搜索与批量控件行', classes.has('dsh-mt-controls'))
  check('含两个渠道卡片', countClass(tree, 'dsh-mt-card') === 2, String(countClass(tree, 'dsh-mt-card')))
  check('每个模型一个开关', countSwitch(tree) === 3, String(countSwitch(tree)))
  check('含提示区', classes.has('dsh-mt-tip'))
  check('含底部操作区', classes.has('dsh-mt-actions'))
  check('每行有备注入口', countClass(tree, 'dsh-mt-mini') >= 3, String(countClass(tree, 'dsh-mt-mini')))

  const star = findStar(tree)
  check('页面上有 Star 按钮', star !== null)
  check('Star 指向本仓库', star?.props?.href === 'https://github.com/star-Cosmo/dsh-model-tidy', star?.props?.href)
  check('Star 在新标签打开', star?.props?.target === '_blank')
  check('Star 带 noopener', star?.props?.rel === 'noreferrer noopener')
  check('Star 有图标与文字', (star?.children ?? []).length >= 2)
}

// ── 2. switches reflect the saved hidden list ───────────────────────────────
{
  const m = setup({ initial: { hidden: [{ provider: 'workbuddy', model: 'a', name: 'A' }] } })
  await m.controller.load()
  const tree = m.render()

  let on = 0
  let off = 0
  walk(tree, node => {
    const cls = node.props?.className
    if (node.tag === 'button' && typeof cls === 'string' && cls.startsWith('dsh-mt-switch')) {
      if (node.props['aria-checked'] === true) on += 1
      else off += 1
    }
  })
  check('两个开关为开', on === 2, String(on))
  check('一个开关为关', off === 1, String(off))

  let offSwitch = null
  walk(tree, node => {
    const cls = node.props?.className
    if (node.tag === 'button' && typeof cls === 'string' && cls.startsWith('dsh-mt-switch') && node.props['aria-checked'] === false) {
      offSwitch = node
    }
  })
  check('关闭的开关带 role=switch', offSwitch?.props?.role === 'switch')
  check('关闭的开关可点击', typeof offSwitch?.props?.onClick === 'function')
}

// ── 3. the loading state still carries the heading ──────────────────────────
{
  const m = setup()
  const tree = m.render() // rendered before load() resolves
  check('加载态含 heading', classesOf(tree).has('dsh-mt-head-row'))
  check('加载态有 Star 按钮', findStar(tree) !== null)
  check('加载态显示加载文案', classesOf(tree).has('dsh-mt-note'))
}

// ── 4. the error state still carries the heading ────────────────────────────
{
  const m = setup({ failCatalog: true })
  await m.controller.load()
  const tree = m.render()
  check('错误态含 heading', classesOf(tree).has('dsh-mt-head-row'))
  check('错误态有 Star 按钮', findStar(tree) !== null)
  check('错误态显示错误容器', classesOf(tree).has('dsh-mt-error'))
  check('错误态有重试按钮', classesOf(tree).has('dsh-mt-button'))
}

// ── 5. an empty catalogue says so ───────────────────────────────────────────
{
  const m = setup()
  await m.controller.load()
  m.controller.catalog = []
  m.controller.recompute()
  const tree = m.render()
  check('空目录显示提示', classesOf(tree).has('dsh-mt-note'))
  check('空目录下无卡片', countClass(tree, 'dsh-mt-card') === 0)
  check('空目录仍有 Star 按钮', findStar(tree) !== null)
}

console.log(failures === 0 ? '\n=== 渲染验证通过 ===' : `\n=== ${failures} 项失败 ===`)
process.exitCode = failures === 0 ? 0 : 1
