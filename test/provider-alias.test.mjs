/**
 * Channel renaming.
 *
 * A channel is not a model: it has an `id` and a display name, lives in
 * `listProviders()` rather than `listModels()`, and carries no billing suffix.
 * Its label therefore lives in its own `providerRenamed` field, and this suite
 * pins down the three properties that matter:
 *
 *   1. The host swaps only `name`, never `id` — routing keys off the id, so a
 *      session mid-conversation with a renamed channel must keep working.
 *   2. The rename is independent of the model aliases, the hidden list and the
 *      channel order: none of them is disturbed, and none of them leaks.
 *   3. The section shows the alias in place of the published name and keeps the
 *      id visible beside it, so the channel stays identifiable.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(here, '..')
const host = await import('../lib/index.js')
const clientSource = fs.readFileSync(path.join(repo, 'lib', 'client.js'), 'utf8')

let failures = 0
const check = (label, ok, extra = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`)
  if (!ok) failures += 1
}

const live = rows => ({ get: () => rows })

// ── 1. the pure host-side relabel ──────────────────────────────────────────
{
  const providers = [
    { id: 'wb', name: 'WorkBuddy' },
    { id: 'gm', name: 'Gemini' },
  ]
  const out = host.orderProviders(providers, [], [{ provider: 'wb', alias: '主力渠道' }])
  check('改了指定渠道的显示名', out[0].name === '主力渠道', out[0].name)
  check('渠道 id 不变', out[0].id === 'wb')
  check('未指定渠道保持原名', out[1].name === 'Gemini')
  check('不修改输入数组', providers[0].name === 'WorkBuddy')

  const blank = host.orderProviders(providers, [], [{ provider: 'wb', alias: '   ' }])
  check('空白备注被忽略', blank[0].name === 'WorkBuddy')

  const both = host.orderProviders(providers, ['gm'], [{ provider: 'gm', alias: '备用' }])
  check('改名与排序同时生效：顺序正确', both[0].id === 'gm')
  check('改名与排序同时生效：名字正确', both[0].name === '备用')
}

// ── 2. the host relabels what `listProviders` hands the picker ─────────────
{
  class FakeLlm {
    listModels() { return Promise.resolve([]) }
    listProviders() { return [{ id: 'wb', name: 'WorkBuddy' }, { id: 'gm', name: 'Gemini' }] }
  }
  const llm = new FakeLlm()
  host.apply(
    { llm, fiber: {}, inject: () => {}, effect: fn => { fn() } },
    {
      hidden: live([]),
      renamed: live([]),
      providerOrder: live([]),
      providerRenamed: live([{ provider: 'gm', alias: '便宜渠道' }]),
    },
  )
  const out = llm.listProviders()
  check('选择器拿到的渠道名已替换', out[1].name === '便宜渠道', out[1].name)
  check('渠道仍按 id 标识', out[1].id === 'gm')
  check('未改名的渠道不受影响', out[0].name === 'WorkBuddy')
}

// ── 3. the two rename tables stay independent ──────────────────────────────
{
  class FakeLlm {
    async listModels(provider) { return provider === 'wb' ? [{ id: 'm1', name: 'm1' }] : [] }
    listProviders() { return [{ id: 'wb', name: 'WorkBuddy' }] }
  }
  const llm = new FakeLlm()
  host.apply(
    { llm, fiber: {}, inject: () => {}, effect: fn => { fn() } },
    {
      hidden: live([]),
      renamed: live([{ provider: 'wb', model: 'm1', alias: '模型别名' }]),
      providerOrder: live([]),
      providerRenamed: live([{ provider: 'wb', alias: '渠道别名' }]),
    },
  )
  check('模型备注仍然生效', (await llm.listModels('wb'))[0].name === '模型别名')
  check('渠道备注同时生效', llm.listProviders()[0].name === '渠道别名')
}

// ── 4. the section shows the alias and keeps the id ───────────────────────
function makeReact() {
  const cells = []
  let cursor = 0
  return {
    reset: () => { cursor = 0 },
    createElement: (tag, props, ...children) => ({ tag, props: props ?? {}, children: children.flat() }),
    createPortal: (node, container) => ({ tag: '#portal', props: { container }, children: [node] }),
    useState: v => {
      const i = cursor++
      if (!(i in cells)) cells[i] = v
      return [cells[i], nv => { cells[i] = typeof nv === 'function' ? nv(cells[i]) : nv }]
    },
    useRef: v => { const i = cursor++; if (!(i in cells)) cells[i] = { current: v }; return cells[i] },
    useMemo: fn => { cursor++; return fn() },
    useCallback: fn => { cursor++; return fn },
    useEffect: fn => { cursor++; const c = fn(); return typeof c === 'function' ? c : () => {} },
    useSyncExternalStore: (_s, snap) => { cursor++; return snap() },
  }
}

const CATALOGUE = [
  { id: 'wb', name: 'WorkBuddy', models: [{ id: 'a', name: 'A' }] },
  { id: 'gm', name: 'Gemini', models: [{ id: 'g', name: 'G' }] },
]

function mount({ initial = {} } = {}) {
  let stored = { hidden: [], renamed: [], order: [], providerOrder: [], providerRenamed: [], ...initial }
  const form = {
    getSnapshot: () => ({ status: 'ready', value: structuredClone(stored), writable: true, mode: 'host' }),
    subscribe: () => () => {},
    async set(field, value) {
      stored = { ...stored, [field]: structuredClone(value) }
      return true
    },
    get stored() { return stored },
  }
  const react = makeReact()
  let descriptor = null
  new Function('window', clientSource)({ __ModuleLoader__: { load: d => { descriptor = d } } })
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
  return { controller, render, form }
}

const walk = (node, visit) => {
  if (node === null || node === undefined || typeof node !== 'object') return
  visit(node)
  for (const child of node.children ?? []) walk(child, visit)
}

const textOf = node => {
  if (typeof node === 'string') return node
  if (node === null || node === undefined) return ''
  return (node.children ?? []).map(textOf).join('')
}

// ── 5. the controller round-trips a channel alias ─────────────────────────
{
  const { controller, form } = mount()
  await controller.load()
  await controller.setProviderAlias('wb', '主力')
  const saved = form.stored.providerRenamed
  check('渠道备注写入 providerRenamed', Array.isArray(saved) && saved.length === 1 && saved[0].alias === '主力')
  check('写入的键是渠道 id', saved[0].provider === 'wb')
  check('未触碰模型备注', (form.stored.renamed ?? []).length === 0)

  await controller.setProviderAlias('wb', '')
  check('空白备注删除该条目', (form.stored.providerRenamed ?? []).length === 0)
}

// ── 6. the header renders the alias, not the published name ───────────────
{
  const { controller, render } = mount({ initial: { providerRenamed: [{ provider: 'wb', alias: '主力渠道' }] } })
  await controller.load()
  const tree = render()
  let header = null
  walk(tree, node => {
    if (header === null && node.props?.className === 'dsh-mt-prov-name') header = node
  })
  const text = textOf(header)
  check('渠道头显示备注名', text.includes('主力渠道'), text)
  check('同时保留渠道 id', text.includes('wb'), text)
  check('不再显示原渠道名', !text.includes('WorkBuddy'), text)
}

// ── 7. the rename entry point is on every card ────────────────────────────
{
  const { controller, render } = mount()
  await controller.load()
  const tree = render()
  let buttons = 0
  walk(tree, node => {
    if (node.tag === 'button' && node.props?.title === 'providerAliasSet') buttons += 1
  })
  check('每个渠道卡片都有改名入口', buttons === 2, `找到 ${buttons} 个`)
}

console.log(failures === 0 ? '\n=== 渠道改名验证通过 ===' : `\n=== ${failures} 项失败 ===`)
process.exitCode = failures === 0 ? 0 : 1
