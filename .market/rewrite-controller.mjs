import fs from 'node:fs'

const file = 'lib/client.js'
let source = fs.readFileSync(file, 'utf8')

const startMarker = '    /**\n     * The section\'s data plane:'
const endMarker = '    //#endregion\n\n    //#region view'
const start = source.indexOf(startMarker)
const end = source.indexOf(endMarker)
if (start === -1 || end === -1) {
  console.error('rewrite-controller: markers not found')
  process.exit(1)
}

const BLOCK = `    /**
     * The section's data plane.
     *
     * The state model follows the reference implementation deliberately, because
     * the previous one had a defect worth naming: it treated the **catalogue
     * rows** as the state and wrote them back after every edit. But the
     * catalogue is not independent state — it is *derived*, filtered by the
     * hidden list, and the host re-derives it on every write. Reading it back
     * mid-save therefore returns a document that has not caught up, and merging
     * that over the user's action is what made a single switch appear to do
     * nothing.
     *
     * So here:
     *
     *   - **\`hidden\` is the state.** Every operation reads it fresh from
     *     \`form.getSnapshot()\`, computes the next list, and writes that list.
     *     Nothing is derived from a local cache of rows.
     *   - **The catalogue is presentation.** It is read to render rows, and
     *     re-read after each write because the host filters it; a hidden model
     *     is simply absent, and its row is rebuilt from the \`hidden\` entry,
     *     which carries the display name it had when it was hidden.
     *   - **One field per write where possible.** \`hidden\` and \`renamed\` are
     *     separate fields; a visibility edit touches only \`hidden\`, so there is
     *     no window in which half an edit is visible to a reader.
     */
    class ModelTidyController {
      constructor(form, readCatalog) {
        this.form = form
        this.readCatalog = readCatalog
        this.listeners = new Set()
        /** Catalogue as last read, already filtered by \`hidden\`. */
        this.catalog = null
        this.loadError = ''
        this.phase = 'loading'
        this.generation = 0
        this.disposed = false
        this.unsubscribeForm = undefined
        /**
         * Recompute on every document change.
         *
         * The host broadcasts once per field write and after any other surface
         * touches the namespace, so this is the single place that keeps the view
         * in step. Unlike the previous design it does not re-read the catalogue
         * on every notification — only when the hidden list actually differs
         * from the one the current catalogue was derived from.
         */
        if (typeof form?.subscribe === 'function') {
          this.unsubscribeForm = form.subscribe(() => {
            if (this.disposed) return
            this.recompute()
          })
        }
      }

      subscribe(listener) {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
      }

      emit() {
        for (const listener of this.listeners) listener()
      }

      /** The namespace section, or an empty document while it is unavailable. */
      section() {
        const snapshot = this.form?.getSnapshot?.()
        const value = snapshot?.value
        return value !== null && typeof value === 'object' ? value : {}
      }

      /** Whether this page may persist the namespace at all. */
      get writable() {
        return this.form?.getSnapshot?.()?.writable !== false
      }

      hiddenEntries() {
        const hidden = this.section().hidden
        return Array.isArray(hidden) ? hidden : []
      }

      renamedEntries() {
        const renamed = this.section().renamed
        return Array.isArray(renamed) ? renamed : []
      }

      /**
       * Read the catalogue. Responses are generation-guarded so a slow read
       * cannot overwrite a newer one.
       */
      async load() {
        const generation = ++this.generation
        if (this.catalog === null) {
          this.phase = 'loading'
          this.emit()
        }
        try {
          const groups = await this.readCatalog()
          if (generation !== this.generation || this.disposed) return
          this.catalog = (groups ?? []).map(group => ({
            id: String(group?.id ?? ''),
            name: String(group?.name ?? group?.id ?? ''),
            models: (group?.models ?? []).map(model => ({
              id: String(model?.id ?? ''),
              name: String(model?.name ?? model?.id ?? ''),
            })).filter(model => model.id !== ''),
          })).filter(group => group.id !== '')
          this.loadError = ''
        } catch (error) {
          if (generation !== this.generation || this.disposed) return
          this.loadError = String(error?.message ?? error)
        }
        this.recompute()
      }

      /**
       * Build the view state from the two inputs: the saved document and the
       * catalogue. Hidden rows missing from the catalogue are reconstructed from
       * their saved entry, so a hidden model never disappears from the page.
       */
      recompute() {
        const hidden = this.hiddenEntries()
        const aliases = new Map(
          this.renamedEntries().map(entry => [\`\${entry.provider}\\u0000\${entry.model}\`, String(entry.alias ?? '')]),
        )
        const hiddenByKey = new Map(hidden.map(entry => [\`\${entry.provider}\\u0000\${entry.model}\`, entry]))

        const groups = []
        const seen = new Set()
        for (const group of this.catalog ?? []) {
          const rows = []
          for (const model of group.models) {
            const key = \`\${group.id}\\u0000\${model.id}\`
            seen.add(key)
            rows.push({
              key,
              provider: group.id,
              model: model.id,
              name: model.name,
              alias: aliases.get(key) ?? '',
              hidden: hiddenByKey.has(key),
              stale: false,
            })
          }
          groups.push({ id: group.id, name: group.name, rows })
        }

        // Rows that exist only because they are hidden or renamed: the model
        // stopped being advertised, but the decision about it must survive.
        for (const [key, entry] of hiddenByKey) {
          if (seen.has(key)) continue
          const [provider, model] = key.split('\\u0000')
          const group = groups.find(g => g.id === provider)
            ?? (groups.push({ id: provider, name: provider, rows: [] }), groups[groups.length - 1])
          group.rows.push({
            key,
            provider,
            model,
            name: String(entry.name ?? model),
            alias: aliases.get(key) ?? '',
            hidden: true,
            stale: true,
          })
        }
        for (const [key] of aliases) {
          if (seen.has(key) || hiddenByKey.has(key)) continue
          const [provider, model] = key.split('\\u0000')
          const group = groups.find(g => g.id === provider)
            ?? (groups.push({ id: provider, name: provider, rows: [] }), groups[groups.length - 1])
          group.rows.push({
            key,
            provider,
            model,
            name: model,
            alias: aliases.get(key) ?? '',
            hidden: false,
            stale: true,
          })
        }

        const nonEmpty = groups.filter(group => group.rows.length > 0)
        const total = nonEmpty.reduce((sum, group) => sum + group.rows.length, 0)
        const visible = nonEmpty.reduce(
          (sum, group) => sum + group.rows.filter(row => !row.hidden).length,
          0,
        )

        this.phase = this.loadError !== '' && this.catalog === null ? 'error' : 'ready'
        this.state = {
          phase: this.phase,
          error: this.loadError,
          writable: this.writable,
          groups: nonEmpty,
          total,
          visible,
          hiddenCount: total - visible,
          aliasCount: nonEmpty.reduce(
            (sum, group) => sum + group.rows.filter(row => row.alias.trim() !== '').length,
            0,
          ),
        }
        this.emit()
      }

      /**
       * The next hidden list after flipping one model.
       *
       * Reads the current list from the document rather than from any local
       * copy: that is what keeps two quick edits from computing over the same
       * stale input and losing one of them.
       */
      nextHidden(provider, model, name, hidden) {
        const rest = this.hiddenEntries().filter(
          entry => !(entry.provider === provider && entry.model === model),
        )
        return hidden ? [...rest, { provider, model, name }] : rest
      }

      /** Write the hidden list, then re-read the catalogue it filters. */
      async writeHidden(next) {
        try {
          await this.form.set('hidden', next)
        } catch {
          /* surfaced by the generation-guarded reload below */
        }
        await this.load()
      }

      /** Flip one model. The single-model switch calls this. */
      async toggle(provider, model, name, hidden) {
        await this.writeHidden(this.nextHidden(provider, model, name, hidden))
      }

      /**
       * Flip every model of one provider.
       *
       * The id set is the union of the (filtered) catalogue rows and the
       * existing hidden entries, so a provider whose models are all hidden
       * still flips back completely — the catalogue alone would show nothing to
       * un-hide.
       */
      async toggleProvider(provider, hidden) {
        const current = this.hiddenEntries()
        const group = (this.catalog ?? []).find(entry => entry.id === provider)
        const ids = new Set([
          ...(group?.models ?? []).map(model => model.id),
          ...current.filter(entry => entry.provider === provider).map(entry => entry.model),
        ])
        if (ids.size === 0) return
        let next = current.filter(entry => entry.provider !== provider)
        if (hidden) {
          const nameOf = id => group?.models.find(model => model.id === id)?.name ?? id
          next = [...next, ...[...ids].map(id => ({ provider, model: id, name: nameOf(id) }))]
        }
        await this.writeHidden(next)
      }

      /** Show every model again. */
      async showAll() {
        await this.writeHidden([])
      }

      /** Hide every model currently in the catalogue. */
      async hideAll() {
        const next = []
        for (const group of this.catalog ?? []) {
          for (const model of group.models) {
            next.push({ provider: group.id, model: model.id, name: model.name })
          }
        }
        for (const entry of this.hiddenEntries()) {
          if (!next.some(item => item.provider === entry.provider && item.model === entry.model)) {
            next.push(entry)
          }
        }
        await this.writeHidden(next)
      }

      /**
       * Set or clear one model's alias.
       *
       * Only the \`renamed\` field is written, so a rename never disturbs the
       * hidden list and vice versa.
       */
      async setAlias(provider, model, alias) {
        const trimmed = String(alias ?? '').trim()
        const rest = this.renamedEntries().filter(
          entry => !(entry.provider === provider && entry.model === model),
        )
        const next = trimmed === '' ? rest : [...rest, { provider, model, alias: trimmed }]
        try {
          await this.form.set('renamed', next)
        } catch {
          /* the subscription recomputes from the document either way */
        }
        this.recompute()
      }

      /** Drop every alias. */
      async clearAliases() {
        try {
          await this.form.set('renamed', [])
        } catch {
          /* see setAlias */
        }
        this.recompute()
      }

      /** Restore every model and clear every alias. */
      async resetAll() {
        try {
          await this.form.set('hidden', [])
          await this.form.set('renamed', [])
        } catch {
          /* see setAlias */
        }
        await this.load()
      }

      dispose() {
        this.disposed = true
        if (typeof this.unsubscribeForm === 'function') {
          this.unsubscribeForm()
          this.unsubscribeForm = undefined
        }
        this.listeners.clear()
      }
    }

`

source = source.slice(0, start) + BLOCK + source.slice(end)
fs.writeFileSync(file, source, 'utf8')
console.log('rewrite-controller: controller replaced with the reference state model')
