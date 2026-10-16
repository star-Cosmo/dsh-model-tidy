# dsh-model-tidy

**English** · [中文](https://github.com/star-Cosmo/dsh-model-tidy/blob/main/README.zh.md)

A DeepSeek Harness plugin that keeps the model selector tidy — choose which
models appear, and rename the ones you keep.

## The problem

Install two or three provider plugins and the model menu turns into a wall. A
free-tier lane, a workbench app, a couple of hand-configured gateways, and
suddenly there are thirty entries — most of them models you will never pick,
several of them near-duplicates reachable through different routes.

A model selector is a decision surface, not an inventory. It should show the
handful of models you actually use, under names you recognise.

## What it does

Installing the plugin adds a **Model Tidy** section to the DSH settings with
one row per model:

```
┌────┬──────────────────────────────┬──────────────────────────┐
│ ☑  │ Gemini 3.8 Flash             │ [ Gemini Fast          ] │
│    │ workbuddy · gemini-3.8-flash │                          │
├────┼──────────────────────────────┼──────────────────────────┤
│ ☐  │ grok-4.7                     │ [                      ] │
│    │ workbuddy · grok-4.7         │                          │
└────┴──────────────────────────────┴──────────────────────────┘
    show/hide            real name        your alias
```

- **Show / hide** — one switch per model. Off means it disappears from the
  model selector.
- **Alias** — type a name and the selector offers the model under it. Blank
  keeps the original.
- **Search** — filter by model, provider, or alias.
- **Provider chips and batch toggles** — hide every model from one provider in
  a single click.
- **Restore** — one button clears every alias, another brings every model back.

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

Rows are keyed by **provider + model**, so the same model name reached through
two routes stays two independently controlled rows: `workbuddy/gemini-3.8-flash`
and `gemini/gemini-3.8-flash` are different upstream services and get their own
switch and their own alias.

## Install

```sh
dsh plugin --profile desktop add dsh-model-tidy
```

Then reopen the DSH Web GUI. **Model Tidy** appears in the settings navigation.

## Development

No build step: both halves ship as the plain files the harness loads. The host
half is an ES module; the browser half is a `window.__ModuleLoader__.load`
factory, the format the client module system calls.

```sh
npm test
```

Runs both suites. `test/host.test.mjs` drives the catalogue filter against a
fake `llm` service; `test/client.test.mjs` loads the real browser half in a
stand-in module environment and checks the section it registers.

## Compatibility

Built against DSH `0.2.0-rc.2`. Requires DSH `>= 0.2.0-rc.1`, where the
settings layer gained the `configForms` service this plugin's section writes
through.

## License

MIT
