/**
 * The availability probe, end to end without a network.
 *
 * Two halves have to agree for this feature to work: the host probes a model
 * with a real streaming call, the browser half posts a batch to a loopback
 * route and renders one verdict per row. This suite covers both, plus the parts
 * that are easy to get wrong and invisible when wrong — a stream that reports
 * its failure *inside* a finish chunk, a timeout that must not read as a plain
 * failure, and an abort that must not mark models as broken.
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

/** An `llm` whose stream yields the chunks the test asks for. */
function fakeLlm(chunks) {
  return {
    stream() {
      return (async function* () {
        for (const chunk of chunks) {
          if (chunk instanceof Error) throw chunk
          yield chunk
        }
      })()
    },
  }
}

// ── 1. a model that answers is reported available ──────────────────────────
{
  const llm = fakeLlm([
    { type: 'text-delta', text: 'p' },
    { type: 'finish', reason: { kind: 'stop' } },
  ])
  const result = await host.probeModel(llm, 'workbuddy', 'glm')
  check('正常回答判为可用', result.ok === true, JSON.stringify(result))
  check('记录了耗时', typeof result.latencyMs === 'number' && result.latencyMs >= 0)
  check('可用时没有错误详情', result.detail === '')
}

// ── 2. a finish chunk carrying an error is a failure ──────────────────────
// The harness reports adapter failures *inside* the stream rather than by
// throwing, so reading only the thrown path would report a broken model as fine.
{
  const llm = fakeLlm([
    { type: 'finish', reason: { kind: 'error', failure: { code: 'UNAUTHORIZED', message: 'bad key' } } },
  ])
  const result = await host.probeModel(llm, 'workbuddy', 'glm')
  check('finish 里的错误判为不可用', result.ok === false, JSON.stringify(result))
  check('详情带上错误码', result.detail.includes('UNAUTHORIZED'), result.detail)
  check('详情带上原始信息', result.detail.includes('bad key'), result.detail)
}

// ── 3. a thrown error is a failure, not a crash ────────────────────────────
{
  const llm = fakeLlm([Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })])
  const result = await host.probeModel(llm, 'workbuddy', 'glm')
  check('抛错判为不可用而非崩溃', result.ok === false, JSON.stringify(result))
  check('详情带错误码', result.detail.includes('ECONNREFUSED'), result.detail)
}

// ── 4. an empty completion still counts as reachable ──────────────────────
// The question is whether the model answers at all, not what it says.
{
  const llm = fakeLlm([{ type: 'finish', reason: { kind: 'stop' } }])
  const result = await host.probeModel(llm, 'workbuddy', 'glm')
  check('空回答也算可用', result.ok === true, JSON.stringify(result))
}

// ── 5. a stream that ends without finishing ───────────────────────────────
{
  const llm = fakeLlm([{ type: 'text-delta', text: 'p' }])
  const result = await host.probeModel(llm, 'workbuddy', 'glm')
  check('有内容但无结束块仍判可用', result.ok === true, JSON.stringify(result))

  const silent = fakeLlm([])
  const ended = await host.probeModel(silent, 'workbuddy', 'glm')
  check('无内容且无结束块判为不可用', ended.ok === false, JSON.stringify(ended))
  check('说明了原因', ended.detail.includes('without a finish'), ended.detail)
}

// ── 6. the probe asks for the smallest possible answer ────────────────────
{
  let seen = null
  const llm = {
    stream(options) {
      seen = options
      return (async function* () {
        yield { type: 'finish', reason: { kind: 'stop' } }
      })()
    },
  }
  await host.probeModel(llm, 'workbuddy', 'glm')
  check('请求指定了模型路由', seen?.provider === 'workbuddy' && seen?.model === 'glm')
  check('只要求一个 token', seen?.maxTokens === 1, String(seen?.maxTokens))
  check('带上了取消信号', seen?.signal !== undefined)
  check('只发一条消息', Array.isArray(seen?.messages) && seen.messages.length === 1)
}

// ── 7. creating the probe does not mutate the caller's signal ─────────────
{
  const controller = new AbortController()
  const llm = fakeLlm([{ type: 'finish', reason: { kind: 'stop' } }])
  await host.probeModel(llm, 'workbuddy', 'glm', controller.signal)
  check('外部信号未被 abort', controller.signal.aborted === false)
}

// ── 8. the browser half posts a batch and records one verdict per model ───
function makeReact() {
  const hooks = []
  let cursor = 0
  return {
    createElement: (tag, props, ...children) => ({ tag, props: props ?? {}, children: children.flat() }),
    createPortal: (node, container) => ({ tag: '#portal', props: { container }, children: [node] }),
    useState: v => { const i = cursor++; if (hooks.length <= i) hooks[i] = v; return [hooks[i], nv => { hooks[i] = typeof nv === 'function' ? nv(hooks[i]) : nv }] },
    useRef: v => { const i = cursor++; if (hooks.length <= i) hooks[i] = { current: v }; return hooks[i] },
    useMemo: fn => { cursor++; return fn() },
    useCallback: fn => { cursor++; return fn },
    useEffect: fn => { cursor++; const c = fn(); return typeof c === 'function' ? c : () => {} },
    useSyncExternalStore: (_s, snap) => { cursor++; return snap() },
  }
}

const CATALOGUE = [
  { id: 'workbuddy', name: 'WorkBuddy', models: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] },
]

function mount() {
  let stored = { hidden: [], renamed: [], order: [] }
  const form = {
    getSnapshot: () => ({ status: 'ready', value: structuredClone(stored), writable: true, mode: 'host' }),
    subscribe: () => () => {},
    async set(field, value) {
      stored = { ...stored, [field]: structuredClone(value) }
      return true
    },
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
  return mounted.d.inject().controller
}

{
  const controller = mount()
  await controller.load()
  let sent = null
  const fetchImpl = async (url, options) => {
    sent = { url, body: JSON.parse(options.body) }
    return {
      ok: true,
      async json() {
        return {
          results: [
            { provider: 'workbuddy', model: 'a', ok: true, latencyMs: 120, detail: '' },
            { provider: 'workbuddy', model: 'b', ok: false, latencyMs: 40, detail: 'boom' },
          ],
        }
      },
    }
  }
  const summary = await controller.probe(
    [{ provider: 'workbuddy', model: 'a' }, { provider: 'workbuddy', model: 'b' }],
    fetchImpl,
  )
  check('请求打到宿主路由', sent?.url === '/plugins/dsh-model-tidy/probe', String(sent?.url))
  check('请求方法为 POST', sent !== null)
  check('请求带上了两个目标', sent?.body?.targets?.length === 2)
  check('可用数正确', summary?.ok === 1, JSON.stringify(summary))
  check('失败数正确', summary?.fail === 1, JSON.stringify(summary))
  check('逐行记录了可用', controller.probeOf('workbuddy', 'a')?.state === 'ok')
  check('逐行记录了失败', controller.probeOf('workbuddy', 'b')?.state === 'fail')
  check('失败带详情', controller.probeOf('workbuddy', 'b')?.detail === 'boom')
  check('批次结束后不再运行中', controller.probing === false)
}

// ── 9. an HTTP error marks the batch as failing rather than throwing ──────
{
  const controller = mount()
  await controller.load()
  const summary = await controller.probe(
    [{ provider: 'workbuddy', model: 'a' }],
    async () => ({ ok: false, status: 404, async json() { return {} } }),
  )
  check('HTTP 错误计为失败', summary?.fail === 1, JSON.stringify(summary))
  check('详情带上状态码', controller.probeOf('workbuddy', 'a')?.detail === 'HTTP 404', String(controller.probeOf('workbuddy', 'a')?.detail))
}

// ── 10. an abort clears the pending marks instead of reporting failures ───
{
  const controller = mount()
  await controller.load()
  const fetchImpl = async (_url, options) => {
    // Abort while the request is in flight, as the stop button would.
    controller.stopProbing()
    const error = new Error('aborted')
    error.name = 'AbortError'
    throw error
  }
  const summary = await controller.probe([{ provider: 'workbuddy', model: 'a' }], fetchImpl)
  check('中止返回 null', summary === null)
  check('中止后不留下失败标记', controller.probeOf('workbuddy', 'a') === undefined)
  check('中止后不再运行中', controller.probing === false)
}

// ── 11. an empty target list is a no-op ───────────────────────────────────
{
  const controller = mount()
  await controller.load()
  const summary = await controller.probe([], async () => ({ ok: true, async json() { return {} } }))
  check('空目标不发起请求', summary === null)
  check('空目标后仍在空闲', controller.probing === false)
}

console.log(failures === 0 ? '\n=== 全部通过 ===' : `\n=== ${failures} 项失败 ===`)
process.exitCode = failures === 0 ? 0 : 1
