/**
 * dsh-model-tidy — browser half.
 *
 * Served by the harness's client module system, which is why this file is a
 * `window.__ModuleLoader__.load` factory rather than an ES module: the loader
 * hands the factory a synchronous CommonJS `require`, and that is how the
 * shared `react` runtime is reached. Everything below is resolved from that
 * one argument — the package ships no build step and no bundled copy of React.
 *
 * The section contributes a single settings page: one row per model, a switch
 * that decides whether the selector offers it, and a field holding the name it
 * is offered under. Both answers are stored by the host half; this half only
 * draws them and writes edits back.
 */
window.__ModuleLoader__.load({
  id: 'dsh-model-tidy',
  factory: require => {
    const module = { exports: {} }
    const exports = module.exports
    const react = require('react')
    const { useState, useEffect, useMemo, useCallback, useRef, useSyncExternalStore } = react

    /** Namespace shared with the host half; the settings section id. */
    const NS = 'model-tidy'
    const STYLE_ID = 'dsh-model-tidy-styles'
    /** Synthetic provider id standing for "every provider". */
    const ALL_PROVIDERS = '*'
    /** Coalescing window for alias edits, in ms. */
    const WRITE_DEBOUNCE_MS = 350

    //#region locales
    const zh = {
      nav: '模型整理',
      title: '模型整理',
      subtitle: '决定模型选择器里出现哪些模型，以及它们叫什么。只改显示，不动任何渠道配置。',
      search: '搜索模型名、渠道或备注',
      loading: '正在读取模型目录…',
      empty: '没有匹配的模型。',
      loadError: '目录加载失败：{message}',
      providerAll: '全部渠道',
      colShow: '显示',
      colModel: '模型',
      colAlias: '备注名（留空即用原名）',
      shown: '显示中',
      hidden: '已隐藏',
      aliasPlaceholder: '例如：DS 快',
      hideProvider: '隐藏该渠道全部',
      showProvider: '显示该渠道全部',
      resetAll: '全部恢复',
      clearAliases: '清空全部备注',
      saving: '保存中…',
      saveError: '保存失败：{message}',
      hiddenCount: '已隐藏 {n} 个',
      aliasCount: '{n} 个已改备注',
      totalCount: '共 {n} 个模型',
      tipTitle: '说明',
      tipBody: '隐藏与备注只影响模型选择器，不会修改渠道配置，也不会打断正在使用该模型的会话。卸载插件即恢复原样。',
      confirmReset: '确定要恢复全部模型、并清空所有备注吗？',
      stale: '已下架',
    }

    const en = {
      nav: 'Model Tidy',
      title: 'Model Tidy',
      subtitle: 'Choose which models the selector offers and what they are called. Display only — no provider configuration is touched.',
      search: 'Search model, provider or alias',
      loading: 'Reading the model catalogue…',
      empty: 'No matching models.',
      loadError: 'Catalogue failed to load: {message}',
      providerAll: 'All providers',
      colShow: 'Show',
      colModel: 'Model',
      colAlias: 'Alias (blank keeps the original)',
      shown: 'Shown',
      hidden: 'Hidden',
      aliasPlaceholder: 'e.g. DS Fast',
      hideProvider: 'Hide all in this provider',
      showProvider: 'Show all in this provider',
      resetAll: 'Restore everything',
      clearAliases: 'Clear all aliases',
      saving: 'Saving…',
      saveError: 'Save failed: {message}',
      hiddenCount: '{n} hidden',
      aliasCount: '{n} renamed',
      totalCount: '{n} models',
      tipTitle: 'About',
      tipBody: 'Hiding and renaming affect the model selector only. Your provider configuration is never written, sessions already using a model keep working, and uninstalling restores the original list.',
      confirmReset: 'Restore every model and clear all aliases?',
      stale: 'withdrawn',
    }

    //#endregion

    //#region styles
    const STYLES = `
.dsh-mt { display: flex; flex-direction: column; gap: 14px; font-size: 13px; }
.dsh-mt-loading, .dsh-mt-empty, .dsh-mt-error { padding: 18px 4px; opacity: .7; }
.dsh-mt-error { color: #d9534f; opacity: 1; }
.dsh-mt-subtitle { margin: 0; line-height: 1.6; opacity: .72; }
.dsh-mt-toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.dsh-mt-search {
  flex: 1 1 220px; min-width: 180px; padding: 7px 10px;
  border: 1px solid rgba(127,127,127,.32); border-radius: 8px;
  background: transparent; color: inherit; font-size: 13px;
}
.dsh-mt-search:focus { outline: 2px solid rgba(90,140,255,.45); outline-offset: 1px; }
.dsh-mt-chip {
  padding: 6px 11px; border: 1px solid rgba(127,127,127,.3); border-radius: 999px;
  background: transparent; color: inherit; cursor: pointer; font-size: 12.5px;
  max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dsh-mt-chip:hover { border-color: rgba(127,127,127,.6); }
.dsh-mt-chip.is-active { border-color: rgba(90,140,255,.85); background: rgba(90,140,255,.14); font-weight: 600; }
.dsh-mt-summary { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 12.5px; opacity: .7; }
.dsh-mt-dot { opacity: .5; }
.dsh-mt-saving { opacity: .85; }
.dsh-mt-error-inline { color: #d9534f; opacity: 1; }
.dsh-mt-row {
  display: grid; grid-template-columns: 44px minmax(140px, 1fr) minmax(160px, 1fr);
  gap: 10px; align-items: center; padding: 7px 8px; border-radius: 8px;
}
.dsh-mt-row:hover { background: rgba(127,127,127,.08); }
.dsh-mt-row.is-hidden .dsh-mt-name { text-decoration: line-through; opacity: .5; }
.dsh-mt-head { font-size: 12px; opacity: .55; padding-bottom: 2px; border-bottom: 1px solid rgba(127,127,127,.2); border-radius: 0; }
.dsh-mt-head:hover { background: transparent; }
.dsh-mt-col-show { display: flex; justify-content: center; }
.dsh-mt-col-show input { width: 15px; height: 15px; cursor: pointer; }
.dsh-mt-col-model { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.dsh-mt-name { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-mt-meta { font-size: 11.5px; opacity: .55; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-mt-col-alias { min-width: 0; }
.dsh-mt-alias {
  width: 100%; padding: 6px 9px; border: 1px solid rgba(127,127,127,.28);
  border-radius: 7px; background: transparent; color: inherit; font-size: 12.5px;
}
.dsh-mt-alias:focus { outline: 2px solid rgba(90,140,255,.4); outline-offset: 1px; }
.dsh-mt-alias::placeholder { opacity: .45; }
.dsh-mt-section { margin: 10px 0 0; font-size: 13px; opacity: .8; }
.dsh-mt-bulk-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 4px 8px; border-radius: 7px; }
.dsh-mt-bulk-row:hover { background: rgba(127,127,127,.08); }
.dsh-mt-bulk-name { font-size: 12.5px; opacity: .75; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-mt-actions { display: flex; flex-wrap: wrap; gap: 8px; padding-top: 6px; }
.dsh-mt-button {
  padding: 7px 13px; border: 1px solid rgba(127,127,127,.32); border-radius: 8px;
  background: transparent; color: inherit; cursor: pointer; font-size: 12.5px;
}
.dsh-mt-button:hover { border-color: rgba(127,127,127,.62); }
.dsh-mt-button-small { padding: 4px 10px; font-size: 12px; }
.dsh-mt-danger:hover { border-color: rgba(217,83,79,.75); color: #d9534f; }
.dsh-mt-tip { padding: 11px 13px; border: 1px solid rgba(127,127,127,.22); border-radius: 9px; font-size: 12px; opacity: .72; }
.dsh-mt-tip strong { display: block; margin-bottom: 4px; opacity: .9; }
.dsh-mt-tip p { margin: 0; line-height: 1.6; }
`

    function ensureStyles() {
      if (typeof document === 'undefined') return
      if (document.getElementById(STYLE_ID)) return
      const tag = document.createElement('style')
      tag.id = STYLE_ID
      tag.textContent = STYLES
      document.head.appendChild(tag)
    }

    //#endregion

    //#region controller
    const keyOf = (provider, model) => provider + '\u0000' + model

    /**
     * The section's data plane: merges the live catalogue with the saved rows,
     * writes through the shared settings form, and coalesces keystrokes.
     *
     * A hidden model is absent from the catalogue by definition, so the saved
     * snapshot is what makes its row renderable at all — every saved entry
     * carries the display name it had when it was tidied.
     */
    class ModelTidyController {
      constructor(form, readCatalog) {
        this.form = form
        this.readCatalog = readCatalog
        this.store = null
        this.listeners = new Set()
        this.loadToken = 0
        this.writeTimer = null
        this.pendingWrite = null
        this.disposed = false
        this.unsubscribeForm = undefined
        // Editing this plugin's namespace from anywhere — another tab, a
        // settings form, the host's own migration — replaces the form's
        // snapshot. Following it keeps the rows honest without this file
        // owning a second copy of the document.
        if (typeof form?.subscribe === 'function') {
          this.unsubscribeForm = form.subscribe(() => {
            if (this.disposed || this.pendingWrite !== null) return
            void this.load()
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

      /**
       * The namespace's current document.
       *
       * `ConfigFormController` answers through `getSnapshot()`, whose `value`
       * is the namespace section; the snapshot is a stable reference until the
       * next change. While the form is still loading — or when the page is a
       * remote one that never got host persistence — `value` is undefined, and
       * an empty document is the honest reading.
       */
      section() {
        const snapshot = this.form?.getSnapshot?.()
        const value = snapshot?.value
        return value !== null && typeof value === 'object' ? value : {}
      }

      saved() {
        const value = this.section()
        return {
          hidden: Array.isArray(value.hidden) ? value.hidden : [],
          renamed: Array.isArray(value.renamed) ? value.renamed : [],
        }
      }

      /**
       * Read the catalogue and rebuild the rows. Runs are token-guarded: an
       * adapter event can trigger a refresh while an earlier one is still in
       * flight, and the most recent request must win whichever response lands
       * first.
       */
      async load() {
        const token = ++this.loadToken
        this.store = Object.assign({}, this.store ?? {}, { status: 'loading', error: '' })
        this.emit()
        try {
          const groups = await this.readCatalog()
          if (this.disposed || token !== this.loadToken) return
          this.store = this.merge(groups)
          this.emit()
        } catch (error) {
          if (this.disposed || token !== this.loadToken) return
          this.store = Object.assign({}, this.store ?? {}, { status: 'error', error: String(error?.message ?? error) })
          this.emit()
        }
      }

      /**
       * Combine the catalogue with the saved state, keeping the catalogue's own
       * order so the page reads the way the selector does. Rows that are only
       * present because they were hidden or renamed are kept too: dropping them
       * would strand a decision the user cannot undo from the UI.
       */
      merge(groups) {
        const saved = this.saved()
        const hiddenKeys = new Set(saved.hidden.map(entry => keyOf(entry.provider, entry.model)))
        const aliasByKey = new Map(saved.renamed.map(entry => [keyOf(entry.provider, entry.model), String(entry.alias ?? '')]))
        const snapshotByKey = new Map(saved.hidden.map(entry => [keyOf(entry.provider, entry.model), String(entry.name ?? '')]))

        const rows = []
        const seen = new Set()
        for (const group of groups ?? []) {
          const provider = String(group?.id ?? '')
          if (provider === '') continue
          for (const model of group?.models ?? []) {
            const modelId = String(model?.id ?? '')
            if (modelId === '') continue
            const key = keyOf(provider, modelId)
            seen.add(key)
            rows.push({
              key,
              provider,
              providerLabel: String(group?.name ?? provider),
              model: modelId,
              name: String(model?.name ?? modelId),
              alias: aliasByKey.get(key) ?? '',
              hidden: hiddenKeys.has(key),
              stale: false,
            })
          }
        }

        for (const key of new Set([...hiddenKeys, ...aliasByKey.keys()])) {
          if (seen.has(key)) continue
          const parts = key.split('\u0000')
          rows.push({
            key,
            provider: parts[0],
            providerLabel: parts[0],
            model: parts[1],
            name: snapshotByKey.get(key) || parts[1],
            alias: aliasByKey.get(key) ?? '',
            hidden: hiddenKeys.has(key),
            stale: true,
          })
        }

        return {
          status: 'ready',
          error: '',
          rows,
          providers: [...new Set(rows.map(row => row.provider))].sort(),
          hiddenCount: rows.filter(row => row.hidden).length,
          aliasCount: rows.filter(row => row.alias.trim() !== '').length,
        }
      }

      /** Rows currently on screen, minus any filtered out — the write source. */
      stateOf(rows) {
        const hidden = []
        const renamed = []
        for (const row of rows) {
          if (row.hidden) hidden.push({ provider: row.provider, model: row.model, name: row.name })
          const alias = row.alias.trim()
          if (alias !== '') renamed.push({ provider: row.provider, model: row.model, alias })
        }
        return { hidden, renamed }
      }

      write(hidden, renamed) {
        this.pendingWrite = { hidden, renamed }
        if (this.writeTimer !== null) clearTimeout(this.writeTimer)
        this.store = Object.assign({}, this.store ?? {}, { status: 'saving', error: '' })
        this.emit()
        this.writeTimer = setTimeout(() => {
          this.writeTimer = null
          void this.flush()
        }, WRITE_DEBOUNCE_MS)
      }

      /** Push any pending edit now; used on blur, Enter and teardown. */
      async flush() {
        if (this.writeTimer !== null) {
          clearTimeout(this.writeTimer)
          this.writeTimer = null
        }
        const next = this.pendingWrite
        if (next === null) return
        this.pendingWrite = null
        try {
          // Two field writes, because `ConfigFormController.set(field, value)`
          // takes one scalar field at a time — the two lists are separate
          // fields of the namespace section, not members of one document.
          const acceptedHidden = await this.form.set('hidden', next.hidden)
          const acceptedRenamed = await this.form.set('renamed', next.renamed)
          if (this.disposed) return
          // `set` answers whether the host accepted the write, not whether it
          // threw: a refused write resolves false. Surface that instead of
          // reloading as if it had landed.
          if (acceptedHidden === false || acceptedRenamed === false) {
            this.store = Object.assign({}, this.store ?? {}, {
              status: 'error',
              error: 'the host refused the write',
            })
            this.emit()
            return
          }
          // Re-read instead of trusting the local copy: the host owns the
          // document, and a rejected or normalised write must not leave the
          // page showing a change that was never stored.
          await this.load()
        } catch (error) {
          if (this.disposed) return
          this.store = Object.assign({}, this.store ?? {}, { status: 'error', error: String(error?.message ?? error) })
          this.emit()
        }
      }

      apply(rows) {
        this.store = Object.assign({}, this.store, {
          rows,
          hiddenCount: rows.filter(row => row.hidden).length,
          aliasCount: rows.filter(row => row.alias.trim() !== '').length,
        })
        this.emit()
        const parts = this.stateOf(rows)
        this.write(parts.hidden, parts.renamed)
      }

      toggle(key, nextHidden) {
        if (!this.store?.rows) return
        this.apply(this.store.rows.map(row => (row.key === key ? Object.assign({}, row, { hidden: nextHidden }) : row)))
      }

      toggleProvider(provider, nextHidden) {
        if (!this.store?.rows) return
        this.apply(this.store.rows.map(row => (row.provider === provider ? Object.assign({}, row, { hidden: nextHidden }) : row)))
      }

      setAlias(key, alias) {
        if (!this.store?.rows) return
        this.apply(this.store.rows.map(row => (row.key === key ? Object.assign({}, row, { alias }) : row)))
      }

      clearAliases() {
        if (!this.store?.rows) return
        this.apply(this.store.rows.map(row => Object.assign({}, row, { alias: '' })))
      }

      resetAll() {
        if (!this.store?.rows) return
        this.apply(this.store.rows.map(row => Object.assign({}, row, { alias: '', hidden: false })))
      }

      dispose() {
        this.disposed = true
        if (this.writeTimer !== null) {
          clearTimeout(this.writeTimer)
          this.writeTimer = null
        }
        // A pending edit is flushed rather than dropped: losing the last
        // keystroke because the panel closed is the data loss this plugin
        // exists to prevent. Two field writes, matching `flush`.
        const pending = this.pendingWrite
        this.pendingWrite = null
        if (pending !== null) {
          void Promise.resolve()
            .then(() => this.form.set('hidden', pending.hidden))
            .then(() => this.form.set('renamed', pending.renamed))
            .catch(() => {})
        }
        if (typeof this.unsubscribeForm === 'function') {
          this.unsubscribeForm()
          this.unsubscribeForm = undefined
        }
        this.listeners.clear()
      }
    }

    //#endregion

    //#region view
    const h = react.createElement

    function visibleRows(store, query, provider) {
      const needle = query.trim().toLowerCase()
      return store.rows.filter(row => {
        if (provider !== ALL_PROVIDERS && row.provider !== provider) return false
        if (needle === '') return true
        return (
          row.model.toLowerCase().includes(needle) ||
          row.name.toLowerCase().includes(needle) ||
          row.alias.toLowerCase().includes(needle) ||
          row.provider.toLowerCase().includes(needle) ||
          row.providerLabel.toLowerCase().includes(needle)
        )
      })
    }

    function ModelTidyPanel(props) {
      const { controller, t } = props
      const state = useSyncExternalStore(
        useCallback(cb => controller.subscribe(cb), [controller]),
        useCallback(() => controller.store, [controller]),
      )
      const [query, setQuery] = useState('')
      const [provider, setProvider] = useState(ALL_PROVIDERS)
      const first = useRef(true)

      useMemo(() => {
        ensureStyles()
      }, [])

      useEffect(() => {
        // The host's catalogue is the only source of truth for which models
        // exist, so the first paint always asks for it.
        if (first.current) {
          first.current = false
          void controller.load()
        }
      }, [controller])

      if (state === null || state === undefined || state.status === 'loading') {
        return h('div', { className: 'dsh-mt dsh-mt-loading' }, t('loading'))
      }
      if (state.status === 'error' && !state.rows) {
        return h('div', { className: 'dsh-mt dsh-mt-error' }, t('loadError').replace('{message}', state.error))
      }

      const rows = visibleRows(state, query, provider)
      const busy = state.status === 'saving'

      const toolbar = h(
        'div',
        { className: 'dsh-mt-toolbar' },
        h('input', {
          className: 'dsh-mt-search',
          type: 'search',
          value: query,
          placeholder: t('search'),
          'aria-label': t('search'),
          onChange: event => setQuery(event.target.value),
        }),
        h(
          'button',
          {
            type: 'button',
            className: provider === ALL_PROVIDERS ? 'dsh-mt-chip is-active' : 'dsh-mt-chip',
            onClick: () => setProvider(ALL_PROVIDERS),
          },
          t('providerAll'),
        ),
        state.providers.map(name =>
          h(
            'button',
            {
              key: name,
              type: 'button',
              className: provider === name ? 'dsh-mt-chip is-active' : 'dsh-mt-chip',
              onClick: () => setProvider(provider === name ? ALL_PROVIDERS : name),
            },
            name,
          ),
        ),
      )

      const summary = h(
        'div',
        { className: 'dsh-mt-summary' },
        h('span', null, t('totalCount').replace('{n}', String(state.rows.length))),
        h('span', { className: 'dsh-mt-dot' }, '·'),
        h('span', null, t('hiddenCount').replace('{n}', String(state.hiddenCount))),
        h('span', { className: 'dsh-mt-dot' }, '·'),
        h('span', null, t('aliasCount').replace('{n}', String(state.aliasCount))),
        busy ? h('span', { className: 'dsh-mt-saving' }, t('saving')) : null,
        state.status === 'error' && state.error
          ? h('span', { className: 'dsh-mt-error-inline' }, t('saveError').replace('{message}', state.error))
          : null,
      )

      const head = h(
        'div',
        { className: 'dsh-mt-row dsh-mt-head' },
        h('span', { className: 'dsh-mt-col-show' }, t('colShow')),
        h('span', { className: 'dsh-mt-col-model' }, t('colModel')),
        h('span', { className: 'dsh-mt-col-alias' }, t('colAlias')),
      )

      const body = rows.map(row =>
        h(
          'div',
          { key: row.key, className: row.hidden ? 'dsh-mt-row is-hidden' : 'dsh-mt-row' },
          h(
            'span',
            { className: 'dsh-mt-col-show' },
            h('input', {
              type: 'checkbox',
              checked: !row.hidden,
              'aria-label': row.hidden ? t('hidden') : t('shown'),
              onChange: event => controller.toggle(row.key, event.target.checked === true),
            }),
          ),
          h(
            'span',
            { className: 'dsh-mt-col-model' },
            h('span', { className: 'dsh-mt-name' }, row.name),
            h(
              'span',
              { className: 'dsh-mt-meta' },
              row.model === row.name ? row.provider : row.provider + ' · ' + row.model,
              row.stale ? ' · ' + t('stale') : '',
            ),
          ),
          h(
            'span',
            { className: 'dsh-mt-col-alias' },
            h('input', {
              className: 'dsh-mt-alias',
              type: 'text',
              value: row.alias,
              placeholder: t('aliasPlaceholder'),
              onChange: event => controller.setAlias(row.key, event.target.value),
              onBlur: () => void controller.flush(),
              onKeyDown: event => {
                if (event.key === 'Enter') void controller.flush()
              },
            }),
          ),
        ),
      )

      const providerBulk = state.providers.map(name => {
        const own = state.rows.filter(row => row.provider === name)
        const allHidden = own.length > 0 && own.every(row => row.hidden)
        return h(
          'div',
          { key: name, className: 'dsh-mt-bulk-row' },
          h('span', { className: 'dsh-mt-bulk-name' }, name + ' (' + own.length + ')'),
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-mt-button dsh-mt-button-small',
              onClick: () => controller.toggleProvider(name, !allHidden),
            },
            allHidden ? t('showProvider') : t('hideProvider'),
          ),
        )
      })

      return h(
        'div',
        { className: 'dsh-mt' },
        h('p', { className: 'dsh-mt-subtitle' }, t('subtitle')),
        toolbar,
        summary,
        head,
        rows.length === 0 ? h('div', { className: 'dsh-mt-empty' }, t('empty')) : null,
        body,
        h('h4', { className: 'dsh-mt-section' }, t('providerAll')),
        providerBulk,
        h(
          'div',
          { className: 'dsh-mt-actions' },
          h('button', { type: 'button', className: 'dsh-mt-button', onClick: () => controller.clearAliases() }, t('clearAliases')),
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-mt-button dsh-mt-danger',
              onClick: () => {
                const scope = globalThis
                if (typeof scope.confirm === 'function' && scope.confirm(t('confirmReset')) === false) return
                controller.resetAll()
              },
            },
            t('resetAll'),
          ),
        ),
        h(
          'div',
          { className: 'dsh-mt-tip' },
          h('strong', null, t('tipTitle')),
          h('p', null, t('tipBody')),
        ),
      )
    }

    //#endregion

    //#region apply
    const name = 'dsh-model-tidy'
    const inject = ['slots', 'locale', 'configForms', 'remote', 'remote.session']

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'model-tidy: copy dictionaries')

      const form = ctx.configForms.get(NS)
      const readCatalog = async () => {
        const response = await ctx.remote.session.modelCatalog()
        if (!response.ok) throw new Error(response.error.code + ': ' + response.error.message)
        return response.value.groups
      }
      const controller = new ModelTidyController(form, readCatalog)
      ctx.effect(() => () => controller.dispose(), 'model-tidy: controller')

      // The catalogue changes when an adapter registers or drops models, and
      // when another plugin writes its own settings — either way the rows on
      // screen are stale until this reloads them.
      ctx.effect(() => {
        const offAdapters = ctx.remote.$on('llm/adapters-updated', () => void controller.load())
        const offSettings = ctx.remote.$on('settings/document-updated', ns => {
          if (ns !== NS) void controller.load()
        })
        return () => {
          offAdapters()
          offSettings()
        }
      }, 'model-tidy: catalogue invalidation')

      const t = ctx.locale.bind(NS)
      const injected = () => ({ controller, t })

      ctx.effect(
        () =>
          ctx.configForms.whileServed([NS], () =>
            ctx.slots.inject('settings.section', () =>
              ctx.slots.register(
                {
                  name: 'settings.section',
                  id: NS,
                  order: 11,
                  label: () => t('nav'),
                  inject: injected,
                },
                ModelTidyPanel,
              ),
            ),
          ),
        'model-tidy: settings section',
      )
    }

    //#endregion

    exports.apply = apply
    exports.inject = inject
    exports.name = name
    return module.exports
  },
})
