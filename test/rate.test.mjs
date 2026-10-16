/**
 * The vendor's billing suffix must survive a rename.
 *
 * Providers publish rates by appending them to `name` — `GLM-5.3 · x0.79` —
 * with a middle dot, because model names contain hyphens. `listModels` carries
 * no rate field, so that suffix is the only place the rate exists. A rename that
 * replaced `name` outright would silently drop it, which is the defect these
 * tests guard against.
 *
 * The host half is exercised directly (it is a plain ES module), and the split
 * rule is checked against the shapes real catalogues produce.
 */
import assert from 'node:assert'

const plugin = await import('../lib/index.js')

let failures = 0
const check = (label, ok, extra = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`)
  if (!ok) failures += 1
}

// ── 1. the split rule ───────────────────────────────────────────────────────
{
  const cases = [
    ['GLM-5.3 · x0.79', 'GLM-5.3', 'x0.79'],
    ['GLM-5.2 · x0.79 · 夜间折扣', 'GLM-5.2', 'x0.79 · 夜间折扣'],
    ['Deepseek-V4.1-Flash · x0.03', 'Deepseek-V4.1-Flash', 'x0.03'],
    ['Kimi-K3 · x1.62', 'Kimi-K3', 'x1.62'],
    // No suffix: a plain name, and a hyphenated one that must not be split.
    ['Auto', 'Auto', ''],
    ['GLM-5.3-Flash', 'GLM-5.3-Flash', ''],
    ['Deepseek-V4-Flash', 'Deepseek-V4-Flash', ''],
    // An empty name must not throw.
    ['', '', ''],
  ]
  for (const [input, bare, suffix] of cases) {
    const got = plugin.splitSuffix(input)
    check(`split ${JSON.stringify(input)}`, got.bare === bare && got.suffix === suffix, `bare=${JSON.stringify(got.bare)} suffix=${JSON.stringify(got.suffix)}`)
  }
}

// ── 2. renaming keeps the suffix ────────────────────────────────────────────
/** Mount the host half over a catalogue listing one provider's models. */
function mountHost(models, renamed) {
  class FakeLlm {
    async listModels(provider) {
      return models
        .filter(m => m.provider === provider)
        .map(m => ({ ...m }))
    }
  }
  const llm = new FakeLlm()
  const disposers = []
  plugin.apply(
    {
      llm,
      fiber: {},
      inject: () => {},
      effect: fn => {
        const d = fn()
        if (typeof d === 'function') disposers.push(d)
      },
    },
    {
      hidden: { get: () => [] },
      renamed: { get: () => renamed },
    },
  )
  return { llm, disposers }
}

{
  const { llm } = mountHost(
    [{ provider: 'workbuddy', id: 'glm', name: 'GLM-5.3 · x0.79' }],
    [{ provider: 'workbuddy', model: 'glm', alias: 'GLM 便宜', suffix: 'x0.79' }],
  )
  const rows = await llm.listModels('workbuddy')
  check('备注后仍显示倍率', rows[0]?.name === 'GLM 便宜 · x0.79', String(rows[0]?.name))
  check('路由 id 未改动', rows[0]?.id === 'glm')
}

{
  const { llm } = mountHost(
    [{ provider: 'workbuddy', id: 'glm', name: 'GLM-5.2 · x0.79 · 夜间折扣' }],
    [{ provider: 'workbuddy', model: 'glm', alias: 'GLM 便宜', suffix: 'x0.79 · 夜间折扣' }],
  )
  const rows = await llm.listModels('workbuddy')
  check(
    '多段后缀完整保留',
    rows[0]?.name === 'GLM 便宜 · x0.79 · 夜间折扣',
    String(rows[0]?.name),
  )
}

// ── 3. a model with no rate gets no stray separator ─────────────────────────
{
  const { llm } = mountHost(
    [{ provider: 'workbuddy', id: 'auto', name: 'Auto' }],
    [{ provider: 'workbuddy', model: 'auto', alias: '自动', suffix: '' }],
  )
  const rows = await llm.listModels('workbuddy')
  check('无后缀时不拼接分隔符', rows[0]?.name === '自动', String(rows[0]?.name))
}

// ── 4. an entry written before this field existed still keeps the rate ──────
// Older saves have no `suffix`, so the catalogue's own suffix is used instead:
// the upgrade must not drop the rate on models renamed under the old format.
{
  const { llm } = mountHost(
    [{ provider: 'workbuddy', id: 'glm', name: 'GLM-5.3 · x0.79' }],
    [{ provider: 'workbuddy', model: 'glm', alias: 'GLM 便宜' }],
  )
  const rows = await llm.listModels('workbuddy')
  check(
    '旧格式条目仍保留倍率',
    rows[0]?.name === 'GLM 便宜 · x0.79',
    String(rows[0]?.name),
  )
}

// ── 5. no rename means the catalogue name is untouched ─────────────────────
{
  const { llm } = mountHost(
    [{ provider: 'workbuddy', id: 'glm', name: 'GLM-5.3 · x0.79' }],
    [],
  )
  const rows = await llm.listModels('workbuddy')
  check('未改名的模型原样返回', rows[0]?.name === 'GLM-5.3 · x0.79', String(rows[0]?.name))
}

// ── 6. renaming must not mutate the adapter's own object ───────────────────
{
  const original = { provider: 'workbuddy', id: 'glm', name: 'GLM-5.3 · x0.79' }
  const { llm } = mountHost(
    [original],
    [{ provider: 'workbuddy', model: 'glm', alias: 'GLM 便宜', suffix: 'x0.79' }],
  )
  await llm.listModels('workbuddy')
  check('不写回适配器持有的对象', original.name === 'GLM-5.3 · x0.79', original.name)
}

// ── 7. hidden and renamed together ─────────────────────────────────────────
{
  class FakeLlm {
    async listModels() {
      return [
        { provider: 'workbuddy', id: 'glm', name: 'GLM-5.3 · x0.79' },
        { provider: 'workbuddy', id: 'auto', name: 'Auto' },
      ]
    }
  }
  const llm = new FakeLlm()
  plugin.apply(
    {
      llm,
      fiber: {},
      inject: () => {},
      effect: fn => {
        fn()
      },
    },
    {
      hidden: { get: () => [{ provider: 'workbuddy', model: 'auto', name: 'Auto' }] },
      renamed: { get: () => [{ provider: 'workbuddy', model: 'glm', alias: 'GLM 便宜', suffix: 'x0.79' }] },
    },
  )
  const rows = await llm.listModels('workbuddy')
  check('隐藏与改名同时生效', rows.length === 1 && rows[0].name === 'GLM 便宜 · x0.79', JSON.stringify(rows.map(r => r.name)))
}

// ── 8. malformed entries are skipped, not fatal ────────────────────────────
{
  const { llm } = mountHost(
    [{ provider: 'workbuddy', id: 'glm', name: 'GLM-5.3 · x0.79' }],
    [{ provider: 'workbuddy', model: 'glm', alias: '   ', suffix: 'x0.79' }, null, { provider: 'workbuddy' }],
  )
  const rows = await llm.listModels('workbuddy')
  check('空白别名不生效', rows[0]?.name === 'GLM-5.3 · x0.79', String(rows[0]?.name))
}

void assert

console.log(failures === 0 ? '\n=== 全部通过 ===' : `\n=== ${failures} 项失败 ===`)
process.exitCode = failures === 0 ? 0 : 1
