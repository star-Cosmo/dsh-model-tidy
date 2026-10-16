# 宿主链路验证记录

记录对 dsh `0.2.0-rc.2` 的几处关键读取，用于确认本插件的实现假设成立。
这些结论来自直接阅读 `app.asar` 内的宿主源码，不是推测。

## 一、目录过滤与改名的生效链路

设置页读模型列表走的是 RPC，不是直接调用：

```
设置页组件
  → ctx.remote.session.modelCatalog()
  → SessionController.modelCatalog()
  → buildModelCatalog(ctx)
  → ctx.llm.listProviders()            ← 逐渠道
  → ctx.llm.listModels(provider.id)    ← ★ 本插件包装的方法
```

源码位置：`/dsh/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js`

```js
async function buildModelCatalog(ctx, defaultSelection = ...) {
  const providers = ctx.llm.listProviders()
  const catalog = await Promise.all(providers.map(async provider => {
    try {
      const models = await ctx.llm.listModels(provider.id)
      const entries = await Promise.all(models.map(async model => {
        const resolved = await ctx.llm.resolveModelInfo(provider.id, model.id)
        ...
```

**结论**：插件对 `ctx.llm.listModels` 的包装同时覆盖设置页与模型选择器。
`resolveModelInfo` 仍按原 `model.id` 调用，因此改名不影响元数据解析。

## 二、宿主是否会在插件之后重建对象

`LlmRuntime.listModels` 会把适配器返回的模型重新组装成新对象：

源码位置：`/dsh/node_modules/@deepseek-ai/dsh-llm/lib/index.js`

```js
async listModels(provider) {
  const models = await this.registration(provider).adapter.listModels(provider)
  const seen = new Set()
  return models.map(model => {
    if (typeof model.name !== 'string' || model.name.length === 0 || ...)
      throw new LlmError('adapter returned invalid or duplicate model metadata ...')
    seen.add(model.id)
    const inputModalities = this.detachedModalities(model.inputModalities)
    return { provider, id, name, ...description, ...inputModalities }
  })
}
```

**结论**：
1. 组装发生在**插件包装之内层**，插件的过滤与改名在其之后执行，不会被覆盖。
2. 宿主**保留 `name` 字段**，改名有效。
3. 宿主校验 `name` 必须为非空字符串 —— 插件侧已保证空白别名不写入（`alias.trim() !== ''`），
   因此不会把非法值送到宿主。
4. 宿主返回**全新对象**，这印证了插件「复制而非原地修改」的做法是必要且正确的。

## 三、设置分区如何出现在导航里

`dsh-client-ui-settings-general` 直接遍历槽位条目生成导航行：

```js
rows = ctx.slots.entries('settings.section').map(e => ({ ... }))
```

源码位置：`/dsh/node_modules/@deepseek-ai/dsh-client-ui-settings-general/lib/client.js`

**结论**：插件注册到 `settings.section` 即会出现在设置左侧导航，
无需额外声明图标或注册权限。

## 四、客户端模块格式与 require 解析

`dsh-client-ui-settings` 与官方各设置页的客户端半都是同一格式：

```js
window.__ModuleLoader__.load({ id, factory: (require) => { ...; return module.exports } })
```

`factory` 收到同步的 CommonJS `require`，`react` 由此取得，无需打包。
本插件的客户端半与之一致。

`require` 的解析顺序写在 `@deepseek-ai/dsh-client-modules` 的说明里：

```
Resolution branch order (import): seed word → shell instance;
  memoized record → exports; graph row → register its dependency factories
  and own factory; registered factory → materialize;
  anything else → throw (loud)
```

**结论**：
1. `require('react')` 走 **"shell instance"** 分支 —— 由页面外壳预置的实例解析，
   不在 asar 的 node_modules 里（asar 全文无 react 包）。这与官方插件用法一致。
2. 未登记的模块名会**明确抛错**（"throw (loud)"），不会静默降级。因此写错
   模块名会立刻暴露，不存在"看着装上了其实没生效"的中间态。

源码位置：`/dsh/node_modules/@deepseek-ai/dsh-client-modules/lib/client.js`

## 五、弹窗不可复用宿主组件

官方设置页使用**构建期生成的 CSS 模块类名**（如 `Yf9_hG_dialog`），
组件本身未对外导出。第三方分区拿不到这些组件，因此本插件的备注弹窗
是自有 DOM，仅复用宿主的 `--dsw-*` 设计令牌与层级色。

`createPortal` 是否可用取决于外壳提供的 React 实例，无法从 asar 静态确认 ——
所以插件**不假设它存在**：存在则用 portal 挂到 body（脱离设置页的滚动容器），
否则回退为内联渲染，两条路径都渲染同一棵遮罩 + 对话框结构。

## 复现方式

本文结论可用 `.market/` 下的临时脚本复核（脚本读取 asar，不修改任何文件）：

```
node .market/find-catalog.mjs      # 列出含 modelCatalog 的文件
node .market/trace-catalog.mjs     # 打印 modelCatalog 的定义与装饰器
node .market/trace-catalog2.mjs    # 打印 buildModelCatalog 的数据来源
```

`trace-catalog2.mjs` 输出中的 `ctx.llm.listModels(provider.id)` 即第一节的结论来源。
