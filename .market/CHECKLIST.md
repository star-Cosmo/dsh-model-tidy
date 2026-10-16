# 市场收录自查清单

对照 [awesome-dsh-plugin contributing.md](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md) 逐项核对。
提交前请重新跑一遍本清单。

## 一、CI 机械检查（必须先过）

| # | 要求 | 状态 | 证据 |
|---|---|---|---|
| 1 | 仓库声明 `dsh.bundle` manifest | ✅ | `package.json` → `dsh.bundle.patch = "./cordis.patch.yml"` |
| 2 | 根目录存在 `cordis.patch.yml`，且为 **YAML 序列** | ✅ | 文件为顶层数组，`- insert:` |
| 3 | patch 里的 `name` 指向本包 | ✅ | `name: dsh-model-tidy` |
| 4 | 仓库创建满 1 天 | ⏳ | 创建于 2026-10-16 06:45 UTC；**北京时间 2026-10-17 14:45 后可提** |
| 5 | 仓库含真实可用代码 | ✅ | `lib/index.js`（宿主半，目录过滤）、`lib/client.js`（浏览器半，设置分区） |
| 6 | 仓库带 `dsh-plugin` topic | ✅ | 已加，另有 `deepseek-harness`、`dsh` |
| 7 | 一个 PR 最多 3 条 | ✅ | 只提 1 条 |
| 8 | 不改动他人条目、不手工编辑生成的 README | ✅ | 只新增 `data/plugins/star-Cosmo__dsh-model-tidy.yml` |

## 二、描述准确性（维护者会照着代码逐条核对）

`description` 里的每一项都必须在代码里找得到：

| 描述中的声明 | 代码位置 | 核实 |
|---|---|---|
| hide any model from the selector | `lib/index.js` 的 `listModels` 包装按 `hidden` 过滤 | ✅ |
| give it your own display name | 同一包装按 `renamed` 替换 `name` | ✅ |
| search | `lib/client.js` 的 `visibleRows()` 按模型/渠道/备注匹配 | ✅ |
| per-provider batch toggles | `controller.toggleProvider()` + 设置页的批量按钮 | ✅ |
| one-click restore | `controller.resetAll()` / `clearAliases()` | ✅ |
| no provider configuration is rewritten | 只写本插件命名空间 `model-tidy`，不触碰 `llm-pi-ai.providers` | ✅ |

**注意**：描述里**不能出现**代码里没有的东西。例如不要写"支持拖动排序""支持导入导出"——都没实现。

## 三、提交 PR 的步骤

### 1. 前置确认

```powershell
# 仓库已满 1 天（北京时间 2026-10-17 14:45 之后）
# 远端有最新代码
cd E:\Workstation\Github-starCosmo\dsh-model-tidy
git log --oneline -1
git push origin main
```

### 2. 加文件到目标仓库

文件内容见 `.market/star-Cosmo__dsh-model-tidy.yml`，目标是：

```
data/plugins/star-Cosmo__dsh-model-tidy.yml
```

> 文件名规则：`<owner>__<repo>.yml`，双下划线。

### 3. 提 PR

```powershell
$gh = "E:\MyGit\GitHubCLI\bin\gh.exe"
& $gh repo fork awesome-dsh-plugin/awesome-dsh-plugin --clone=false

# 在 fork 上建分支、加文件、提交（用中文提交信息）
# 然后：
& $gh pr create --repo awesome-dsh-plugin/awesome-dsh-plugin `
  --title "Add star-Cosmo/dsh-model-tidy" `
  --body "Adds dsh-model-tidy: hide any model from the selector or give it your own display name. Display only — no provider configuration is rewritten."
```

### 4. 提交前最后一步：跑安装校验

```powershell
node test/install-check.mjs "E:\AI agent\DeepseekHarness\dsh-data\.dsh\profiles\desktop"
```

这份脚本覆盖 CI 会查的 manifest / patch / bundles / 依赖项。

## 四、截图（可选，未做）

市场详情页会展示 AppStore 风格截图。当前**未提供** `screenshots.json`，市场会退化为从 README 抽取图片（README 里有 ASCII 示意图，不是图片，所以详情页可能无图）。

若之后要补：在自己仓库根放 `screenshots.json`，列出 1–8 张相对路径图片，然后 `git push` 即可，无需再提 PR。

## 五、已知限制（不写进收录描述）

1. **与 `dsh-model-visibility` 同时包装 `llm.listModels`**：两者能共存，但对方**先卸载**时会用裸 `delete` 连带删除本插件的包装（见 `test/coexistence.test.mjs` 中记录的测试）。本插件自己的一侧已做到按层还原。建议只装其一。
2. **改名对"已选模型的旧会话"**：选择器触发按钮读的是会话状态快照，可能需要重新选择一次模型才会显示新名字。列表本身即时生效。
3. **纯显示层**：不改变任何上游路由；隐藏一个正在使用的模型不会中断该会话。
