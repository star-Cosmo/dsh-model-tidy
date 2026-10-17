/**
 * dsh-model-tidy — host half.
 *
 * The plugin settles two display-layer questions about the model catalogue:
 * which models the selector offers, and what each one is called there. Both
 * are answered in the same place, because every surface that lists models
 * reads the catalogue this module owns — `ctx.llm.listModels`.
 *
 * It also answers a third question the browser half cannot answer on its own:
 * whether a model actually works right now. That needs a real model call, and
 * model calls only exist on the host side, so the probe lives here and the
 * section reaches it over a loopback-only route.
 *
 * Three rules shape the implementation:
 *
 *   1. **Tidying is not configuration.** Nothing here writes to another
 *      plugin's settings and no provider definition is rewritten. The hidden
 *      list and the alias table live in this plugin's own namespace, so
 *      removing the plugin removes the effect completely.
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
 * The seams this plugin uses: `llm` carries the catalogue and the streaming
 * call the probe needs. The route half additionally requires `webServer`, which
 * is declared lazily with `ctx.inject` so a host without one still loads the
 * plugin — it just gets no probe button.
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
 * The route the settings section calls to probe a batch of models.
 *
 * Kept under `/plugins/<plugin-id>/` so it cannot collide with a host route,
 * and guarded by the same loopback checks the harness's own privileged routes
 * use: a page on the machine must not be able to drive model calls through a
 * DNS-rebinding trick.
 */
const PROBE_PATH = '/plugins/dsh-model-tidy/probe'

/**
 * How long one model gets to answer before it is reported as timed out.
 *
 * A one-token reply either arrives quickly or the endpoint is not healthy: a
 * working model answers a `ping` in well under a few seconds, while a dead route
 * hangs until something gives up. Eight seconds is long enough for a slow but
 * real model and short enough that a wall of dead models cannot hold the batch
 * open for minutes.
 */
const PROBE_TIMEOUT_MS = 8_000

/**
 * How many probes are in flight at once.
 *
 * The batch used to run strictly one at a time, which is why checking a large
 * catalogue took minutes: the total cost was the sum of every model's latency,
 * and every dead model added its own timeout. Probing a few at a time makes the
 * total closer to `ceil(n / width)` rounds.
 *
 * Not unbounded, though: firing ninety requests at a provider at once is how a
 * free tier starts answering 429 for everything, which would report healthy
 * models as broken. Four keeps the batch quick without looking like abuse.
 */
const PROBE_CONCURRENCY = 4

/**
 * The prompt every probe sends.
 *
 * The point is to learn whether the model answers, not what it thinks, so the
 * reply is capped at a single token and the wording asks for nothing. A model
 * that streams one token back is working; anything else is a result the caller
 * can show.
 */
const PROBE_MESSAGES = [{ role: 'user', content: 'ping' }]

/** Map one thrown error to a short, human-readable reason. */
function describeProbeFailure(error) {
  if (error === null || error === undefined) return 'unknown error'
  const code = typeof error.code === 'string' ? error.code : ''
  const message = typeof error.message === 'string' ? error.message : String(error)
  return code !== '' && !message.includes(code) ? `${code}: ${message}` : message
}

/**
 * Reorder a provider list according to a saved arrangement.
 *
 * The saved list names only the ids the user arranged. Everything else — a
 * provider that registered after the arrangement was made, or one the user never
 * moved — keeps the host's own order and is appended after the arranged ids.
 * That is the same rule the model-level order uses, and for the same reason: a
 * provider added later must not silently insert itself among the places a user
 * chose.
 *
 * Pure, so the wrapper stays a thin shim over `listProviders()`.
 *
 * @param providers - what the host returned, in registration order.
 * @param saved - provider ids in the order the user arranged them.
 * @returns a new array.
 */
export function orderProviders(providers, saved) {
  if (!Array.isArray(providers) || providers.length === 0) return providers
  const wanted = Array.isArray(saved) ? saved.filter(id => typeof id === 'string' && id !== '') : []
  if (wanted.length === 0) return providers
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
  return [...arranged, ...rest]
}

/**
 * Probe one model with a minimal call.
 *
 * Resolves rather than rejects: a failed probe is a result to display, not an
 * error that should abort the batch. The stream's own terminal chunk is the
 * authority — a model can open a stream and then report an error inside it, and
 * those arrive as `{ type: 'finish', reason: { kind: 'error', failure } }`.
 *
 * @param llm - the `ctx.llm` service.
 * @param provider - provider route owning the model.
 * @param model - exact model id.
 * @param signal - caller lifetime.
 * @returns `{ ok, latencyMs, detail }`.
 */
export async function probeModel(llm, provider, model, signal) {
  const startedAt = Date.now()
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  signal?.addEventListener?.('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  timer.unref?.()
  try {
    const stream = llm.stream({
      provider,
      model,
      messages: PROBE_MESSAGES,
      maxTokens: 1,
      signal: controller.signal,
    })
    let sawContent = false
    for await (const chunk of stream) {
      if (chunk?.type === 'finish') {
        const kind = chunk.reason?.kind
        if (kind === 'error') {
          const failure = chunk.reason.failure ?? {}
          return {
            ok: false,
            latencyMs: Date.now() - startedAt,
            detail: describeProbeFailure({ code: failure.code, message: failure.message }),
          }
        }
        if (kind === 'aborted') {
          return {
            ok: false,
            latencyMs: Date.now() - startedAt,
            detail: controller.signal.aborted ? 'timed out' : 'aborted',
          }
        }
        // A clean finish is enough on its own: a model that answers with an
        // empty completion still proved it is reachable and authenticated.
        return { ok: true, latencyMs: Date.now() - startedAt, detail: '' }
      }
      if (chunk?.type === 'text-delta' || chunk?.type === 'text') sawContent = true
    }
    // The iterator ended without a finish chunk. Treat it as a success only if
    // something actually came through; otherwise the connection closed early.
    return sawContent
      ? { ok: true, latencyMs: Date.now() - startedAt, detail: '' }
      : { ok: false, latencyMs: Date.now() - startedAt, detail: 'stream ended without a finish chunk' }
  } catch (error) {
    const aborted = controller.signal.aborted === true
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      detail: aborted ? 'timed out' : describeProbeFailure(error),
    }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener?.('abort', onAbort)
  }
}

/** Read a JSON request body, bounded so a hostile caller cannot balloon memory. */
function readJsonBody(req, limitBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', chunk => {
      size += chunk.length
      if (size > limitBytes) {
        reject(new Error('request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (size === 0) return resolve({})
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch (error) {
        reject(new Error(`request body is not JSON: ${error.message}`))
      }
    })
    req.on('error', reject)
  })
}

/**
 * Whether a request came from this machine.
 *
 * The route can spend tokens, so it must not be reachable from a page that
 * merely resolves to loopback: the Host header has to name loopback too, which
 * a rebinding page cannot do. This mirrors the check the harness's own
 * plugin routes use.
 */
function isLoopbackRequest(req) {
  const host = String(req.headers?.host ?? '').toLowerCase()
  const name = host.split(':')[0]
  if (name !== '127.0.0.1' && name !== 'localhost' && name !== '[::1]' && name !== '::1') return false
  const remote = String(req.socket?.remoteAddress ?? '')
  return remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1'
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  res.end(body)
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
      const wrapper = () => orderProviders(listProviders(), liveRows(config?.providerOrder))
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

  /**
   * The probe route.
   *
   * Declared with `ctx.inject` rather than added to the plugin's own `inject`
   * list so a host without a web server still loads the plugin — it simply
   * never gets the button, because `probeModel` is unreachable.
   *
   * The body is `{ targets: [{ provider, model }] }` and the reply is one
   * result per target, in the order given. Probing runs sequentially: the point
   * is a readable answer per model, and a burst of parallel calls is what
   * tripped upstream rate limits in the first place.
   */
  ctx.inject(['webServer'], child => {
    child.effect(() => {
      const dispose = child.webServer.register({
        kind: 'exact',
        path: PROBE_PATH,
        handler: async (req, res) => {
          if (req.method !== 'POST') {
            sendJson(res, 405, { error: 'method not allowed' })
            return
          }
          if (!isLoopbackRequest(req)) {
            sendJson(res, 403, { error: 'request-not-trusted' })
            return
          }
          let body
          try {
            body = await readJsonBody(req)
          } catch (error) {
            sendJson(res, 400, { error: describeProbeFailure(error) })
            return
          }
          const targets = Array.isArray(body?.targets) ? body.targets : []
          if (targets.length === 0) {
            sendJson(res, 400, { error: 'no targets' })
            return
          }
          const results = []
          /** Normalise one target, or describe why it cannot be probed. */
          const targetOf = target => {
            const provider = String(target?.provider ?? '')
            const model = String(target?.model ?? '')
            return { provider, model }
          }
          const pending = targets.map(targetOf)
          // Probe a few at a time and fill each slot from the queue as it frees
          // up. Results are placed by index so the reply keeps the caller's
          // order even though completion order differs.
          const collected = new Array(pending.length)
          let cursor = 0
          const worker = async () => {
            for (;;) {
              const index = cursor++
              if (index >= pending.length) return
              const { provider, model } = pending[index]
              if (provider === '' || model === '') {
                collected[index] = { provider, model, ok: false, latencyMs: 0, detail: 'invalid target' }
                continue
              }
              collected[index] = { provider, model, ...(await probeModel(llm, provider, model)) }
            }
          }
          const workers = []
          for (let i = 0; i < Math.min(PROBE_CONCURRENCY, pending.length); i++) workers.push(worker())
          await Promise.all(workers)
          results.push(...collected)
          sendJson(res, 200, { results })
        },
      })
      return () => {
        dispose()
      }
    }, 'model-tidy: probe route')
  })
}
