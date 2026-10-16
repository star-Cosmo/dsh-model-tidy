/**
 * Offline harness for the browser half.
 *
 * `lib/client.js` is not an ES module — it is a factory the harness's client
 * module system calls with a CommonJS `require`. This file rebuilds just
 * enough of that environment to load the real file and drive it: a fake
 * `window.__ModuleLoader__`, a minimal `require` that answers `react` with a
 * hand-rolled hook runtime, and a `ctx` recording what the plugin registers.
 *
 * It exists so the wiring can be checked without a browser. It is not a test
 * of React's behaviour: the fake runtime runs the component once, which is
 * enough to catch a broken contract (a missing export, a slot registered under
 * the wrong name, a controller that never loads the catalogue).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

let failures = 0
function check(label, ok) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) failures += 1
}

// ── a hook runtime small enough to render one pass ───────────────────────────
function makeReact() {
  const hooks = []
  let cursor = 0
  const slots = []          // effect callbacks, run after the render
  const cleanup = []        // effect cleanups, returned by unmount
  return {
    __slots: slots,
    __cleanup: cleanup,
    createElement: (tag, props, ...children) => ({ tag, props: props ?? {}, children: children.flat() }),
    useState: initial => {
      const i = cursor++
      if (hooks.length <= i) hooks[i] = typeof initial === 'function' ? initial() : initial
      const set = value => {
        hooks[i] = typeof value === 'function' ? value(hooks[i]) : value
      }
      return [hooks[i], set]
    },
    useRef: initial => {
      const i = cursor++
      if (hooks.length <= i) hooks[i] = { current: initial }
      return hooks[i]
    },
    useMemo: (fn) => {
      cursor++
      return fn()
    },
    useCallback: (fn) => {
      cursor++
      return fn
    },
    useEffect: (fn, deps) => {
      const i = cursor++
      const prev = hooks[i]
      const changed = !prev || !deps || deps.some((d, k) => d !== prev.deps?.[k])
      hooks[i] = { deps }
      if (changed) slots.push(fn)
    },
    useSyncExternalStore: (subscribe, getSnapshot) => {
      cursor++
      return getSnapshot()
    },
    __reset: () => {
      cursor = 0
      slots.length = 0
    },
  }
}

/** Build the fake environment and load the real client file. */
export function loadClient() {
  const react = makeReact()
  const source = fs.readFileSync(path.join(here, '..', 'lib', 'client.js'), 'utf8')

  let loaded = null
  const window = {
    __ModuleLoader__: {
      // Mirror the descriptor onto the loader object as well as the closure:
      // the tests want to assert on what the file registered, and the real
      // loader keeps it internally, so both views are useful here.
      load: descriptor => {
        loaded = descriptor
        window.__ModuleLoader__.__loaded = descriptor
      },
    },
  }
  const require = spec => {
    if (spec === 'react') return react
    throw new Error(`unexpected require("${spec}")`)
  }

  // The file assigns to `window.__ModuleLoader__`, so hand it the fake one.
  const run = new Function('window', `${source}\n;return window.__ModuleLoader__.__loaded`)
  run(window)
  if (loaded === null) throw new Error('client.js never called __ModuleLoader__.load')

  const exports = loaded.factory(require)
  return { exports, react, window }
}

/** A `ctx` double that records registrations and lets effects be disposed. */
export function makeCtx({ groups, formValue = {} } = {}) {
  const registered = { locale: [], slots: [], listeners: [], effects: [] }
  const writes = []
  let current = { hidden: [], renamed: [], ...formValue }

  const form = {
    get value() {
      return current
    },
    async set(next) {
      writes.push(next)
      current = { hidden: [], renamed: [], ...next }
    },
  }

  const ctx = {
    locale: {
      register: (ns, dict) => {
        registered.locale.push({ ns, dict })
        return () => {}
      },
      bind: () => key => key,
    },
    configForms: {
      get: ns => form,
      whileServed: (_ns, fn) => fn(),
    },
    slots: {
      inject: (_name, fn) => fn(),
      register: (descriptor, component) => {
        registered.slots.push({ descriptor, component })
        return () => {}
      },
    },
    remote: {
      session: {
        modelCatalog: async () => ({ ok: true, value: { groups } }),
      },
      $on: (event, handler) => {
        registered.listeners.push({ event, handler })
        return () => {}
      },
    },
    effect: fn => {
      const dispose = fn()
      registered.effects.push(dispose)
      return () => {}
    },
  }

  return { ctx, registered, writes, form, state: () => current }
}

export function report() {
  console.log(failures === 0 ? '\n=== 全部通过 ===' : `\n=== ${failures} 项失败 ===`)
  process.exitCode = failures === 0 ? 0 : 1
}

export { check }
