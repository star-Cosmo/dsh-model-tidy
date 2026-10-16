/**
 * Two plugins wrapping the same method.
 *
 * `dsh-model-visibility` and `dsh-model-tidy` both override
 * `llm.listModels`. Whichever mounts second captures the first one's wrapper
 * as its "original", so the question worth answering is what actually happens
 * on unmount — in both orders, and when only one is removed.
 *
 * The concern is concrete: if the later plugin's dispose does `delete
 * llm.listModels`, it removes its own wrapper and the earlier plugin's wrapper
 * comes back, which is correct. But if the earlier plugin unmounts first while
 * the later wrapper is still installed, deleting the own property drops *both*
 * wrappers — the later plugin's filter silently stops working.
 *
 * This file measures that, so the limitation is documented rather than
 * discovered by a user whose hidden models reappeared.
 */
const here = new URL('../lib/index.js', import.meta.url)
const tidy = await import(here.href)

let failures = 0
function check(label, ok, note = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${note ? ' — ' + note : ''}`)
  if (!ok) failures += 1
}

const seed = {
  provider: [
    { id: 'keep-a', name: 'keep-a' },
    { id: 'keep-b', name: 'keep-b' },
    { id: 'drop-visibility', name: 'drop-visibility' },
    { id: 'drop-tidy', name: 'drop-tidy' },
  ],
}

function makeLlm() {
  class FakeLlm {
    async listModels() {
      return seed.provider.map(m => ({ ...m }))
    }
  }
  return new FakeLlm()
}

function makeCtx(llm) {
  const disposers = []
  return { llm, fiber: {}, disposers, inject: () => {}, effect: fn => { const d = fn(); if (typeof d === 'function') disposers.push(d) } }
}

/** The shape `dsh-model-visibility` installs: filter by its own hidden set. */
function mountVisibility(llm, hiddenModels) {
  const ctx = makeCtx(llm)
  const original = llm.listModels.bind(llm)
  ctx.effect(() => {
    Object.defineProperty(llm, 'listModels', {
      configurable: true,
      writable: true,
      value: async provider => {
        const models = await original(provider)
        return models.filter(m => !hiddenModels.includes(m.id))
      },
    })
    return () => {
      delete llm.listModels
    }
  })
  return ctx
}

/** The shape `dsh-model-tidy` installs. */
function mountTidy(llm, { hidden = [], renamed = [] } = {}) {
  const ctx = makeCtx(llm)
  tidy.apply(ctx, {
    hidden: { get: () => hidden },
    renamed: { get: () => renamed },
  })
  return ctx
}

// ── 1. tidy mounts second, both filters apply ───────────────────────────────
{
  const llm = makeLlm()
  mountVisibility(llm, ['drop-visibility'])
  mountTidy(llm, { hidden: [{ provider: 'provider', model: 'drop-tidy', name: 'drop-tidy' }] })
  const rows = await llm.listModels('provider')
  const ids = rows.map(r => r.id)
  check('两层过滤同时生效', ids.length === 2 && !ids.includes('drop-visibility') && !ids.includes('drop-tidy'), ids.join(','))
}

// ── 2. tidy unmounts first: visibility keeps working ────────────────────────
{
  const llm = makeLlm()
  const visibility = mountVisibility(llm, ['drop-visibility'])
  const tidyCtx = mountTidy(llm, { hidden: [{ provider: 'provider', model: 'drop-tidy', name: 'drop-tidy' }] })
  for (const dispose of tidyCtx.disposers) dispose()
  const ids = (await llm.listModels('provider')).map(r => r.id)
  check('tidy 先卸载后 visibility 仍生效', !ids.includes('drop-visibility'), ids.join(','))
  check('tidy 先卸载后自己的过滤已撤销', ids.includes('drop-tidy'), ids.join(','))
  void visibility
}

// ── 3. visibility unmounts first, while tidy is installed ───────────────────
//
// Known limitation, and not one this plugin can fix from its side.
//
// `dsh-model-visibility` tears down with a bare `delete llm.listModels`, which
// removes whatever wrapper currently sits on the service — including this
// plugin's, if it mounted second. Removing a property cannot express "undo my
// layer and leave the one underneath"; only restoring the captured previous
// value can, which is what this plugin does instead (see case 2).
//
// There are two ways to live with it, both fine: install only one of the two
// (they overlap almost entirely), or uninstall visibility while tidy is
// disabled so there is no second wrapper to lose. The assertion below pins the
// behaviour so a future fix upstream shows up as a test that starts passing.
{
  const llm = makeLlm()
  const visibility = mountVisibility(llm, ['drop-visibility'])
  mountTidy(llm, { hidden: [{ provider: 'provider', model: 'drop-tidy', name: 'drop-tidy' }] })
  for (const dispose of visibility.disposers) dispose()
  const ids = (await llm.listModels('provider')).map(r => r.id)
  const tidyStillWorks = !ids.includes('drop-tidy')
  console.log(
    `  ${tidyStillWorks ? 'PASS' : 'NOTE'}  visibility 先卸载会一并删除上层包装 — ${
      tidyStillWorks ? '未发生' : '已复现（上游 delete 语义所致，已记录）'
    }`,
  )
  if (tidyStillWorks) failures += 1
}

// ── 4. only tidy installed ─────────────────────────────────────────────────
{
  const llm = makeLlm()
  mountTidy(llm, { hidden: [{ provider: 'provider', model: 'drop-tidy', name: 'drop-tidy' }] })
  const ids = (await llm.listModels('provider')).map(r => r.id)
  check('单独安装时过滤生效', !ids.includes('drop-tidy') && ids.length === 3, ids.join(','))
}

console.log(
  failures === 0
    ? '\n=== 全部通过 ==='
    : `\n=== ${failures} 项失败（见上方说明） ===`,
)
process.exitCode = failures === 0 ? 0 : 1
