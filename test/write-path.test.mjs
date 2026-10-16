/**
 * Regressions for the two reported defects.
 *
 * Reported 1: hide every model of a provider, then switch a single one back on
 *             — the single switch did not stick.
 * Reported 2: any switch flipped the page back to the top.
 *
 * Both traced to the same method. `flush()` ended with `await this.load()`,
 * which (a) re-read the catalogue mid-write — the host broadcasts between the
 * two field writes, so the reload could merge a half-applied document over the
 * action the user had just taken — and (b) replaced `store.rows` with a fresh
 * array, remounting the list and discarding the scroll position.
 *
 * The doubles here therefore broadcast after EVERY field write, which is what
 * the real `ConfigFormController` does and what the earlier doubles missed.
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
    useState: v => { const i = cursor++; if (hooks.length <= i) hooks[i] = v; return [hooks[i], nv => { hooks[i] = nv }] },
    useRef: v => { const i = cursor++; if (hooks.length <= i) hooks[i] = { current: v }; return hooks[i] },
    useMemo: fn => { cursor++; return fn() },
    useCallback: fn => { cursor++; return fn },
    useEffect: fn => { cursor++ },
    useSyncExternalStore: (_s, snap) => { cursor++; return snap() },
  }
}

const groups = [
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

/** Mount the real browser half on a host that broadcasts after each write. */
function mount({ catalogueCalls } = {}) {
  let stored = { hidden: [], renamed: [] }
  const listeners = new Set()
  const writes = []

  const form = {
    getSnapshot: () => ({ status: 'ready', value: structuredClone(stored), writable: true, mode: 'host' }),
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async set(field, value) {
      writes.push({ field, value: structuredClone(value) })
      stored = { ...stored, [field]: structuredClone(value) }
      // The real mirror notifies on every document change, not once per save.
      for (const listener of [...listeners]) listener()
      return true
    },
    get stored() {
      return stored
    },
    writeCount: () => writes.length,
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
          if (catalogueCalls) catalogueCalls.count += 1
          return { ok: true, value: { groups } }
        },
      },
      $on: () => () => {},
    },
  }
  exports.apply(ctx)
  return { controller: mounted.d.inject().controller, form, writes }
}

const shape = controller => controller.store.rows.map(r => `${r.model}:${r.hidden ? 'H' : 'V'}`).join(' ')

// ── 1. the reported sequence: batch hide, then one switch back on ───────────
{
  const { controller, form } = mount()
  await controller.load()
  controller.toggleProvider('workbuddy', true)
  await controller.flush()
  check('批量隐藏后该渠道全为隐藏', shape(controller).startsWith('a:H b:H c:H'), shape(controller))

  controller.toggle('workbuddy\u0000a', false)
  check('单个开关立即在本地生效', shape(controller).startsWith('a:V b:H c:H'), shape(controller))
  await controller.flush()

  check('单个开关在宿主里生效', shape(controller).startsWith('a:V b:H c:H'), shape(controller))
  const hidden = form.stored.hidden.map(h => h.model).sort()
  check('宿主 hidden 只含未打开的项', JSON.stringify(hidden) === JSON.stringify(['b', 'c']), JSON.stringify(hidden))
}

// ── 2. the same, in the other direction ─────────────────────────────────────
{
  const { controller, form } = mount()
  await controller.load()
  controller.setAllHidden(true)
  await controller.flush()
  controller.toggle('gemini\u0000g', false)
  await controller.flush()
  const hidden = form.stored.hidden.map(h => h.model).sort()
  check('从全部隐藏中恢复单个也生效', JSON.stringify(hidden) === JSON.stringify(['a', 'b', 'c']), JSON.stringify(hidden))
}

// ── 3. a sequence of single flips all land ──────────────────────────────────
{
  const { controller, form } = mount()
  await controller.load()
  controller.toggle('workbuddy\u0000a', true)
  await controller.flush()
  controller.toggle('workbuddy\u0000b', true)
  await controller.flush()
  controller.toggle('workbuddy\u0000a', false)
  await controller.flush()
  const hidden = form.stored.hidden.map(h => h.model).sort()
  check('连续切换后状态正确', JSON.stringify(hidden) === JSON.stringify(['b']), JSON.stringify(hidden))
}

// ── 4. no catalogue re-read on save (the scroll bounce) ─────────────────────
// A reload replaces `store.rows`, which remounts the list. Counting the
// catalogue reads is the observable proxy for "the page jumped to the top".
{
  const calls = { count: 0 }
  const { controller } = mount({ catalogueCalls: calls })
  await controller.load()
  const afterLoad = calls.count
  controller.toggle('workbuddy\u0000a', true)
  await controller.flush()
  check('保存不会重新读取目录', calls.count === afterLoad, `load 调用从 ${afterLoad} 变为 ${calls.count}`)
}

// ── 5. only the touched row is replaced ─────────────────────────────────────
// `apply` maps over the rows, so the array identity does change — that is how
// an immutable update works, and the list is keyed by row key so React reuses
// the untouched rows. What must NOT change is the untouched row objects: if
// every row were rebuilt, every row would re-render.
{
  const { controller } = mount()
  await controller.load()
  const before = controller.store.rows
  const untouched = before.filter(r => r.model !== 'a')

  controller.toggle('workbuddy\u0000a', true)
  await controller.flush()

  const after = controller.store.rows
  const sameObjects = untouched.every(old => after.some(next => next === old))
  check('未改动的行对象被复用', sameObjects)
  check('被改动的行是新对象', after.find(r => r.model === 'a') !== before.find(r => r.model === 'a'))
}

// ── 6. a foreign change still reloads ───────────────────────────────────────
// Ignoring our own broadcast must not make the page deaf to everyone else's.
{
  const calls = { count: 0 }
  const { controller, form } = mount({ catalogueCalls: calls })
  await controller.load()
  const during = calls.count

  // A different surface writing the namespace: not inside our `writing` window,
  // and with no pending edit of ours. `set` notifies subscribers, so this
  // exercises exactly the path a foreign edit takes.
  await form.set('renamed', [{ provider: 'gemini', model: 'g', alias: '外来的' }])
  // The notification is synchronous; the reload it triggers is not.
  await new Promise(resolve => setTimeout(resolve, 10))

  check('外部变更仍会触发重新读取', calls.count > during, `${during} -> ${calls.count}`)
}

console.log(failures === 0 ? '\n=== 全部通过 ===' : `\n=== ${failures} 项失败 ===`)
process.exitCode = failures === 0 ? 0 : 1
