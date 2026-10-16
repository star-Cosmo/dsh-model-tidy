/**
 * dsh-model-tidy — host half.
 *
 * The plugin's job is a display-layer decision: which models the harness
 * advertises to the selector. The host half owns that decision because the
 * catalogue every surface reads is produced here, by `ctx.llm.listModels`;
 * the browser half only draws the switches that flip it.
 *
 * Two rules shape the implementation:
 *
 *   1. Tidying is not configuration. Nothing in this file writes to another
 *      plugin's settings, and no provider definition is rewritten — the
 *      hidden set lives in this plugin's own namespace, so removing the
 *      plugin removes the effect.
 *   2. A model that is already in use must keep working. Catalogue membership
 *      is advisory in the harness, so filtering the list never interrupts a
 *      session that is mid-turn on a now-hidden model.
 */
import z from '@deepseek-ai/schemastery'

export const name = 'dsh-model-tidy'

/** The seam this plugin wraps: `ctx.llm` carries the model catalogue. */
export const inject = ['llm']

/** Settings namespace this plugin owns. Nothing else reads or writes it. */
export const MODEL_TIDY_NS = 'model-tidy'

/**
 * The hidden set. Declared `volatile()` on purpose: the loader then commits a
 * settings form's new value into the same stable reference this module holds,
 * so a toggle takes effect without restarting the plugin or the harness.
 */
const Config = z.object({
  hidden: z
    .array(
      z.object({
        provider: z.string().required(),
        model: z.string().required(),
        name: z.string(),
      }),
    )
    .default([])
    .volatile(),
})

export { Config }

/**
 * Mount the catalogue filter.
 *
 * Wrapping `listModels` — rather than each provider's own definition — is what
 * makes the switches work across *every* source: plugins that register through
 * `ctx.llm.registerAdapter` and providers declared under `llm-pi-ai` alike end
 * up in this one enumeration, so one filter covers them all.
 */
export function apply(ctx, config) {
  ctx.inject(['settings'], child => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber))
  })

  const llm = ctx.llm
  const listModels = llm.listModels.bind(llm)

  ctx.effect(() => {
    Object.defineProperty(llm, 'listModels', {
      configurable: true,
      writable: true,
      value: async provider => {
        const models = await listModels(provider)
        const hidden = new Set(
          config.hidden
            .get()
            .filter(entry => entry.provider === provider)
            .map(entry => entry.model),
        )
        if (hidden.size === 0) return models
        return models.filter(model => !hidden.has(model.id))
      },
    })
    // Dropping the own property restores the prototype method, so a reload or
    // uninstall leaves the catalogue exactly as it was found.
    return () => {
      delete llm.listModels
    }
  }, 'model-tidy: catalogue filter')
}
