# dsh-model-tidy — 发布与收录手册

> 本文件是操作备忘。发布 npm 与提市场 PR 都需要**人工确认**，不放进 npm 包（`files` 未包含它）。

## 当前状态

| 项目 | 状态 |
|---|---|
| GitHub 仓库 | https://github.com/star-Cosmo/dsh-model-tidy（公开，已加 `dsh-plugin` topic） |
| 本地工作区 | `E:\Workstation\Github-starCosmo\dsh-model-tidy` |
| 已提交 | 3 次提交，全中文信息 |
| 测试 | `npm test` 三套全过（host / client / coexistence） |
| 真机安装 | 已装进 `desktop` profile 并验证加载通过 |
| npm | **未发布**（需先登录） |

## 一、发布 npm（占名）

npm 当前 registry 是淘宝镜像 `registry.npmmirror.com`，**发布必须显式指向官方源**，不要改全局配置。

### 1. 登录

```powershell
npm login --registry=https://registry.npmjs.org/
```

交互项：Username / Password / Email / 邮箱收到的一次性验证码。
若账号开了 2FA，后续每次发布都要再输一次 OTP。

### 2. 确认身份与包名

```powershell
npm whoami --registry=https://registry.npmjs.org/
npm view dsh-model-tidy --registry=https://registry.npmjs.org/   # 期望 404
```

### 3. 发布

首发建议用 `0.0.1` 占位（语义化版本里 `0.0.x` 就是纯占位），功能定型后再发 `0.1.0`。

在仓库根目录：

```powershell
cd E:\Workstation\Github-starCosmo\dsh-model-tidy
npm version 0.0.1 --no-git-tag-version
npm publish --registry=https://registry.npmjs.org/ --access public
```

### 4. 验证

```powershell
npm view dsh-model-tidy version --registry=https://registry.npmjs.org/
```

### 注意

- 一旦发布，**同名包永久归你**；但如果后续发现 `repository` 字段写错，npm 允许 `npm unpublish`（72 小时内）或发新版本修正。
- `repository` 字段必须指向被收录的那个仓库，否则市场无法把包和仓库关联（官方会拒绝手写 `npm:` 字段，映射是自动采集的）。
- 包名带 scope（如 `@star-cosmo/dsh-model-tidy`）永远不会被抢注，但裸名 `dsh-model-tidy` 更短、更易被搜到。

## 二、提交市场收录 PR

目标仓库：https://github.com/awesome-dsh-plugin/awesome-dsh-plugin

### 硬性门槛（CI 自动检查）

1. **仓库满 1 天** — 建于 2026-10-16 06:45 UTC，因此**北京时间 2026-10-17 14:45 之后**才能通过。
2. **`package.json` 声明 `dsh.bundle`** — 已满足。
3. **根目录存在 `cordis.patch.yml`** — 已满足。
4. **有真实可用代码** — 已满足。
5. **仓库带 `dsh-plugin` topic** — 已满足。

### PR 内容：只加一个文件

路径：`data/plugins/star-Cosmo__dsh-model-tidy.yml`

```yaml
url: https://github.com/star-Cosmo/dsh-model-tidy
name: star-Cosmo/dsh-model-tidy
category: model
description:
  en: 'Model list control for DeepSeek Harness: hide any model from the selector or give it your own display name, with search, per-provider batch toggles and one-click restore. Never rewrites provider configuration.'
  zh: 'DSH 模型列表整理：把任意模型从选择器隐藏，或给它改一个自己的显示名，支持搜索、渠道级批量开关与一键恢复；不重写任何渠道配置。'
```

**关键**：`description` 含冒号时**必须加引号**，否则 YAML 解析失败。

### 提交流程

```powershell
gh repo fork awesome-dsh-plugin/awesome-dsh-plugin --clone=false
# 在 fork 中新建分支并加入上面那个 yaml 文件，然后：
gh pr create --repo awesome-dsh-plugin/awesome-dsh-plugin --title "Add star-Cosmo/dsh-model-tidy" --body "..."
```

### 评审关注点（官方 contributing.md 明示）

- 描述必须**与代码相符**——会逐条核对。不要写没有的能力。
- 一个 PR 最多 3 条，我们只提 1 条。
- 分类选最贴合的，`model`（Models & Providers）是本插件的归属。分类不贴合不会被打回，维护者会直接改。
- PR 只能动自己那一条，不要改别人的条目或手工编辑生成的 README。

## 三、截图（可选，但市场详情页会展示）

在仓库根放 `screenshots.json`：

```json
["docs/screenshots/main.png"]
```

- 1–8 张，路径相对该文件，不能以 `/` 开头或含 `..`。
- 也可用绝对 URL，但必须是 GitHub 托管的 https 链接。
- 不声明也行：市场会从 README 里自动抽取图片。

## 四、关于 star

star 是结果，不是动作。能做的准备：

- README 已经写清楚「解决什么问题 / 做了什么 / 刻意不做什么 / 覆盖范围」，这是访客决定是否 star 的依据。
- `dsh-plugin` topic 让仓库出现在 GitHub 的插件话题聚合里。
- 社区分享（多个同类插件的 README 都提到 Linux.do）需要**你本人**去发帖，我不代发。
