/**
 * Channel ordering.
 *
 * The channels are the provider cards. The picker builds its groups from
 * `listProviders()` and keeps that array's order, so the arrangement lives in a
 * new `providerOrder` field and is applied in two places: the host reorders the
 * array it hands out, and the section reorders its own cards so the two never
 * disagree.
 *
 * Both halves are covered here — `orderProviders` directly, and the controller's
 * move/reset through a filled-in settings document.
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

const ids = list => list.map(entry => entry.id)

// ── 1. the host-side reorder ───────────────────────────────────────────────
{
  const providers = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]
  check('未排序时原样返回', JSON.stringify(ids(host.orderProviders(providers, []))) === JSON.stringify(['a', 'b', 'c', 'd']))
  check(
    '只排列部分渠道，其余追加在后',
    JSON.stringify(ids(host.orderProviders(providers, ['c', 'a']))) === JSON.stringify(['c', 'a', 'b', 'd']),
    JSON.stringify(ids(host.orderProviders(providers, ['c', 'a']))),
  )
  check(
    '排列全部渠道',
    JSON.stringify(ids(host.orderProviders(providers, ['d', 'c', 'b', 'a']))) === JSON.stringify(['d', 'c', 'b', 'a']),
  )
  check(
    '忽略不存在的渠道 id',
    JSON.stringify(ids(host.orderProviders(providers, ['z', 'c']))) === JSON.stringify(['c', 'a', 'b', 'd']),
    JSON.stringify(ids(host.orderProviders(providers, ['z', 'c']))),
  )
  check('重复 id 不会复制渠道', ids(host.orderProviders(providers, ['a', 'a'])).length === 4)
  check('空列表原样返回', host.orderProviders([], ['a']).length === 0)
  check('不修改输入数组', JSON.stringify(ids(providers)) === JSON.stringify(['a', 'b', 'c', 'd']))
}

// ── 2. the host reorders what `listProviders` hands the picker ────────────
// This is the property that makes the feature visible outside the settings
// page: `buildModelCatalog` maps over this array and `Promise.all` keeps order.
{
  const base = () => [{ id: 'wb' }, { id: 'gm' }, { id: 'or' }]
  class FakeLlm {
    listModels() { return Promise.resolve([]) }
    listProviders() { return base() }
  }
  const llm = new FakeLlm()
  host.apply(
    { llm, fiber: {}, inject: () => {}, effect: fn => { fn() } },
    { hidden: { get: () => [] }, renamed: { get: () => [] }, providerOrder: { get: () => ['or', 'wb'] } },
  )
  check(
    '宿主交出的渠道已重排',
    JSON.stringify(ids(llm.listProviders())) === JSON.stringify(['or', 'wb', 'gm']),
    JSON.stringify(ids(llm.listProviders())),
  )
  check('未列出的渠道追加在后', ids(llm.listProviders())[2] === 'gm')
}

// ── 3. a host without listProviders still loads ───────────────────────────
{
  const llm = {
    listModels: async () => [],
  }
  let threw = null
  try {
    host.apply(
      { llm, fiber: {}, inject: () => {}, effect: fn => { fn() } },
      { hidden: { get: () => [] }, renamed: { get: () => [] }, providerOrder: { get: () => ['x'] } },
    )
  } catch (error) {
    threw = error
  }
  check('缺少 listProviders 时插件仍能加载', threw === null, String(threw?.message ?? ''))
  check('不会凭空造出 listProviders', typeof llm.listProviders === 'undefined')
}

// ── 4. the controller moves and persists channels ─────────────────────────
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
  { id: 'or', name: 'Our Free', models: [{ id: 'o', name: 'O' }] },
]

function mount({ initial = {} } = {}) {
  let stored = { hidden: [], renamed: [], order: [], providerOrder: [], ...initial }
  const form = {
    getSnapshot: () => ({ status: 'ready', value: structuredClone(stored), writable: true, mode: 'host' }),
    subscribe: () => () => {},
    async set(field, value) {
      stored = { ...stored, [field]: structuredClone(value) }
      return true
    },
    get stored() { return stored },
  }
  let descriptor = null
  new Function('window', clientSource)({ __ModuleLoader__: { load: d => { descriptor = d } } })
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
  const order = () => (controller.state?.groups ?? []).map(group => group.id)
  return { controller, form, order }
}

{
  const m = mount()
  await m.controller.load()
  check('初始为宿主顺序', JSON.stringify(m.order()) === JSON.stringify(['wb', 'gm', 'or']), JSON.stringify(m.order()))

  await m.controller.moveProvider('or', 'up')
  check('上移一个位置', JSON.stringify(m.order()) === JSON.stringify(['wb', 'or', 'gm']), JSON.stringify(m.order()))
  check('顺序已写入宿主', JSON.stringify(m.form.stored.providerOrder) === JSON.stringify(['wb', 'or', 'gm']), JSON.stringify(m.form.stored.providerOrder))

  await m.controller.moveProvider('or', 'up')
  check('移到最前', JSON.stringify(m.order()) === JSON.stringify(['or', 'wb', 'gm']), JSON.stringify(m.order()))

  const atTop = await m.controller.moveProvider('or', 'up')
  check('首位再上移无效', atTop === false)
  const atBottom = await m.controller.moveProvider('gm', 'down')
  check('末位再下移无效', atBottom === false)

  await m.controller.load()
  check('重新读取目录后顺序保持', JSON.stringify(m.order()) === JSON.stringify(['or', 'wb', 'gm']), JSON.stringify(m.order()))
}

// ── 5. a cold start reads the saved channel order ─────────────────────────
{
  const m = mount({ initial: { providerOrder: ['or', 'gm', 'wb'] } })
  await m.controller.load()
  check('冷启动按保存的顺序排列', JSON.stringify(m.order()) === JSON.stringify(['or', 'gm', 'wb']), JSON.stringify(m.order()))
}

// ── 6. channels the arrangement does not name trail it ────────────────────
{
  const m = mount({ initial: { providerOrder: ['or'] } })
  await m.controller.load()
  check('只排了一个渠道时其余保持宿主顺序', JSON.stringify(m.order()) === JSON.stringify(['or', 'wb', 'gm']), JSON.stringify(m.order()))
}

// ── 7. reset returns to host order ────────────────────────────────────────
{
  const m = mount({ initial: { providerOrder: ['or', 'gm', 'wb'] } })
  await m.controller.load()
  const okReset = await m.controller.resetProviderOrder()
  check('重置返回 true', okReset === true)
  check('回到宿主顺序', JSON.stringify(m.order()) === JSON.stringify(['wb', 'gm', 'or']), JSON.stringify(m.order()))
  check('宿主字段被清空', JSON.stringify(m.form.stored.providerOrder) === JSON.stringify([]))

  const again = await m.controller.resetProviderOrder()
  check('无自定义顺序时重置返回 false', again === false)
}

// ── 8. model order and channel order are independent ──────────────────────
{
  const m = mount()
  await m.controller.load()
  await m.controller.moveProvider('or', 'up')
  check('移动渠道没有写入模型顺序', JSON.stringify(m.form.stored.order) === JSON.stringify([]), JSON.stringify(m.form.stored.order))
  await m.controller.moveModel('wb', 'a', 'down', ['a'])
  check('移动模型没有写入渠道顺序', JSON.stringify(m.form.stored.providerOrder) === JSON.stringify(['wb', 'or', 'gm']), JSON.stringify(m.form.stored.providerOrder))
}

console.log(failures === 0 ? '\n=== 全部通过 ===' : `\n=== ${failures} 项失败 ===`)
process.exitCode = failures === 0 ? 0 : 1
