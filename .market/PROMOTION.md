# 推广文案

供市场收录通过后使用。**发布动作需要你本人完成**（我不代发帖）。

发布前请先确认：
- 市场 PR 已合并，插件能在 [awesome-dsh-plugin.com](https://awesome-dsh-plugin.com) 搜到
- npm 包已是最新版（当前线上是 `0.0.1`，不含全局开关 / 备注弹窗 / Star 按钮）
- 仓库 README 已是最新

---

## 一、Linux.do（中文社区，重点）

多个同类插件的 README 都在提这个社区，是目前 DSH 插件最集中的地方。

**标题**：分享一个 DSH 插件：模型列表整理（隐藏不用的模型 + 给模型改备注名）

**正文**：

```
装了几个 provider 插件之后，模型菜单就变成一堵墙。

一条免费车道、一个工作台 App、两个自己配的网关，转眼三十来项——
大多数根本不会选，还有几个是同一模型走了不同渠道的近似重复项。

所以写了个插件把这件事收一收：**dsh-model-tidy**。

它解决的问题
- 模型选择器是做决定的地方，不是仓库。它应该只摆你真正在用的那几个，
  用你认得的名字。

它做什么
- 逐模型开关：关掉即从选择器消失，打开即回来
- 备注名：给模型改个自己认得的名字，选择器就按这个显示（留空即原名）
- 搜索：按模型名、渠道或备注名过滤
- 渠道卡片：每个来源一张卡，卡头带「显示该渠道全部 / 隐藏该渠道全部」
- 全局按钮：全部显示 / 全部隐藏 / 清空全部备注 / 全部恢复
- 备注改成按钮 + 弹窗，不再让每行被输入框撑开

它刻意不做的事
- 不重写你的渠道配置。隐藏列表与备注表只存在插件自己的设置命名空间里
- 正在使用某模型的会话不受影响：路由按模型 id 走，改的只是显示名
- 卸载后列表完全恢复原样
- 渠道新上架的模型默认可见——插件记录的是「要隐藏什么」，不是「要显示什么」

覆盖范围
- 开关作用于所有模型来源。插件过滤的是 harness 自己的目录枚举
  `ctx.llm.listModels`，也就是每个界面都会读的那一份列表
- 其他插件通过 `ctx.llm.registerAdapter` 注册的模型、以及 `llm-pi-ai` 下
  声明的渠道，都落在这一份列表里，因此都被覆盖
- 行按 渠道 + 模型 作键，同名模型经两条路由进来是两行独立控制

安装
dsh plugin --profile <你的 profile> add dsh-model-tidy

或者从 GitHub：github:star-Cosmo/dsh-model-tidy

仓库：https://github.com/star-Cosmo/dsh-model-tidy

界面全部用 harness 自己的 --dsw-* 设计令牌绘制，浅色/深色主题自动跟随，
不联网、无遥测。如果觉得有用，欢迎点个 Star。
```

---

## 二、V2EX / 其他中文社区

**标题**：写了个 DSH 插件，把模型选择器里用不到的模型收起来

**正文**：用上面 Linux.do 的正文，酌情精简「覆盖范围」一节。

---

## 三、Reddit r/DeepSeek（英文）

**Title**: I built a DSH plugin that keeps the model picker from turning into a wall

**Body**:

```
Install two or three provider plugins and the model menu becomes unusable.
A free-tier lane, a workbench app, two hand-configured gateways — suddenly
thirty entries, most of which you will never pick.

So I wrote **dsh-model-tidy**.

What it does
- One switch per model: off means it disappears from the selector
- Alias: give a model a name you recognise, and that is what the selector shows
- Search across model, provider and alias
- Provider cards with per-provider batch show/hide
- Global show all / hide all / clear aliases / restore everything

What it deliberately does not do
- It never rewrites your provider configuration. The hidden list and alias
  table live in the plugin's own settings namespace
- A model hidden or renamed while a session is using it keeps serving that
  session — routing keys off the model id, only the label changes
- Uninstalling restores the original list completely
- New models a provider starts advertising are visible by default

Coverage
It filters the harness's own catalogue enumeration (`ctx.llm.listModels`),
which is the single list every surface reads. Models that other plugins
register through `ctx.llm.registerAdapter` are covered too, because they end
up in that same list.

Install
dsh plugin --profile <your-profile> add dsh-model-tidy

Repo: https://github.com/star-Cosmo/dsh-model-tidy

Built against DSH 0.2.0-rc.2, styled entirely with the harness's own --dsw-*
design tokens so it follows your theme. No network access, no telemetry.
Stars appreciated if you find it useful.
```

---

## 四、发布前的检查清单

- [ ] 市场 PR 已合并，插件在市场可搜到
- [ ] npm 已更新到含新功能的版本（或 README 说明从 GitHub 安装）
- [ ] README 的英文/中文两版都是最新的
- [ ] 仓库主页截图（可选，但显著提升点击率）
- [ ] 发帖后 24 小时内回复评论

## 五、不要做的事

- 不要重复发同一个帖子刷屏（会被封）
- 不要在其他插件的 issue 里推销自己的插件
- 不要夸大功能（社区会核对，且损害信誉）
