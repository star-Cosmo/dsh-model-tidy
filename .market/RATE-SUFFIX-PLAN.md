# 倍率后缀保留 — 实施记录

## 背景

厂商插件把计费倍率拼进模型的 `name`，作者反馈希望这个倍率能被保留。

## 查证结论（读厂商源码得到，非推测）

`dsh-workbuddy-connect/lib/index.js`：

```js
/**
 * The separator is a middle dot rather than a hyphen or colon: model names
 * already contain hyphens (`GLM-5.3-Flash`, `Deepseek-V4-Flash`), so a hyphen
 * separator would be ambiguous about where the name ends and the rate begins.
 */
const RATE_SEPARATOR = " · ";

function displaySuffix(info) {
  const parts = [normalizeCredits(info.billing?.credits), ...info.billing?.badges ?? []]
    .filter(part => part !== undefined && part !== "")
  return parts.length === 0 ? undefined : parts.join(" · ")
}

function withCatalogDisplay(name, info) {
  const suffix = displaySuffix(info)
  return suffix === undefined ? name : `${name}${RATE_SEPARATOR}${suffix}`
}
```

所以 `name` 的结构是：

```
<纯模型名> · <倍率> · <促销标签…>
例如  GLM-5.3 · x0.79 · 夜间折扣
```

**实证**：作者 profile 备份的 patch 里共 26 个带倍率的名称，格式全部为
`<模型名> · <倍率>`，**没有任何模型名自身含中点**。

## 要解决的问题

宿主的 `llm.listModels` 只返回 `provider / id / name / description /
inputModalities`，**倍率不是独立字段，它就是 `name` 的一部分**。

本插件的备注功能整体替换 `name`，因此：

```
原名  GLM-5.3 · x0.79
备注  GLM 便宜
现在  GLM 便宜              ← 倍率丢失
期望  GLM 便宜 · x0.79      ← 保留后缀
```

## 方案（作者已确认）

1. **倍率原样显示**：不拆分、不加彩色标签，`name` 里有什么就显示什么。
2. **备注保留后缀**：备注只改名字部分，厂商后缀原样跟在后面。
3. **后缀存进备注条目**：`renamed` 的每条增加 `suffix` 字段。

### 为什么把后缀存下来

不能每次从当前 `name` 实时提取后缀：

- 备注生效后再读目录，`name` 已是 `备注名 · x0.79`，再次提取会重复拼接；
- 备注名本身若含 ` · ` 会产生歧义。

存下来之后，显示名恒等于 `alias + " · " + suffix`，与目录是否重读无关。

### 数据结构

```js
renamed: [
  { provider, model, alias: 'GLM 便宜', suffix: 'x0.79' }
]
```

`suffix` 可选：没有倍率的模型（如 `Auto`、`Fast`）不写该字段。

## 改动点

| 文件 | 改动 |
|---|---|
| `lib/index.js` | `Config.renamed` 增加可选 `suffix`；应用备注时拼成 `alias + ' · ' + suffix` |
| `lib/client.js` | 备注弹窗保存时，从当前 `name` 截出后缀一并写入；行显示沿用 host 的结果 |
| `test/` | 新增后缀解析与往返测试 |

## 后缀的截取规则

```js
/** Split a catalogue name into its bare name and the vendor's suffix. */
function splitSuffix(name) {
  const at = name.indexOf(' · ')
  return at === -1
    ? { bare: name, suffix: '' }
    : { bare: name.slice(0, at), suffix: name.slice(at + 3) }
}
```

取**第一个** ` · `：厂商保证模型名不含该分隔符，而倍率与多个促销标签之间
也用同一分隔符连接，所以第一个之后的内容整体就是后缀。

## 边界

- 模型无倍率（`name` 不含 ` · `）：`suffix` 为空，不写入字段，行为与现在一致。
- 用户清空备注：条目整体移除，名称回到厂商给的完整 `name`。
- 倍率变化（厂商调价）：后缀存的是写入时的值，需用户重新保存备注才会更新。
  **这是已知取舍**，换来的是与目录重读解耦。
