/**
 * Trace exactly what the controller writes, and what it holds, through one
 * single-model toggle.
 *
 * The checkbox test reports the host ending up with an EMPTY hidden list after
 * a toggle that should have stored one entry. This prints every write and every
 * local row state so the losing step is visible rather than inferred.
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
    beginRender() { cursor = 0 },
    createElement: (t, p, ...c) => ({ tag: t, props: p ?? {}, children: c.flat() }),
    createPortal: (n, ct) => ({ tag: '#portal', props: { container: ct }, children: [n] }),
    useState: v => { const i = cursor++; if (hooks.length <= i) hooks[i] = v; return [hooks[i], nv => { hooks[i] = typeof nv === 'function' ? nv(hooks[i]) : nv }] },
    useRef: v => { const i = cursor++; if (hooks.length <= i) hooks[i] = { current: v }; return hooks[i] },
    useMemo: fn => { cursor++; return fn() },
    useCallback: fn => { cursor++; return fn },
    useEffect: fn => { cursor++; fn() },
    useSyncExternalStore: (_s, snap) => { cursor++; return snap() },
  }
}

const FULL = [{ id: 'workbuddy', name: 'WorkBuddy', models: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] }]

let stored = { hidden: [], renamed: [] }
const listeners = new Set()
const trace = []

const form = {
  getSnapshot: () => ({ status: 'ready', value: structuredClone(stored), writable: true, mode: 'host' }),
  subscribe(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  async set(field, value) {
    trace.push(`  form.set('${field}', ${JSON.stringify(value)})`)
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
        const hidden = new Set((stored.hidden ?? []).map(h => `${h.provider}\u0000${h.model}`))
        trace.push(`  [读取目录] hidden=${JSON.stringify([...hidden])}`)
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
const show = () => controller.store?.rows?.map(r => `${r.model}:${r.hidden ? 'H' : 'V'}`).join(' ') ?? '(无 store)'

trace.push('render #1')
react.beginRender()
mounted.c(mounted.d.inject())
// The initial load is async; let it settle.
await new Promise(r => setTimeout(r, 10))
trace.push(`load 完成 -> ${show()}`)

trace.push('')
trace.push("toggle('a', true)  ← 隐藏 a")
controller.toggle('workbuddy\u0000a', true)
trace.push(`toggle 后 -> ${show()}`)

trace.push('')
trace.push('flush()')
await controller.flush()
trace.push(`flush 后 -> ${show()}`)
await new Promise(r => setTimeout(r, 20))
trace.push(`稳定后 -> ${show()}`)
trace.push(`宿主文档: ${JSON.stringify(stored)}`)

console.log(trace.join('\n'))
