# 推广文案库（1.2.2 版）

> 发布动作：按约定由 star 本人执行（除本会话明确授权外，我不代发）。
> 本文件是可直接复制粘贴的成品文案，随版本更新。

## 发布前确认（当前状态）

| 项目 | 状态 |
|---|---|
| 市场收录 | ✅ PR #7702 合并；描述更新 PR #8410 / #8825 均已合并 |
| 市场简介关键词 | ✅ 含「模型整理」「模型列表整理」「Tidy the model list」 |
| npm | ✅ `latest = 1.2.2`（含 `dsh.compatibility.dsh`、`engines.node`） |
| GitHub 仓库描述 | ✅ 含「DSH 模型整理（模型列表整理）」 |
| GitHub topics | ✅ 含 `model-tidy`、`model-list-tidy`、`dsh-plugin` |
| README（四语） | ✅ 含渠道备注、返回顶部、联系章节 |
| 截图 | ✅ `main.png` + `main01.png`，`screenshots.json` 已声明 |
| DSH STORE | ⏳ Issue #1463 已提交复核请求，等待回复 |

---

## 一、Linux.do（首选，用户最集中）

**标题**

```
分享一个 DSH 插件：模型整理（隐藏用不到的模型 + 给模型和渠道改备注名）
```

**正文**

```
装了几个 provider 插件之后，模型菜单就变成一堵墙。

一条免费车道、一个工作台 App、两个自己配的网关，转眼三十来项——
大多数根本不会选，还有几个是同一模型走了不同渠道的近似重复项。

所以写了个插件把这件事收一收：dsh-model-tidy（模型整理）。

它做什么
- 逐模型开关：关掉即从选择器消失，打开即回来
- 模型备注名：给模型改个自己认得的名字，厂商的计费倍率后缀原样保留
  （GLM-5.3 · x0.79 → GLM 便宜 · x0.79）
- 渠道备注名：给渠道本身起名，选择器的分组标题就换成它，id 以小字保留
- 排序：模型和渠道都能用上下箭头调，显式保存，重启仍生效
- 搜索：按模型名、渠道、备注名过滤
- 渠道批量：一键隐藏/显示某个渠道的全部模型
- 返回顶部：长列表右下角的圆形按钮，滚动即现、回顶即隐

它刻意不做的事
- 不重写你的渠道配置。隐藏列表、备注表、排序记录只存在插件自己的命名空间
- 正在使用某模型的会话不受影响：路由按模型 id 走，改的只是显示名
- 卸载后列表完全恢复原样
- 渠道新上架的模型默认可见——插件记录的是「要隐藏什么」，不是「要显示什么」
- 不做可用性检测：各渠道有自己的排查方式，一个列表工具不该花你的 token 代劳

覆盖范围
开关作用于所有模型来源。插件过滤的是 harness 自己的目录枚举
ctx.llm.listModels / ctx.llm.listProviders，也就是每个界面都会读的那一份列表。
其他插件通过 ctx.llm.registerAdapter 注册的模型、以及 llm-pi-ai 下声明的渠道，
都落在这一份列表里，因此都被覆盖。

安装
dsh plugin --profile <你的 profile> add dsh-model-tidy

或在 DSH 插件市场搜「模型整理」「模型列表整理」。

仓库：https://github.com/star-Cosmo/dsh-model-tidy
npm：https://www.npmjs.com/package/dsh-model-tidy

界面全部用 harness 自己的 --dsw-* 设计令牌绘制，浅色/深色自动跟随，
不联网、无遥测。有想改进的功能欢迎直接回帖，或发邮件到
chenbin2004sz@163.com。觉得有用的话，欢迎去仓库点个 Star。
```

---

## 二、V2EX（精简版）

**标题**

```
写了个 DSH 插件，把模型选择器里用不到的模型收起来
```

**正文**：用 Linux.do 正文，删掉「覆盖范围」一节，保留「它做什么 / 刻意不做 / 安装」。

---

## 三、Reddit r/DeepSeek（英文）

**Title**

```
I built a DSH plugin that keeps the model picker from turning into a wall
```

**Body**

```
Install two or three provider plugins and the model menu becomes unusable.
A free-tier lane, a workbench app, two hand-configured gateways — suddenly
thirty entries, most of which you will never pick.

So I wrote dsh-model-tidy.

What it does
- One switch per model: off means it disappears from the selector
- Model alias: give a model a name you recognise; the provider's billing
  suffix (GLM-5.3 · x0.79) survives the rename
- Channel alias: name the provider itself; the picker's group title follows,
  with the id kept beside it
- Arrows: reorder models and channels, saved explicitly, survives restarts
- Search across model, provider and alias
- Per-provider batch show/hide, plus back-to-top for long lists

What it deliberately does not do
- It never rewrites your provider configuration. Hidden list, aliases and
  ordering live in the plugin's own settings namespace
- A model hidden or renamed while a session uses it keeps serving that session
- Uninstalling restores the original list completely
- New models a provider starts advertising are visible by default
- No availability probing — each channel has its own way to diagnose a
  broken model, and a list tool should not spend your tokens doing it

Install
dsh plugin --profile <your-profile> add dsh-model-tidy

Or search "model list tidy" in the DSH plugin market.

Repo: https://github.com/star-Cosmo/dsh-model-tidy
npm: https://www.npmjs.com/package/dsh-model-tidy

Styled entirely with the harness's own --dsw-* design tokens, follows your
theme, no network access, no telemetry. Feedback welcome — or email
chenbin2004sz@163.com. Stars appreciated if you find it useful.
```

---

## 四、市场 Ideas 讨论（征集功能需求）

**标题**

```
讨论：模型可用性检测，大家需要吗？
```

**正文**

```
我是 dsh-model-tidy（模型整理插件）的作者。

1.1.0 里做过一个「模型可用性检测」：点一下，逐个给当前显示的模型发一次
极小的请求（maxTokens: 1），每行一个状态点标出可用 / 不可用 / 超时。

做它是因为装了七八个渠道后，经常想知道这些模型现在到底哪些还活着——
免费车道会失效、网关会过期、余额会跑光，而模型列表本身不会告诉你。

但 1.2.0 里移除了，原因：
- 各渠道其实都有自己的排查方式（渠道后台、余额页、状态页）
- 整理插件里发真实请求，有人觉得越界：列表工具不该花用户的 token
- 环境杂了以后，「检测通过」也不完全等于「能用」

最近有用户反馈希望它回来，所以想先听听意见，再决定要不要以
可选功能（默认关闭）的形式做回去。

如果有 30 秒，欢迎回答：
1. 你会遇到「列表里一堆模型，不知道哪个还能用」的问题吗？
2. 如果提供检测，你希望它：
   a. 默认开启，随手可查
   b. 默认关闭，设置里打开（不想要的人完全无感）
   c. 不需要，渠道自己能查
3. 能接受检测消耗的少量 token 吗？（每个模型一次单字回复）

选 b 的话我会做成：默认不可见、不注册任何路由，只在设置里手动开启后
才出现按钮。先收集意见，呼声够再动手，谢谢！
```

---

## 五、发布纪律

- **不重复发同一帖刷屏**（会被封）
- **不在别人插件的 issue 里推销**
- **不夸大功能**（社区会核对，损害信誉）
- 发帖后 24 小时内回评论
- 一个平台一次即可，隔几天再考虑第二个平台

## 六、可复用的证据链接

- 仓库：https://github.com/star-Cosmo/dsh-model-tidy
- npm：https://www.npmjs.com/package/dsh-model-tidy
- 市场页：https://awesome-dsh-plugin.com/p/star-Cosmo/dsh-model-tidy/
- CI：https://github.com/star-Cosmo/dsh-model-tidy/actions
- 联系邮箱：chenbin2004sz@163.com

---

## 七、目录收录渠道（2026-10-27 实测）

| 渠道 | 规模 | 收录方式 | 状态 |
|---|---|---|---|
| [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) | 2 万+ star | PR 加 data/plugins/<owner>__<repo>.yml | ✅ 已收录（PR #7702/#8410/#8825 均已合并） |
| [dsh-plugin.org](https://dsh-plugin.org/zh/plugins/star-cosmo/dsh-model-tidy) | 17,826 仓库，内置于 DSH 设置页 | 自动索引：公开仓库 + dsh-plugin topic + 描述/安装命令 | ✅ 已收录（无需提交，topic 即索引） |
| [dshmarket.com](https://dshmarket.com) | 镜像 awesome 目录 | 跟随上游 | ✅ 同步 |
| [kejixiaoliang/awesome-dsh-plugins](https://github.com/kejixiaoliang/awesome-dsh-plugins) | 353 插件 | PR 在 plugins/<分类>.md 加一行 | ⏳ PR [#165](https://github.com/kejixiaoliang/awesome-dsh-plugins/pull/165) |
| [beancookie/awesome-dsh-plugin](https://github.com/beancookie/awesome-dsh-plugin) | 504 插件 | PR 在 README 分类下加一行 | ⏳ PR [#249](https://github.com/beancookie/awesome-dsh-plugin/pull/249) |
| [0xsline/awesome-deepseek-harness](https://github.com/0xsline/awesome-deepseek-harness) | 1,260 star | PR 到 `Models & Inference` 分类（中英两个 README） | ⏳ PR [#756](https://github.com/0xsline/awesome-deepseek-harness/pull/756) |
| [bruc3van/awesome-dsh-plugin](https://github.com/bruc3van/awesome-dsh-plugin) | 471 star | PR 到 SHOWCASE.md，要求 Star > 10 | ❌ 当前 2 star，未达门槛 |
| [dsh.store](https://dsh.store)（DSH STORE） | 严格审核 | GitHub Issue 提交 + 固定 Commit 审核 | ⏳ Issue [#1463](https://github.com/AI-Scarlett/DSH-Store/issues/1463) 已请求复核 |
| [AdamPlatin123/dsh-plugin-radar](https://github.com/AdamPlatin123/dsh-plugin-radar) | 1.4k star，自动发现 | 自动爬 dsh-plugin topic | ✅ 预期自动覆盖 |

**结论**：dsh-plugin topic 是最关键的一把钥匙——dsh-plugin.org、radar、bruc3van 都靠它自动发现。仓库必须始终保留该 topic 与有效描述。

## 八、社区发帖进展

| 平台 | 状态 |
|---|---|
| Linux.do | ⏳ 待登录（CDP 窗口已就绪，登录后即可自动填表） |
| V2EX | ⏳ 待登录 |
| Reddit r/DeepSeek | ⏳ 待登录 |

登录后由 CDP 自动填标题/正文，人工点发布。