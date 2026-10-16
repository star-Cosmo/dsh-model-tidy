# dsh-model-tidy

**English** · [中文](https://github.com/star-Cosmo/dsh-model-tidy/blob/main/README.zh.md)

A DeepSeek Harness plugin that keeps the model selector tidy — choose which
models appear, give them names you recognise, and keep the billing rate the
provider published.

![The Model Tidy section](docs/screenshots/main.png)

## The problem

Install two or three provider plugins and the model menu turns into a wall. A
free-tier lane, a workbench app, a couple of hand-configured gateways, and
suddenly there are thirty entries — most of them models you will never pick,
several of them near-duplicates reachable through different routes.

A model selector is a decision surface, not an inventory. It should show the
handful of models you actually use, under names you recognise.

## What it does

Installing the plugin adds a **Model Tidy** section to the DSH settings. Models
are grouped by the provider they came from, and each one carries a single switch:

```
┌─ WorkBuddy ───────────────────────────── 8/12 ─ [隐藏全部] [显示全部] ─┐
│  Auto                                            ●───                 │
│  GLM-5.3 · x0.79                                 ●───                 │
│  GLM-5.2 · x0.79 · 夜间折扣          [改备注]    ───●                 │
│  Grok-4.7 · x1.90                                ───●                 │
└───────────────────────────────────────────────────────────────────────┘
┌─ our-free-model ───────────────────────── 6/6 ── [隐藏全部] [显示全部] ─┐
│  Kilo Auto Free                                  ●───                 │
└───────────────────────────────────────────────────────────────────────┘
```

- **One switch per model.** Off means it disappears from the model selector.
- **Alias.** Give a model a name you recognise and the selector offers it under
  that name. The provider's billing suffix stays on the end.
- **Search.** Filter by model, provider, or alias.
- **Per-provider batch.** Hide or show everything from one provider in a click.
- **Global show / hide.** Two buttons for the whole catalogue.
- **Restore.** One button clears every alias, another brings every model back.

## The billing rate survives a rename

Providers publish rates by appending them to the model's display name —
`GLM-5.3 · x0.79` — because the harness's model catalogue has no field for a
rate. Replacing that name outright, which is what a naive rename does, silently
throws the rate away.

This plugin splits the name at the provider's own separator and keeps the tail:

| | name shown in the selector |
|---|---|
| As published | `GLM-5.3 · x0.79` |
| Renamed to "GLM cheap" | **`GLM cheap · x0.79`** |
| Renamed, with promo badges | **`GLM cheap · x0.79 · night discount`** |
| A model with no rate, renamed | `Automatic` ← no stray separator |

## Hiding a model does not move it

A hidden model is absent from the catalogue — the harness filters it — so its row
can only be rebuilt from what was saved. Appending it, as the obvious
implementation does, sends it to the bottom of the group the moment you hide it.
This plugin remembers where each row was first seen, so hiding the third of five
models leaves it third.

## What it deliberately does not do

**Tidying is a display decision, never a configuration change.**

- Your provider configuration is never rewritten. The hidden list and the alias
  table live in this plugin's own settings namespace.
- A model hidden or renamed while a session is using it keeps serving that
  session — routing keys off the model id, and only the label changes.
- Uninstalling the plugin restores the original list completely.
- New models a provider starts advertising are visible by default. The plugin
  records what to hide and what to rename, never what to show.

## Coverage

Switches work across **every** source of models, not just hand-configured
providers. The plugin filters the harness's own catalogue enumeration —
`ctx.llm.listModels` — which is the single list every surface reads. Models
registered by other plugins through `ctx.llm.registerAdapter` and providers
declared under `llm-pi-ai` are both covered, because both end up in it.

Rows are keyed by **provider + model**, so the same model name reached through two
routes stays two independently controlled rows: `workbuddy/gemini-3.8-flash` and
`gemini/gemini-3.8-flash` are different upstream services and get their own switch
and their own alias.

## Install

```sh
dsh plugin --profile <your-profile> add dsh-model-tidy
```

Then reopen the DSH Web GUI. **Model Tidy** appears in the settings navigation.

## Development

No build step: both halves ship as the plain files the harness loads. The host
half is an ES module; the browser half is a `window.__ModuleLoader__.load`
factory, the format the client module system calls.

```sh
npm test
```

Runs seven suites — the catalogue filter, the billing-suffix split, the browser
half's behaviour, the alias capture, row ordering, the rendered tree, and
coexistence with another plugin that wraps the same method.

`npm run check:packaging` verifies the client dependency declaration names
packages the harness actually ships.

## Compatibility

Built against DSH `0.2.0-rc.2`. Requires DSH `>= 0.2.0-rc.1`, where the settings
layer gained the `configForms` service this plugin's section writes through.

## License

MIT
