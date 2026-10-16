# dsh-model-tidy

[English](https://github.com/star-Cosmo/dsh-model-tidy/blob/main/README.md) · **中文**

一个让 DeepSeek Harness 模型选择器保持整洁的插件。

## 它做什么

装了几个 provider 插件之后，模型菜单里会塞满你很少选的模型。本插件在 DSH 设置里新增一个独立的「**模型整理**」分区页，把 harness 已知的**全部模型**——不管它是由哪个插件注册的——各配一个开关。关掉一个模型，它就从选择器里消失；再打开，它回来。

隐藏**只影响显示**：

- 不重写你的 provider 配置。
- 已在用该模型的会话不受影响，继续可用。
- 卸载插件即恢复原本的列表。

## 状态

开发早期。插件清单、bundle 补丁与项目骨架已就位，设置界面正在开发中。

## 安装

```sh
dsh plugin --profile desktop add dsh-model-tidy
```

## 许可证

MIT
