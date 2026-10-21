# dsh-model-tidy — 发布与收录手册

> 本文件是操作备忘。发布 npm 与提市场 PR 都需要**人工确认**，不放进 npm 包（`files` 未包含它）。

## 当前状态

| 项目 | 状态 |
|---|---|
| GitHub 仓库 | https://github.com/star-Cosmo/dsh-model-tidy（公开，已加 `dsh-plugin` topic） |
| 本地工作区 | `E:\Workstation\Github-starCosmo\dsh-model-tidy` |
| 测试 | `npm test` 十三套全过 |
| npm | 已发布，最新 `1.1.0`（2026-10-21，经 GitHub Actions + OIDC） |
| 市场收录 | 已合并（PR #7702）；描述更新 PR #8410 |
| 截图 | 仓库根有 `screenshots.json`，声明 `docs/screenshots/main.png` |

## 零、日常发版（OIDC 自动发布，首选）

已配置 npm Trusted Publisher，不需要本地登录 npm，也不需要在任何地方存 token。

```powershell
cd E:\Workstation\Github-starCosmo\dsh-model-tidy

# 1. 改代码 / README / 市场描述，跑测试
npm test

# 2. 升版本（不自动打 tag）
npm version minor --no-git-tag-version    # 或 patch / major

# 3. 提交并推送
git commit -am "发布：<版本说明>"
git push origin main

# 4. 打 tag 并推送 —— 这一步触发 .github/workflows/publish.yml
git tag v<version>
git push origin v<version>
```

workflow 会在 CI 里跑 `npm ci` + `npm test`，校验 tag 与 `package.json` 版本一致，然后用 OIDC 身份 `npm publish`，并自动生成 provenance（npm 包页面会显示「由本仓库的 workflow 构建并发布」）。

**如果 workflow 失败**：修好后不要打新 tag，直接重跑失败的 job：

```powershell
& "E:\MyGit\GitHubCLI\bin\gh.exe" run rerun <run-id> --repo star-Cosmo/dsh-model-tidy --failed
```

### npm 侧必须已建立的配置（一次性）

包页面 → Settings → **Trusted Publisher** → GitHub Actions：

| 字段 | 值 |
|---|---|
| Organization or user | `star-Cosmo` |
| Repository | `dsh-model-tidy` |
| Workflow filename | `publish.yml` |
| Allowed actions | 必须勾 **Allow `npm publish`** |

⚠️ **只勾默认的「npm stage publish is always allowed」不够**：workflow 执行的是真正的 `npm publish`，会被 npm 以 `403 OIDC permission denied for this action` 拒绝。这一项需要显式勾上 `Allow npm publish`。

### 踩过的坑（勿重犯）

1. **workflow 里必须先 `npm ci` 再跑测试**——CI 是全新目录，不装依赖会 `ERR_MODULE_NOT_FOUND`。
2. **`package-lock.json` 不能在 DSH 工作区里生成**：如果项目里 `node_modules/@deepseek-ai/schemastery` 是指向 DSH profile 的结点（junction），npm 会把那个绝对路径写进 lockfile，CI 的 Linux 环境永远装不上。生成 lockfile 前先删掉这类结点，并确认 lockfile 里只有 `node_modules/...` 相对路径。
3. **tag 必须打在已包含修复的提交上**：tag 指向旧提交时，重跑只会重复旧的失败。

## 一、发布 npm（手动兜底，仅在 OIDC 不可用时使用）

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
