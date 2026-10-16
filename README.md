# dsh-model-tidy

**English** · [中文](https://github.com/star-Cosmo/dsh-model-tidy/blob/main/README.zh.md)

A DeepSeek Harness plugin that keeps the model selector tidy.

## What it does

After installing a few provider plugins, the model menu fills with models you
rarely pick. This plugin adds a dedicated **Model Tidy** section to the DSH
settings, where every model the harness knows about — no matter which plugin
registered it — gets one switch. Turn a model off and it disappears from the
selector; turn it back on and it returns.

Hiding is a **display decision only**:

- Your provider configuration is never rewritten.
- A hidden model keeps working in sessions that already use it.
- Uninstalling the plugin restores the original list.

## Status

Early development. The plugin manifest, bundle patch and project scaffolding
are in place; the settings surface is being built.

## Install

```sh
dsh plugin --profile desktop add dsh-model-tidy
```

## License

MIT
