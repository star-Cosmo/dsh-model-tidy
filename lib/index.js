/**
 * dsh-model-tidy — host half.
 *
 * The plugin settles three display-layer questions about the model catalogue:
 * which models the selector offers, what each one is called there, and what
 * order they and their providers appear in. All are answered in the same
 * place, because every surface that lists models reads the catalogue this
 * module owns — `ctx.llm.listModels` and `ctx.llm.listProviders`.
 *
 * Three rules shape the implementation:
 *
 *   1. **Tidying is not configuration.** Nothing here writes to another
 *      plugin's settings and no provider definition is rewritten. The hidden
 *      list, the alias table and the ordering records live in this plugin's own
 *      namespace, so removing the plugin removes the effect completely.
 *   2. **A rename is a label, never an identity.** Routing keys off
 *      `provider` + `model`; only `name` is swapped. A model renamed while a
 *      session is using it keeps serving that session, and the request still
 *      reaches the real upstream model.
 *   3. **New models stay visible.** The plugin records what to hide and what
 *      to rename — not what to show — so a provider that starts advertising a
 *      model tomorrow gets it listed without any action here.
 */
import z from '@deepseek-ai/schemastery'

export const name = 'dsh-model-tidy'

/**
 * The seam this plugin uses: `llm` carries the catalogue it filters, renames
 * and reorders. Nothing else is required — the plugin touches no web server,
 * no settings document outside its own namespace, and no provider definition.
 */
export const inject = ['llm']

/** Settings namespace this plugin owns. Nothing else reads or writes it. */
export const MODEL_TIDY_NS = 'model-tidy'

/**
 * One entry per provider+model pair, keyed by both so the same model name
 * reached through two different routes stays two independently tidied rows:
 * `workbuddy/gemini-3.8-flash` and `gemini/gemini-3.8-flash` are different
 * upstream services and deserve separate switches and separate labels.
 *
 * `name` is the model's original display name, snapshotted when the row was
 * first tidied. It is carried so the settings page can still show what a
 * hidden model *was*: once a model is filtered out of the catalogue, the
 * catalogue can no longer be asked for its name.
 */
const Entry = z.object({
  provider: z.string().required(),
  model: z.string().required(),
  name: z.string(),
})

/**
 * The plugin's own state. Declared `volatile()` on purpose: the loader then
 * commits a settings form's new value into the same stable reference this
 * module already holds, so a toggle or a rename lands without restarting the
 * plugin, the harness, or any running session.
 */
const Config = z.object({
  hidden: z.array(Entry).default([]).volatile(),
  /**
   * User order overrides, grouped by provider.
   *
   * Each entry is an ordered list of model ids. It records only relative order,
   * not visibility: hiding a model never removes its place, and a model a
   * provider adds later is appended after the known ids. Entries are local to
   * this plugin, so no provider settings are changed.
   */
  order: z
    .array(
      z.object({
        provider: z.string().required(),
        models: z.array(z.string()).required(),
      }),
    )
    .default([])
    .volatile(),
  /**
   * Channel order: provider ids in the order the user arranged them.
   *
   * Separate from `order` because the two act at different levels — `order`
   * arranges the models inside one channel, this one arranges the channels
   * themselves. The model picker builds its groups from `listProviders()`, whose
   * array order the host honours, so reordering that array is what moves a
   * frequently used channel to the top.
   *
   * Only the ids listed here are repositioned; a provider that registers later
   * is appended after them, which keeps a newly added channel from displacing
   * an arrangement the user made.
   */
  providerOrder: z.array(z.string()).default([]).volatile(),
  /**
   * Renames for channels themselves.
   *
   * Separate from `renamed` because a channel is not a model: it has an `id`
   * and a display name, no billing suffix, and lives in `listProviders()` rather
   * than `listModels()`. Keeping the two tables apart means renaming a channel
   * can never be mistaken for renaming a model that happens to share its id.
   *
   * Only the label changes. Routing keys off the provider id, so a session
   * already talking to a renamed channel keeps working.
   */
  providerRenamed: z
    .array(
      z.object({
        provider: z.string().required(),
        alias: z.string().required(),
      }),
    )
    .default([])
    .volatile(),
  /**
   * Renames, same key as `hidden`.
   *
   * `alias` replaces the model's bare name; `suffix` is the vendor's own
   * trailing text that must survive the rename. Providers publish billing
   * rates by appending them to `name` — `GLM-5.3 · x0.79` — using `" · "` as
   * the separator precisely because model names contain hyphens. `listModels`
   * returns no rate field, so that suffix is the only place the rate exists,
   * and a rename that replaced `name` wholesale would silently drop it.
   *
   * Storing the suffix rather than re-deriving it on each read is deliberate:
   * once a rename is applied the catalogue name is `alias · suffix`, so a
   * second derivation would append the suffix twice, and an alias that itself
   * contains `" · "` would be ambiguous. The stored value is what the rename
   * was written against.
   */
  renamed: z
    .array(
      z.object({
        provider: z.string().required(),
        model: z.string().required(),
        alias: z.string().required(),
        suffix: z.string(),
      }),
    )
    .default([])
    .volatile(),
})

export { Config }

/** The join used by both lookup tables; NUL cannot occur in either half. */
const KEY_SEP = '\u0000'

/**
 * The separator providers use to append billing facts to a model's display
 * name: a middle dot with spaces, not a hyphen or colon, because model names
 * themselves contain hyphens (`GLM-5.3-Flash`). Both `dsh-workbuddy-connect`
 * and the plugin storefronts this plugin was built against use exactly this
 * string, and it is what `splitSuffix` splits on.
 */
const RATE_SEPARATOR = ' · '

/**
 * Read one field out of the plugin's own state.
 *
 * A field declared `volatile()` is not handed to `apply` as a plain value:
 * the loader passes a live wrapper whose `get()` returns the current row, so
 * the plugin can observe edits without being remounted. Reading it as an array
 * directly would compare a wrapper against entries and silently tidy nothing.
 * Older hosts hand over the plain value, hence the shape check rather than a
 * bare `.get()`.
 */
function liveRows(field) {
  const value = typeof field?.get === 'function' ? field.get() : field
  return Array.isArray(value) ? value : []
}

/**
 * Split a catalogue name into its bare name and the vendor's trailing text.
 *
 * Providers append billing rates to `name` with a middle dot — chosen by the
 * vendor precisely because model names contain hyphens — and join several
 * trailing facts (rate, promo badges) with the same separator. So the first
 * `" · "` is the boundary, and everything after it is suffix.
 */
export function splitSuffix(name) {
  const text = String(name ?? '')
  const at = text.indexOf(RATE_SEPARATOR)
  return at === -1
    ? { bare: text, suffix: '' }
    : { bare: text.slice(0, at), suffix: text.slice(at + RATE_SEPARATOR.length) }
}

/** Split the stored rows into lookup tables keyed `provider\u0000model`. */
function indexes(config) {
  const hidden = new Set()
  const aliases = new Map()
  for (const entry of liveRows(config?.hidden)) {
    if (typeof entry?.provider !== 'string' || typeof entry?.model !== 'string') continue
    hidden.add(`${entry.provider}${KEY_SEP}${entry.model}`)
  }
  for (const entry of liveRows(config?.renamed)) {
    const alias = String(entry?.alias ?? '').trim()
    if (alias === '' || typeof entry?.provider !== 'string' || typeof entry?.model !== 'string') continue
    aliases.set(`${entry.provider}${KEY_SEP}${entry.model}`, {
      alias,
      suffix: String(entry?.suffix ?? '').trim(),
    })
  }
  return { hidden, aliases }
}

/** Marks the wrapper this plugin installed, so teardown can tell whose it is. */
const OWNER = Symbol('dsh-model-tidy.owner')

/**
 * Apply saved channel labels and a saved channel arrangement.
 *
 * Two concerns, one pass, because both answer the same question — what the
 * picker's group headers look like and in what order they appear — and doing
 * them apart would mean two wrappers over the same method.
 *
 * Renaming copies rather than mutates: the provider objects come from the
 * registry and may be shared, so writing `name` in place would leak the alias
 * into every later reader. The `id` is untouched, which is what keeps routing
 * and every per-provider lookup working.
 *
 * Ordering follows the same rule as the model-level order: only ids the user
 * arranged are repositioned, and anything else keeps host order after them, so
 * a channel registered later never displaces an arrangement.
 *
 * Pure, so the wrapper stays a thin shim over `listProviders()`.
 *
 * @param providers - what the host returned, in registration order.
 * @param saved - provider ids in the order the user arranged them.
 * @param labels - `[{ provider, alias }]` channel renames.
 * @returns a new array.
 */
export function orderProviders(providers, saved, labels = []) {
  if (!Array.isArray(providers) || providers.length === 0) return providers
  const renamed = new Map()
  for (const entry of Array.isArray(labels) ? labels : []) {
    const alias = String(entry?.alias ?? '').trim()
    if (alias === '' || typeof entry?.provider !== 'string') continue
    renamed.set(entry.provider, alias)
  }
  const relabel = provider => {
    const alias = renamed.get(provider?.id)
    return alias === undefined ? provider : { ...provider, name: alias }
  }

  const wanted = Array.isArray(saved) ? saved.filter(id => typeof id === 'string' && id !== '') : []
  if (wanted.length === 0) return providers.map(relabel)
  const rank = new Map()
  wanted.forEach((id, index) => {
    if (!rank.has(id)) rank.set(id, index)
  })
  const arranged = []
  const rest = []
  for (const provider of providers) {
    if (rank.has(provider?.id)) arranged.push(provider)
    else rest.push(provider)
  }
  arranged.sort((a, b) => rank.get(a.id) - rank.get(b.id))
  return [...arranged, ...rest].map(relabel)
}

/**
 * Mount the catalogue filter.
 *
 * Wrapping `listModels` — rather than each provider's own definition — is what
 * makes both features work across *every* source: plugins that register
 * through `ctx.llm.registerAdapter` and providers declared under `llm-pi-ai`
 * alike end up in this one enumeration, so one filter covers them all.
 *
 * The override is an own property on the shared service, so more than one
 * plugin can wrap the same method. Teardown therefore removes the property
 * **only while this plugin's wrapper is still on it**: a plain `delete` would
 * also strip a wrapper another plugin installed on top, silently switching its
 * filter off for the rest of the session.
 */
export function apply(ctx, config) {
  ctx.inject(['settings'], child => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber))
  })

  const llm = ctx.llm
  // Captured before the override: the layer this plugin wraps, whether that is
  // the prototype method or another plugin's wrapper. Restoring *this* value on
  // teardown is what keeps a neighbouring plugin's filter alive.
  const hadOwn = Object.prototype.hasOwnProperty.call(llm, 'listModels')
  const previous = llm.listModels
  const listModels = previous.bind(llm)

  ctx.effect(() => {
    const wrapper = async provider => {
      const models = await listModels(provider)
      if (models.length === 0) return models
      const { hidden, aliases } = indexes(config)
      if (hidden.size === 0 && aliases.size === 0) return models
      const kept = []
      for (const model of models) {
        const key = `${provider}${KEY_SEP}${model.id}`
        if (hidden.has(key)) continue
        const rename = aliases.get(key)
        // Renaming copies rather than mutates: the object handed out by the
        // adapter may be shared with the adapter's own cache, and writing
        // `name` in place would leak the alias into every later reader.
        if (rename === undefined) {
          kept.push(model)
          continue
        }
        // The vendor's trailing facts — the billing rate and any promo badges —
        // ride in `name`, and `listModels` carries no field for them. Replacing
        // `name` outright would drop the rate, so the stored suffix is put back.
        // When the stored entry predates this field, fall back to whatever
        // suffix the catalogue name carries right now, so an upgrade keeps the
        // rate on models renamed under the older format.
        const suffix = rename.suffix !== '' ? rename.suffix : splitSuffix(model.name).suffix
        kept.push({
          ...model,
          name: suffix === '' ? rename.alias : `${rename.alias}${RATE_SEPARATOR}${suffix}`,
        })
      }
      return kept
    }
    wrapper[OWNER] = true

    Object.defineProperty(llm, 'listModels', {
      configurable: true,
      writable: true,
      value: wrapper,
    })
    // Restore the captured layer rather than deleting the property: a plain
    // `delete` drops every wrapper stacked on the service, including one a
    // later plugin installed on top of this one. When the layer underneath was
    // the prototype method, putting the own property back would shadow it with
    // what it already returns, so the property is removed instead.
    return () => {
      if (llm.listModels?.[OWNER] !== true) return
      if (hadOwn) {
        Object.defineProperty(llm, 'listModels', { configurable: true, writable: true, value: previous })
      } else {
        delete llm.listModels
      }
    }
  }, 'model-tidy: catalogue filter')

  /**
   * Channel order.
   *
   * The picker builds its groups from `listProviders()` and keeps the array's
   * order, so reordering that array is what moves a frequently used channel to
   * the top. Wrapped exactly like `listModels`, with the same teardown rule: the
   * captured layer is restored, and only while this plugin's wrapper is still
   * the one on the property, so a neighbour's wrapper survives.
   *
   * Guarded on the method's presence: a host that does not expose
   * `listProviders` simply keeps its own order, rather than failing to load the
   * plugin over an optimisation.
   */
  if (typeof llm.listProviders === 'function') {
    const hadProviderOwn = Object.prototype.hasOwnProperty.call(llm, 'listProviders')
    const previousProviders = llm.listProviders
    const listProviders = previousProviders.bind(llm)

    ctx.effect(() => {
      const wrapper = () =>
        orderProviders(
          listProviders(),
          liveRows(config?.providerOrder),
          liveRows(config?.providerRenamed),
        )
      wrapper[OWNER] = true
      Object.defineProperty(llm, 'listProviders', {
        configurable: true,
        writable: true,
        value: wrapper,
      })
      return () => {
        if (llm.listProviders?.[OWNER] !== true) return
        if (hadProviderOwn) {
          Object.defineProperty(llm, 'listProviders', { configurable: true, writable: true, value: previousProviders })
        } else {
          delete llm.listProviders
        }
      }
    }, 'model-tidy: channel order')
  }
}
