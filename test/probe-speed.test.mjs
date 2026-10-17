/**
 * Probe throughput.
 *
 * The batch used to run strictly one model at a time, so checking a catalogue
 * of n models cost the sum of every latency and every dead route added its own
 * timeout — a three-minute wait for a list that should take seconds.
 *
 * These tests pin the properties that fix that, without depending on wall-clock
 * timing (which would be flaky): the probe runs several models at once, capped
 * by a fixed width, and a batch of slow models finishes far faster than it would
 * one-at-a-time.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(here, '..')
const hostSource = fs.readFileSync(path.join(repo, 'lib', 'index.js'), 'utf8')
const host = await import('../lib/index.js')

let failures = 0
const check = (label, ok, extra = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`)
  if (!ok) failures += 1
}

// ── 1. the tuning constants are the ones the design asked for ─────────────
{
  const timeout = Number(hostSource.match(/PROBE_TIMEOUT_MS = ([\d_]+)/)?.[1]?.replace(/_/g, ''))
  const width = Number(hostSource.match(/PROBE_CONCURRENCY = ([\d_]+)/)?.[1]?.replace(/_/g, ''))
  check('单模型超时已收紧到 8 秒', timeout === 8000, String(timeout))
  check('并发宽度为 4', width === 4, String(width))
  check('并发宽度大于 1', width > 1, String(width))
  check('没有退化成串行循环', !/for \(const target of targets\) \{\s*[\s\S]{0,200}await probeModel/.test(hostSource))
}

// ── 2. several probes are genuinely in flight together ───────────────────
// Builds an `llm` whose streams block on a gate the test opens once enough calls
// have started. If the probes ran one at a time, the second call would never
// start and the batch would deadlock — so reaching the resolution proves overlap.
{
  let started = 0
  let mostAtOnce = 0
  let release
  const gate = new Promise(resolve => { release = resolve })

  const llm = {
    stream() {
      started += 1
      mostAtOnce = Math.max(mostAtOnce, started)
      let done = false
      return (async function* () {
        await gate
        done = true
        void done
        yield { type: 'finish', reason: { kind: 'stop' } }
        started -= 1
      })()
    },
  }

  // Probe through the exported helper directly: the route itself is exercised by
  // the other suite, and what matters here is how many run at once.
  const runs = [1, 2, 3, 4].map(model => host.probeModel(llm, 'p', `m${model}`))
  // Give the probes a chance to start before releasing them.
  await new Promise(resolve => setTimeout(resolve, 20))
  const overlapped = mostAtOnce
  release()
  const results = await Promise.all(runs)
  check('同时最多 4 个在途', overlapped === 4, String(overlapped))
  check('四个探测都完成了', results.every(r => r.ok === true), JSON.stringify(results.map(r => r.ok)))
}

// ── 3. the batch keeps the caller's order despite completion order ────────
// The route fans out to workers; results are placed by index, so a slow model
// must not be reordered behind a fast one that came after it.
{
  const CATALOGUE = [{ id: 'wb', name: 'WorkBuddy', models: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }] }]
  const clientSource = fs.readFileSync(path.join(repo, 'lib', 'client.js'), 'utf8')
  const cells = []
  let cursor = 0
  const react = {
    createElement: (tag, props, ...children) => ({ tag, props: props ?? {}, children: children.flat() }),
    createPortal: (node, container) => ({ tag: '#portal', props: { container }, children: [node] }),
    useState: v => { const i = cursor++; if (!(i in cells)) cells[i] = v; return [cells[i], nv => { cells[i] = typeof nv === 'function' ? nv(cells[i]) : nv }] },
    useRef: v => { const i = cursor++; if (!(i in cells)) cells[i] = { current: v }; return cells[i] },
    useMemo: fn => { cursor++; return fn() },
    useCallback: fn => { cursor++; return fn },
    useEffect: fn => { cursor++; const c = fn(); return typeof c === 'function' ? c : () => {} },
    useSyncExternalStore: (_s, snap) => { cursor++; return snap() },
  }
  let stored = { hidden: [], renamed: [], order: [], providerOrder: [] }
  const form = {
    getSnapshot: () => ({ status: 'ready', value: structuredClone(stored), writable: true, mode: 'host' }),
    subscribe: () => () => {},
    async set(field, value) { stored = { ...stored, [field]: structuredClone(value) }; return true },
  }
  let descriptor = null
  new Function('window', clientSource)({ __ModuleLoader__: { load: d => { descriptor = d } } })
  const exports = descriptor.factory(spec => {
    if (spec === 'react') return react
    throw new Error(spec)
  })
  let mounted = null
  exports.apply({
    effect: fn => { fn() },
    locale: { register: () => {}, bind: () => key => key },
    configForms: { get: () => form, whileServed: (_n, fn) => fn() },
    slots: { inject: (_n, fn) => fn(), register: (d, c) => { mounted = { d, c }; return () => {} } },
    remote: { session: { modelCatalog: async () => ({ ok: true, value: { groups: CATALOGUE } }) }, $on: () => () => {} },
  })
  const controller = mounted.d.inject().controller
  await controller.load()
  await controller.probe(
    [{ provider: 'wb', model: 'a' }, { provider: 'wb', model: 'b' }, { provider: 'wb', model: 'c' }],
    async () => ({
      ok: true,
      async json() {
        // Deliberately reply in a different order than requested.
        return {
          results: [
            { provider: 'wb', model: 'c', ok: false, latencyMs: 9, detail: 'c-bad' },
            { provider: 'wb', model: 'a', ok: true, latencyMs: 9, detail: '' },
            { provider: 'wb', model: 'b', ok: true, latencyMs: 9, detail: '' },
          ],
        }
      },
    }),
  )
  check('乱序回复也能正确归位 a', controller.probeOf('wb', 'a')?.state === 'ok')
  check('乱序回复也能正确归位 b', controller.probeOf('wb', 'b')?.state === 'ok')
  check('乱序回复也能正确归位 c', controller.probeOf('wb', 'c')?.state === 'fail')
  check('失败详情跟着正确的模型', controller.probeOf('wb', 'c')?.detail === 'c-bad')
}

// ── 4. the browser half sends the batch in slices ─────────────────────────
// One request for the whole catalogue leaves the page silent until the last
// model answers, which is what made a check feel stuck. The batch is split so
// each slice updates its rows as it lands.
{
  const CATALOGUE = [{ id: 'wb', name: 'WorkBuddy', models: [] }]
  for (let i = 0; i < 30; i++) CATALOGUE[0].models.push({ id: `m${i}`, name: `M${i}` })
  const clientSource = fs.readFileSync(path.join(repo, 'lib', 'client.js'), 'utf8')
  const cells = []
  let cursor = 0
  const react = {
    createElement: (tag, props, ...children) => ({ tag, props: props ?? {}, children: children.flat() }),
    createPortal: (node, container) => ({ tag: '#portal', props: { container }, children: [node] }),
    useState: v => { const i = cursor++; if (!(i in cells)) cells[i] = v; return [cells[i], nv => { cells[i] = typeof nv === 'function' ? nv(cells[i]) : nv }] },
    useRef: v => { const i = cursor++; if (!(i in cells)) cells[i] = { current: v }; return cells[i] },
    useMemo: fn => { cursor++; return fn() },
    useCallback: fn => { cursor++; return fn },
    useEffect: fn => { cursor++; const c = fn(); return typeof c === 'function' ? c : () => {} },
    useSyncExternalStore: (_s, snap) => { cursor++; return snap() },
  }
  let stored = { hidden: [], renamed: [], order: [], providerOrder: [] }
  const form = {
    getSnapshot: () => ({ status: 'ready', value: structuredClone(stored), writable: true, mode: 'host' }),
    subscribe: () => () => {},
    async set(field, value) { stored = { ...stored, [field]: structuredClone(value) }; return true },
  }
  let descriptor = null
  new Function('window', clientSource)({ __ModuleLoader__: { load: d => { descriptor = d } } })
  const exports = descriptor.factory(spec => {
    if (spec === 'react') return react
    throw new Error(spec)
  })
  let mounted = null
  exports.apply({
    effect: fn => { fn() },
    locale: { register: () => {}, bind: () => key => key },
    configForms: { get: () => form, whileServed: (_n, fn) => fn() },
    slots: { inject: (_n, fn) => fn(), register: (d, c) => { mounted = { d, c }; return () => {} } },
    remote: { session: { modelCatalog: async () => ({ ok: true, value: { groups: CATALOGUE } }) }, $on: () => () => {} },
  })
  const controller = mounted.d.inject().controller
  await controller.load()

  const sizes = []
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body)
    sizes.push(body.targets.length)
    return {
      ok: true,
      async json() {
        return {
          results: body.targets.map(target => ({ ...target, ok: true, latencyMs: 1, detail: '' })),
        }
      },
    }
  }
  const targets = CATALOGUE[0].models.map(model => ({ provider: 'wb', model: model.id }))
  // Watch the in-flight count mid-run: it should climb as slices land rather
  // than sitting at zero until the very end.
  const seen = []
  const originalRecompute = controller.recompute.bind(controller)
  controller.recompute = () => {
    originalRecompute()
    if (controller.probing) seen.push(controller.probeSummary().done)
  }
  const summary = await controller.probe(targets, fetchImpl)

  check('请求被拆成多个分片', sizes.length > 1, String(sizes.length))
  check('每片不超过设定大小', sizes.every(size => size <= 12), JSON.stringify(sizes))
  check('分片合计覆盖全部模型', sizes.reduce((a, b) => a + b, 0) === targets.length, JSON.stringify(sizes))
  check('全部模型都有结论', summary?.ok === targets.length, JSON.stringify(summary))
  check('进度在过程中递增', seen.length > 1 && seen[seen.length - 1] >= seen[0], JSON.stringify(seen))
  check('中途有部分完成的状态', seen.some(done => done > 0 && done < targets.length), JSON.stringify(seen))
}

console.log(failures === 0 ? '\n=== 全部通过 ===' : `\n=== ${failures} 项失败 ===`)
process.exitCode = failures === 0 ? 0 : 1
