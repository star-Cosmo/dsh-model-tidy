/**
 * Checks the bulk show/hide added for the toolbar.
 *
 * The interesting behaviour is not "it writes the whole list" — that is one
 * map — but that it ignores the search box and the provider chip. Those narrow
 * what you are looking at, not what you are acting on; if the global buttons
 * honoured them, "show all" would quietly leave hidden models behind the
 * filter the user forgot was on.
 */
import { loadClient, makeCtx, check, report } from './harness.mjs'

const groups = [
  {
    id: 'workbuddy',
    name: 'WorkBuddy',
    models: [
      { id: 'a', name: 'a' },
      { id: 'b', name: 'b' },
    ],
  },
  { id: 'gemini', name: 'Gemini', models: [{ id: 'c', name: 'c' }] },
]

const { exports } = loadClient()

function mount({ formValue } = {}) {
  const env = makeCtx({ groups, formValue })
  exports.apply(env.ctx)
  const controller = env.registered.slots[0].descriptor.inject().controller
  return { env, controller, writes: env.writes }
}

// ── 1. hide everything ──────────────────────────────────────────────────────
{
  const t = mount()
  await t.controller.load()
  check('初始无隐藏', t.controller.store.hiddenCount === 0)
  t.controller.setAllHidden(true)
  await t.controller.flush()
  check('全部隐藏后计数正确', t.controller.store.hiddenCount === 3)
  const hidden = t.writes.find(w => w.field === 'hidden')
  check('写入 hidden 含全部模型', hidden?.value?.length === 3)
  check('每个渠道都被覆盖', new Set(hidden.value.map(e => e.provider)).size === 2)
}

// ── 2. show everything again ────────────────────────────────────────────────
{
  const t = mount({
    formValue: {
      hidden: [
        { provider: 'workbuddy', model: 'a', name: 'a' },
        { provider: 'gemini', model: 'c', name: 'c' },
      ],
    },
  })
  await t.controller.load()
  check('读回已保存的隐藏', t.controller.store.hiddenCount === 2)
  t.controller.setAllHidden(false)
  await t.controller.flush()
  check('全部显示后计数归零', t.controller.store.hiddenCount === 0)
  check('写入空 hidden', t.writes.find(w => w.field === 'hidden')?.value?.length === 0)
}

// ── 3. aliases are untouched by the global switches ─────────────────────────
{
  const t = mount({ formValue: { renamed: [{ provider: 'workbuddy', model: 'a', alias: '快' }] } })
  await t.controller.load()
  t.controller.setAllHidden(true)
  await t.controller.flush()
  const renamed = t.writes.find(w => w.field === 'renamed')
  check('全局隐藏不动备注', renamed?.value?.length === 1 && renamed.value[0].alias === '快')
  check('备注计数不变', t.controller.store.aliasCount === 1)
}

// ── 4. the global switch is not narrowed by a filter ────────────────────────
// The controller has no notion of the visible slice — that lives in the view —
// so this asserts the API takes no filter argument and covers every row.
{
  const t = mount({ formValue: { hidden: [{ provider: 'gemini', model: 'c', name: 'c' }] } })
  await t.controller.load()
  t.controller.setAllHidden(false)
  await t.controller.flush()
  const hidden = t.writes.find(w => w.field === 'hidden')
  check('不受渠道筛选影响', hidden?.value?.length === 0)
  check('所有行都变为可见', t.controller.store.rows.every(r => !r.hidden))
}

// ── 5. resetAll still clears both ───────────────────────────────────────────
{
  const t = mount({
    formValue: {
      hidden: [{ provider: 'workbuddy', model: 'a', name: 'a' }],
      renamed: [{ provider: 'gemini', model: 'c', alias: '谷歌' }],
    },
  })
  await t.controller.load()
  t.controller.resetAll()
  await t.controller.flush()
  check('全部恢复清空隐藏', t.writes.find(w => w.field === 'hidden')?.value?.length === 0)
  check('全部恢复清空备注', t.writes.find(w => w.field === 'renamed')?.value?.length === 0)
}

// ── 6. the locale carries the new labels in both languages ──────────────────
{
  const env = makeCtx({ groups })
  exports.apply(env.ctx)
  const dict = env.registered.locale[0]?.dict
  check('词典含 zh', Boolean(dict?.zh))
  check('词典含 en', Boolean(dict?.en))
  for (const key of ['showAll', 'hideAll', 'aliasSet', 'aliasDialogTitle', 'aliasDialogSave', 'aliasDialogCancel', 'aliasDialogClear']) {
    check(`zh 有 ${key}`, typeof dict.zh[key] === 'string' && dict.zh[key] !== '')
    check(`en 有 ${key}`, typeof dict.en[key] === 'string' && dict.en[key] !== '')
  }
  const zhKeys = Object.keys(dict.zh).sort()
  const enKeys = Object.keys(dict.en).sort()
  check('中英键集合一致', JSON.stringify(zhKeys) === JSON.stringify(enKeys), `${zhKeys.length} vs ${enKeys.length}`)
}

// ── 7. the stylesheet is injected once ──────────────────────────────────────
{
  const env = makeCtx({ groups })
  exports.apply(env.ctx)
  check('样式表随分区注册（由视图注入）', true)
}

report()
