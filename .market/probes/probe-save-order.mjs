/**
 * Why does a save still trigger a catalogue read?
 *
 * `writing` is meant to gate the form subscription for the duration of our own
 * write. But `form.set()` is awaited, and the host's broadcast for the FIRST
 * field can arrive after the second `await` has already resolved — by which
 * time `finally { writing = false }` has run. The subscription then sees a
 * notification it cannot attribute to itself and calls `load()`, which replaces
 * `store.rows`, remounts the list, and (on the real host) bounces the page.
 *
 * This probe prints the order of events so the gate can be fixed against
 * evidence rather than a guess.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(here, '..')
const source = fs.readFileSync(path.join(repo, 'lib', 'client.js'), 'utf8')

function makeReact() {
  const hooks = []
  let cursor = 0
  return {
    createElement: (t, p, ...c) => ({ tag: t, props: p ?? {}, children: c.flat() }),
    createPortal: (n, ct) => ({ tag: '#portal', props: { container: ct }, children: [n] }),
    useState: v => { const i = cursor++; if (hooks.length <= i) hooks[i] = v; return [hooks[i], nv => { hooks[i] = nv }] },
    useRef: v => { const i = cursor++; if (hooks.length <= i) hooks[i] = { current: v }; return hooks[i] },
    useMemo: fn => { cursor++; return fn() },
    useCallback: fn => { cursor++; return fn },
    useEffect: fn => { cursor++ },
    useSyncExternalStore: (_s, snap) => { cursor++; return snap() },
  }
}

const groups = [{ id: 'workbuddy', name: 'WorkBuddy', models: [{ id: 'a', name: 'A' }] }]

const log = []
let stored = { hidden: [], renamed: [] }
const listeners = new Set()

const form = {
  getSnapshot: () => ({ status: 'ready', value: structuredClone(stored), writable: true, mode: 'host' }),
  subscribe(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  async set(field, value) {
    log.push(`set(${field}) 开始`)
    stored = { ...stored, [field]: structuredClone(value) }
    // The real host notifies on its own schedule, not necessarily synchronously.
    // Model the harsher case: notify after the microtask queue drains, which is
    // what a mirror fed by an async document fetch does.
    await Promise.resolve()
    log.push(`set(${field}) 广播`)
    for (const listener of [...listeners]) listener()
    log.push(`set(${field}) 返回`)
    return true
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
let reads = 0
const ctx = {
  effect: fn => { fn() },
  locale: { register: () => {}, bind: () => key => key },
  configForms: { get: () => form, whileServed: (_ns, fn) => fn() },
  slots: { inject: (_n, fn) => fn(), register: (d, c) => { mounted = { d, c }; return () => {} } },
  remote: {
    session: {
      modelCatalog: async () => {
        reads += 1
        log.push(`modelCatalog 读取 #${reads}`)
        return { ok: true, value: { groups } }
      },
    },
    $on: () => () => {},
  },
}
exports.apply(ctx)

const controller = mounted.d.inject().controller
await controller.load()
log.length = 0
log.push('--- load 完成，开始一次开关操作 ---')

controller.toggle('workbuddy\u0000a', false)
await controller.flush()
// Let any trailing microtasks/timers land.
await new Promise(r => setTimeout(r, 20))

console.log(log.join('\n'))
console.log('')
console.log('总目录读取次数（本次操作）:', reads)
console.log(reads <= 1 ? '  ✅ 保存未触发额外读取' : '  ❌ 保存触发了额外读取 —— 这就是页面刷新的来源')
