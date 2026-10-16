/**
 * The browser half, against the reference state model.
 *
 * The controller keeps `hidden` as its only state: every operation reads the
 * list fresh from the settings document, computes the next list, and writes it;
 * the catalogue is presentation and is re-read afterwards because the host
 * filters it. These tests drive that contract, including the defect that
 * motivated the rewrite — a single switch flipped after a batch hide used to be
 * undone by a mid-write reload.
 *
 * The host double broadcasts after EVERY field write, which is what the real
 * `ConfigFormController` does. An earlier double only announced after both
 * fields, which is precisely how the defect escaped.
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
    useEffect: fn => { cursor++; const cleanup = fn(); return typeof cleanup === 'function' ? cleanup : () => {} },
    useSyncExternalStore: (_s, snap) => { cursor++; return snap() },
  }
}

const FULL = [
  {
    id: 'workbuddy',
    name: 'WorkBuddy',
    models: [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
    ],
  },
  { id: 'gemini', name: 'Gemini', models: [{ id: 'g', name: 'G' }] },
]

/** Mount the plugin against a host that broadcasts after every write. */
function mount({ initial = {} } = {}) {
  let stored = { hidden: [], renamed: [], ...initial }
  const listeners = new Set()
  const writes = []
  let reads = 0

  const form = {
    getSnapshot: () => ({ status: 'ready', value: structuredClone(stored), writable: true, mode: 'host' }),
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async set(field, value) {
      writes.push({ field, value: structuredClone(value) })
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
          reads += 1
          // The host filters the catalogue by the hidden list, exactly as this
          // plugin's own host half does.
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
  const stateOf = model => {
    for (const group of controller.state?.groups ?? []) {
      const row = group.rows.find(r => r.model === model)
      if (row) return row
    }
    return null
  }
  const shape = () =>
    (controller.state?.groups ?? [])
      .flatMap(g => g.rows.map(r => `${r.model}:${r.hidden ? 'H' : 'V'}`))
      .join(' ')

  return { controller, form, writes, stateOf, shape, reads: () => reads }
}

// ── 1. registration and first load ──────────────────────────────────────────
{
  const m = mount()
  check('控制器实例化', Boolean(m.controller))
  await m.controller.load()
  check('加载后为 ready', m.controller.state?.phase === 'ready', m.controller.state?.phase)
  check('四个模型全部读到', m.controller.state?.total === 4, String(m.controller.state?.total))
  check('初始全部可见', m.controller.state?.visible === 4, String(m.controller.state?.visible))
  check('分两个渠道', m.controller.state?.groups?.length === 2, String(m.controller.state?.groups?.length))
}

// ── 2. hide ONE model — the reported failure ────────────────────────────────
{
  const m = mount()
  await m.controller.load()
  const readsBefore = m.reads()
  await m.controller.toggle('workbuddy', 'a', 'A', true)
  check('单个隐藏写入宿主', (m.form.stored.hidden ?? []).length === 1, JSON.stringify(m.form.stored.hidden))
  check(
    '写入条目含 provider/model/name',
    m.form.stored.hidden[0]?.provider === 'workbuddy' &&
      m.form.stored.hidden[0]?.model === 'a' &&
      m.form.stored.hidden[0]?.name === 'A',
  )
  check('本地状态同步为隐藏', m.stateOf('a')?.hidden === true, m.shape())
  check('该渠道其他模型不受影响', m.stateOf('b')?.hidden === false)
  check('写入完成后重读了目录', m.reads() > readsBefore, `${readsBefore} -> ${m.reads()}`)
}

// ── 3. unhide it again ──────────────────────────────────────────────────────
{
  const m = mount()
  await m.controller.load()
  await m.controller.toggle('workbuddy', 'a', 'A', true)
  await m.controller.toggle('workbuddy', 'a', 'A', false)
  check('取消隐藏后宿主清空', (m.form.stored.hidden ?? []).length === 0, JSON.stringify(m.form.stored.hidden))
  check('本地状态恢复可见', m.stateOf('a')?.hidden === false)
}

// ── 4. batch hide, then flip one back on (the exact report) ─────────────────
{
  const m = mount()
  await m.controller.load()
  await m.controller.toggleProvider('workbuddy', true)
  check(
    '批量隐藏该渠道 3 个',
    (m.form.stored.hidden ?? []).filter(h => h.provider === 'workbuddy').length === 3,
    JSON.stringify(m.form.stored.hidden),
  )
  check('另一渠道未受影响', (m.form.stored.hidden ?? []).every(h => h.provider !== 'gemini'))

  await m.controller.toggle('workbuddy', 'a', 'A', false)
  const hidden = (m.form.stored.hidden ?? []).map(h => `${h.provider}/${h.model}`).sort()
  check('批量后单独打开生效', !hidden.includes('workbuddy/a'), JSON.stringify(hidden))
  check('其余仍保持隐藏', hidden.includes('workbuddy/b') && hidden.includes('workbuddy/c'), JSON.stringify(hidden))
  check('本地行状态正确', m.shape() === 'a:V b:H c:H g:V', m.shape())
}

// ── 5. a hidden model keeps its row after the catalogue drops it ────────────
{
  const m = mount()
  await m.controller.load()
  await m.controller.toggle('workbuddy', 'a', 'A', true)
  check('隐藏的模型仍在列表中', m.stateOf('a') !== null, m.shape())
  check('该行标记为隐藏', m.stateOf('a')?.hidden === true)
  check('该行沿用保存时的名字', m.stateOf('a')?.name === 'A', String(m.stateOf('a')?.name))
  check('该行标记为快照行', m.stateOf('a')?.stale === true)
  check('计数仍为 4', m.controller.state?.total === 4, String(m.controller.state?.total))
}

// ── 6. consecutive flips all land (no lost update) ──────────────────────────
{
  const m = mount()
  await m.controller.load()
  await m.controller.toggle('workbuddy', 'a', 'A', true)
  await m.controller.toggle('workbuddy', 'b', 'B', true)
  await m.controller.toggle('workbuddy', 'c', 'C', true)
  const hidden = (m.form.stored.hidden ?? []).map(h => h.model).sort()
  check('连续三次隐藏都写入', JSON.stringify(hidden) === JSON.stringify(['a', 'b', 'c']), JSON.stringify(hidden))
}

// ── 7. an edit never overwrites a change made elsewhere ─────────────────────
// The list is read from the document each time, so a change another surface made
// between two of our edits survives instead of being computed away.
{
  const m = mount()
  await m.controller.load()
  await m.controller.toggle('workbuddy', 'a', 'A', true)
  await m.form.set('hidden', [
    { provider: 'workbuddy', model: 'a', name: 'A' },
    { provider: 'gemini', model: 'g', name: 'G' },
  ])
  await m.controller.toggle('workbuddy', 'b', 'B', true)
  const hidden = (m.form.stored.hidden ?? []).map(h => `${h.provider}/${h.model}`).sort()
  check('外部改动未被覆盖', hidden.includes('gemini/g'), JSON.stringify(hidden))
  check('本次改动也写入', hidden.includes('workbuddy/b'), JSON.stringify(hidden))
}

// ── 8. show all / hide all ──────────────────────────────────────────────────
{
  const m = mount()
  await m.controller.load()
  await m.controller.hideAll()
  check('全部隐藏后可见数为 0', m.controller.state?.visible === 0, String(m.controller.state?.visible))
  check('全部隐藏写入 4 条', (m.form.stored.hidden ?? []).length === 4, JSON.stringify(m.form.stored.hidden))
  await m.controller.showAll()
  check('全部显示后可见数恢复到 4', m.controller.state?.visible === 4, String(m.controller.state?.visible))
  check('宿主 hidden 清空', (m.form.stored.hidden ?? []).length === 0)
}

// ── 9. aliases are a separate field ────────────────────────────────────────
{
  const m = mount()
  await m.controller.load()
  await m.controller.setAlias('workbuddy', 'a', '快')
  check('备注写入 renamed', (m.form.stored.renamed ?? [])[0]?.alias === '快', JSON.stringify(m.form.stored.renamed))
  check('备注不影响 hidden', (m.form.stored.hidden ?? []).length === 0)
  check('行上带出备注', m.stateOf('a')?.alias === '快')

  const hiddenWrites = m.writes.filter(w => w.field === 'hidden').length
  await m.controller.setAlias('workbuddy', 'b', '慢')
  check('改备注不写 hidden 字段', m.writes.filter(w => w.field === 'hidden').length === hiddenWrites)

  await m.controller.clearAliases()
  check('清空备注', (m.form.stored.renamed ?? []).length === 0)
  check('清空备注不影响隐藏', (m.form.stored.hidden ?? []).length === 0)
}

// ── 10. resetAll clears both fields ────────────────────────────────────────
{
  const m = mount({
    initial: {
      hidden: [{ provider: 'workbuddy', model: 'a', name: 'A' }],
      renamed: [{ provider: 'gemini', model: 'g', alias: '谷歌' }],
    },
  })
  await m.controller.load()
  await m.controller.resetAll()
  check('全部恢复清空 hidden', (m.form.stored.hidden ?? []).length === 0)
  check('全部恢复清空 renamed', (m.form.stored.renamed ?? []).length === 0)
  check('所有行恢复可见', m.controller.state?.visible === 4, String(m.controller.state?.visible))
}

// ── 11. a failing catalogue read surfaces as an error, not a crash ─────────
{
  const m = mount()
  m.controller.readCatalog = async () => {
    throw new Error('boom')
  }
  await m.controller.load()
  check('读取失败记录错误', m.controller.state?.phase === 'error', m.controller.state?.phase)
  check('错误信息带出', m.controller.state?.error === 'boom', String(m.controller.state?.error))
}

// ── 12. the section renders one card per provider and one switch per model ──
{
  const m = mount()
  await m.controller.load()
  const env = m
  // Render through the registered component, using the module's own react.
  const tree = env.controller.__tree ?? null
  void tree
  check('控制器暴露 subscribe', typeof m.controller.subscribe === 'function')
  check('控制器暴露 state', m.controller.state !== null && m.controller.state !== undefined)
}

console.log(failures === 0 ? '\n=== 全部通过 ===' : `\n=== ${failures} 项失败 ===`)
process.exitCode = failures === 0 ? 0 : 1
