# dsh-model-tidy

[中文](README.md) · **English** · [日本語](README.ja.md) · [Русский](README.ru.md)

A DeepSeek Harness plugin that keeps the model selector tidy — choose which
models appear, give them names you recognise, arrange them in an order you
define, and keep the billing rate the provider published. It also carries an
optional availability check, so you can confirm a model still works right now.

![The Model Tidy section](docs/screenshots/main.png)

## The problem

Install two or three provider plugins and the model menu turns into a wall. A
free-tier lane, a workbench app, a couple of hand-configured gateways, and
suddenly there are thirty entries — most of them models you will never pick,
several of them near-duplicates reachable through different routes.

A model selector is a decision surface, not an inventory. It should show the
handful of models you actually use, under names you recognise, in an order you
define.

## What it does

Installing the plugin adds a **Model Tidy** section to the DSH settings. Models
are grouped by the provider they came from — one card per provider — and each
one carries a single switch:

```
┌─ WorkBuddy ───── 8/12 ─ [reset order] [hide all] [show all] ─┐
│ ▲▼  Auto                                         ●───       │
│ ▲▼  GLM-5.3 · x0.79                              ●───       │
│ ▲▼  GLM-5.2 · x0.79 · night discount   ● [alias] ───●       │
│ ▲▼  Grok-4.7 · x1.90                               ───●       │
└─────────────────────────────────────────────────────────────┘
┌─ our-free-model ─ 6/6 ── [reset order] [hide all] [show all] ─┐
│ ▲▼  Kilo Auto Free                                  ●───       │
└─────────────────────────────────────────────────────────────┘
```

- **One switch per model.** Off means it disappears from the model selector.
- **Up/down arrows (`▲▼`).** Order both the provider cards and the models inside
  a provider; a head button restores the catalogue order in one click.
- **Alias.** Give a model a name you recognise and the selector offers it under
  that name. The provider's billing suffix stays on the end.
- **Search.** Filter by model, provider, or alias.
- **Per-provider batch.** Hide or show everything from one provider in a click.
- **Global show / hide.** Two buttons for the whole catalogue.
- **Availability check.** Confirm which shown models actually work right now, one
  status dot per row.
- **Restore.** One button clears every alias, another brings every model back.

## Custom order (models)

Each row carries a pair of arrows for arranging it within its provider. The
order is **saved explicitly**, so it survives a restart and follows a settings
sync to another machine.

- **Order, not visibility.** A model you have arranged stays at its place in the
  saved order when hidden, and returns to it when shown again.
- **New models land after the arranged ones.** A model a provider adds later
  does not appear in the middle of a sequence you took care to arrange.
- **Ordering works while filtering.** With a search active the arrows swap the
  two *visible* neighbours, so a click always does something visible; rows the
  filter hides keep their own relative positions.
- **One-click undo.** "Reset order" drops a provider's custom sequence and
  returns to catalogue order.

## Custom order (providers)

Every provider card also carries a pair of arrows, so you can move the channels
you use most to the top. The channel order is **stored separately**
(`providerOrder`), is independent of any session, and survives a restart.

- **Only what you touched is moved.** Channels you never reordered — and any
  provider registered later — keep their own positions and trail the arranged
  ones.
- **Independent from the model order.** Moving a channel does not disturb the
  model order inside any provider.
- **One-click undo.** "Reset provider order" in the control bar returns to the
  harness's own channel order.

## Availability check

A model selector only tells you that a model is *listed* — never that it
currently works. After installing a few providers, a retired model or a dead
gateway route does not quietly disappear.

Clicking **Check availability** opens a confirmation dialog — because it spends a
small number of tokens — stating that it will send one tiny request (a single
word is asked for) to each *shown* model. Each row then carries a status dot:

- **green** = available
- **red** = unavailable (hover for the latency and the failure reason)
- **amber** = checking
- **grey** = not checked

The probe runs on the host side, where model calls exist; the front end hands
the models to a loopback-only route in batches, and the host probes them with a
bounded worker pool (width 4, an 8-second timeout per model), returning each
verdict to its own row. You can stop a run at any time. Hidden models are never
probed, and the results live only in memory — availability is the truth of *this
moment*, and is never persisted into a stale verdict for the next session.

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

- Your provider configuration is never rewritten. The hidden list, the alias
  table and the ordering records live in this plugin's own settings namespace.
- A model hidden or renamed while a session is using it keeps serving that
  session — routing keys off the model id, and only the label changes.
- Uninstalling the plugin restores the original list completely.
- New models a provider starts advertising are visible by default. The plugin
  records what to hide, what to rename and what to order — never what to show.

## Coverage

Switches work across **every** source of models, not just hand-configured
providers. The plugin filters the harness's own catalogue enumeration —
`ctx.llm.listModels` and `ctx.llm.listProviders` — which is the list every
surface reads. Models registered by other plugins through
`ctx.llm.registerAdapter` and providers declared under `llm-pi-ai` are both
covered, because both end up in it.

Rows are keyed by **provider + model**, so the same model name reached through two
routes stays two independently controlled rows: `workbuddy/gemini-3.8-flash` and
`gemini/gemini-3.8-flash` are different upstream services and get their own switch
and their own alias.

## Install

```sh
dsh plugin --profile <your-profile> add dsh-model-tidy
```

Then reopen the DSH Web GUI. **Model Tidy** appears in the settings navigation.

> The availability check needs the host to run a web service; environments
> without one still get the full tidying features, just none of the probe
> button.

## Development

No build step: both halves ship as the plain files the harness loads. The host
half is an ES module; the browser half is a `window.__ModuleLoader__.load`
factory, the format the client module system calls.

```sh
npm test
```

Runs thirteen suites — the catalogue filter, the billing-suffix split, the
browser half's behaviour, the alias capture, row ordering, model custom ordering,
provider custom ordering, ordering with rendering, the availability probe, probe
speed, probe rendering, the rendered tree itself, and coexistence with another
plugin that wraps the same method.

`npm run check:packaging` verifies the client dependency declaration names
packages the harness actually ships.

## Compatibility

Built against DSH `0.2.0-rc.2`. Requires DSH `>= 0.2.0-rc.1`, where the settings
layer gained the `configForms` service this plugin's section writes through.

## License

MIT