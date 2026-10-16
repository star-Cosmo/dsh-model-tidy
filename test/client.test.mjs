/**
 * Checks the browser half's contract with the harness.
 *
 * Every assertion corresponds to something the harness relies on: the loader
 * descriptor's shape, the `apply`/`inject`/`name` exports, the settings-section
 * registration, and the fact that driving the controller produces exactly the
 * `{hidden, renamed}` document the host half reads back.
 */
import { loadClient, makeCtx, check, report } from './harness.mjs'

const groups = [
  {
    id: 'workbuddy',
    name: 'WorkBuddy',
    models: [
      { id: 'gemini-3.8-flash', name: 'gemini-3.8-flash' },
      { id: 'deepseek-v4.1-flash', name: 'deepseek-v4.1-flash' },
      { id: 'grok-4.7', name: 'grok-4.7' },
    ],
  },
  { id: 'gemini', name: 'Gemini', models: [{ id: 'gemini-3.8-flash', name: 'gemini-3.8-flash' }] },
]

const { exports, window } = loadClient()

/** Mount the plugin on a fresh fake context and return its live pieces. */
function mount({ groups: g = groups, formValue } = {}) {
  const env = makeCtx({ groups: g, formValue })
  exports.apply(env.ctx)
  const slot = env.registered.slots[0]
  const controller = slot.descriptor.inject().controller
  return { env, slot, controller, writes: env.writes }
}

// ── 1. the loader descriptor ────────────────────────────────────────────────
const descriptor = window.__ModuleLoader__.__loaded
check('通过 __ModuleLoader__.load 注册', Boolean(descriptor))
check('descriptor.id 等于插件名', descriptor?.id === 'dsh-model-tidy')
check('factory 是函数', typeof descriptor?.factory === 'function')
check('导出 name', exports.name === 'dsh-model-tidy')
check('导出 apply', typeof exports.apply === 'function')
check('inject 含 slots', exports.inject.includes('slots'))
check('inject 含 configForms', exports.inject.includes('configForms'))
check('inject 含 remote.session', exports.inject.includes('remote.session'))

// ── 2. registration ─────────────────────────────────────────────────────────
const first = mount()
check('注册了语言词典', first.env.registered.locale.length === 1)
check('词典含中英两套', Boolean(first.env.registered.locale[0]?.dict?.zh && first.env.registered.locale[0]?.dict?.en))
check('注册了设置分区', first.env.registered.slots.length === 1)
check('分区名是 settings.section', first.slot.descriptor.name === 'settings.section')
check('分区 id 等于命名空间', first.slot.descriptor.id === 'model-tidy')
check('分区 label 是函数', typeof first.slot.descriptor.label === 'function')
check('组件是函数', typeof first.slot.component === 'function')
check('inject 提供 controller', Boolean(first.slot.descriptor.inject().controller))
check('inject 提供 t', typeof first.slot.descriptor.inject().t === 'function')

// ── 3. catalogue load and merge ─────────────────────────────────────────────
await first.controller.load()
const store = first.controller.store
check('目录读取成功', store?.status === 'ready')
check('行数 = 4（workbuddy 3 + gemini 1）', store?.rows?.length === 4)
check('渠道列表去重排序', JSON.stringify(store?.providers) === JSON.stringify(['gemini', 'workbuddy']))
check('默认无隐藏', store?.hiddenCount === 0)
check('默认无备注', store?.aliasCount === 0)
check(
  '未改动时保持原名',
  store.rows.find(r => r.key === 'workbuddy\u0000gemini-3.8-flash')?.name === 'gemini-3.8-flash',
)

// ── 4. hiding writes the host's document ────────────────────────────────────
const t2 = mount()
await t2.controller.load()
t2.controller.toggle('workbuddy\u0000grok-4.7', true)
check('切换后本地状态立即更新', t2.controller.store.rows.find(r => r.model === 'grok-4.7')?.hidden === true)
await t2.controller.flush()
check('产生一次写入', t2.writes.length === 1)
check('写入含 hidden 数组', Array.isArray(t2.writes[0]?.hidden))
check('写入含 renamed 数组', Array.isArray(t2.writes[0]?.renamed))
check(
  '隐藏项带 provider/model/name',
  t2.writes[0].hidden[0]?.provider === 'workbuddy' &&
    t2.writes[0].hidden[0]?.model === 'grok-4.7' &&
    t2.writes[0].hidden[0]?.name === 'grok-4.7',
)

// ── 5. an alias rides the same document ─────────────────────────────────────
const t3 = mount()
await t3.controller.load()
t3.controller.setAlias('workbuddy\u0000gemini-3.8-flash', 'DS 快')
await t3.controller.flush()
check('备注写入 renamed', t3.writes[0]?.renamed?.[0]?.alias === 'DS 快')
check(
  '备注项带 provider/model',
  t3.writes[0].renamed[0].provider === 'workbuddy' && t3.writes[0].renamed[0].model === 'gemini-3.8-flash',
)
check('只有一条 renamed', t3.writes[0].renamed.length === 1)

// ── 6. saved state is read back ─────────────────────────────────────────────
const t4 = mount({ formValue: { hidden: [{ provider: 'workbuddy', model: 'grok-4.7', name: 'grok-4.7' }] } })
await t4.controller.load()
check('已保存的隐藏状态被读回', t4.controller.store.rows.find(r => r.model === 'grok-4.7')?.hidden === true)
check('隐藏计数正确', t4.controller.store.hiddenCount === 1)

const t5 = mount({
  formValue: { renamed: [{ provider: 'gemini', model: 'gemini-3.8-flash', alias: '谷歌版' }] },
})
await t5.controller.load()
check(
  '已保存的备注被读回',
  t5.controller.store.rows.find(r => r.key === 'gemini\u0000gemini-3.8-flash')?.alias === '谷歌版',
)
check('备注计数正确', t5.controller.store.aliasCount === 1)

// ── 7. a withdrawn model keeps its row ──────────────────────────────────────
const t6 = mount({ formValue: { hidden: [{ provider: 'workbuddy', model: 'ghost-model', name: 'Ghost' }] } })
await t6.controller.load()
const ghost = t6.controller.store.rows.find(r => r.model === 'ghost-model')
check('已下架模型仍保留一行', Boolean(ghost))
check('该行标记为 stale', ghost?.stale === true)
check('该行沿用快照名', ghost?.name === 'Ghost')
check('是隐藏状态', ghost?.hidden === true)

// ── 8. the same model on two routes stays two rows ──────────────────────────
const t7 = mount()
await t7.controller.load()
t7.controller.setAlias('gemini\u0000gemini-3.8-flash', '谷歌版')
await t7.controller.flush()
check('同名模型按渠道分开备注', t7.writes[0].renamed.length === 1 && t7.writes[0].renamed[0].provider === 'gemini')

// ── 9. batch toggle per provider ────────────────────────────────────────────
const t8 = mount()
await t8.controller.load()
t8.controller.toggleProvider('workbuddy', true)
await t8.controller.flush()
check('渠道批量隐藏写入 3 条', t8.writes[0].hidden.length === 3)
check('另一渠道不受影响', t8.controller.store.rows.filter(r => r.provider === 'gemini' && r.hidden).length === 0)

// ── 10. reset clears both ───────────────────────────────────────────────────
const t9 = mount({ formValue: { hidden: [{ provider: 'workbuddy', model: 'grok-4.7', name: 'grok-4.7' }] } })
await t9.controller.load()
t9.controller.resetAll()
await t9.controller.flush()
check('全部恢复清空 hidden', t9.writes[0].hidden.length === 0)
check('全部恢复清空 renamed', t9.writes[0].renamed.length === 0)

// ── 11. dispose flushes rather than drops ───────────────────────────────────
const t10 = mount()
await t10.controller.load()
t10.controller.setAlias('gemini\u0000gemini-3.8-flash', '未提交')
t10.controller.dispose()
await new Promise(resolve => setTimeout(resolve, 30))
check('卸载前会提交未保存的编辑', t10.writes.length === 1)

report()
