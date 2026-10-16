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
    /** Where the star button points. Kept in one place so it cannot drift. */
    const REPO_URL = 'https://github.com/star-Cosmo/dsh-model-tidy'
    /** Coalescing window for alias edits, in ms. */
    const WRITE_DEBOUNCE_MS = 350

    //#region locales
    const zh = {
      nav: '模型整理',
      aliasDialogTitle: '修改备注名',
      aliasDialogSub: '这个名称只用于模型选择器里的显示，不会改动模型本身。留空即恢复原名。',
      aliasDialogPlaceholder: '例如：DS 快',
      aliasDialogSave: '保存',
      aliasDialogCancel: '取消',
      aliasDialogClear: '清除备注',
      aliasSet: '设置备注',
      starCta: '觉得好用？点个 Star',
      starTitle: '在 GitHub 上为本项目点一个 Star',
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
      showAll: '全部显示',
      hideAll: '全部隐藏',
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
      aliasDialogTitle: 'Rename model',
      aliasDialogSub: 'This name is only used in the model selector; the model itself is unchanged. Leave it blank to restore the original.',
      aliasDialogPlaceholder: 'e.g. DS Fast',
      aliasDialogSave: 'Save',
      aliasDialogCancel: 'Cancel',
      aliasDialogClear: 'Clear alias',
      aliasSet: 'Set alias',
      starCta: 'Enjoying it? Star it',
      starTitle: 'Star this project on GitHub',
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
      showAll: 'Show all',
      hideAll: 'Hide all',
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
/* Built on the harness's own design tokens (--dsw-*), not fixed colours: the
   section then follows the active theme — light, dark, or any skin — instead
   of guessing grey values that only look right in one of them. */
.dsh-mt { display: flex; flex-direction: column; gap: 16px; }
.dsh-mt-loading, .dsh-mt-empty { padding: 20px 4px; font-size: 13px; color: var(--dsw-alias-label-tertiary); }
.dsh-mt-error { padding: 20px 4px; font-size: 13px; color: var(--dsw-alias-state-error-primary); }
.dsh-mt-subtitle {
  margin: 0; max-width: 64ch; font-size: 13px; line-height: 1.6;
  color: var(--dsw-alias-label-secondary);
}
/* Heading row: the description on the left, the star nudge on the right. The
   button is deliberately quiet — it must not compete with the switches and
   alias buttons that are the actual work on this page. */
.dsh-mt-head-row {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 16px; flex-wrap: wrap;
}
.dsh-mt-head-row .dsh-mt-subtitle { flex: 1 1 320px; min-width: 0; }
.dsh-mt-star {
  display: inline-flex; align-items: center; gap: 7px; flex-shrink: 0;
  height: 34px; padding: 0 15px; font-size: 12.5px; cursor: pointer;
  border-radius: 999px; text-decoration: none; white-space: nowrap;
  border: 1px solid var(--dsw-alias-border-l3);
  background: transparent; color: var(--dsw-alias-label-secondary);
}
.dsh-mt-star:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.dsh-mt-star svg { width: 15px; height: 15px; display: block; flex-shrink: 0; }
.dsh-mt-toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.dsh-mt-search {
  flex: 1 1 220px; min-width: 160px; height: 38px; padding: 0 14px;
  font-size: 13px; border-radius: var(--dsw-radius-lg, 10px);
  border: 1px solid var(--dsw-alias-border-l3);
  background: transparent; color: var(--dsw-alias-label-primary); outline: none;
}
.dsh-mt-search:focus { border-color: var(--dsw-focus-ring-color); }
.dsh-mt-search::placeholder { color: var(--dsw-alias-label-tertiary); }
.dsh-mt-chip {
  height: 36px; padding: 0 16px; font-size: 13px; cursor: pointer;
  border-radius: 999px; border: 1px solid var(--dsw-alias-border-l3);
  background: transparent; color: var(--dsw-alias-label-primary);
  max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dsh-mt-chip:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-mt-chip.is-active {
  border-color: var(--dsw-alias-state-business-primary);
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-state-business-primary); font-weight: 600;
}
.dsh-mt-summary {
  display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
  font-size: 12.5px; color: var(--dsw-alias-label-tertiary);
}
.dsh-mt-dot { opacity: .55; }
.dsh-mt-saving { color: var(--dsw-alias-label-secondary); }
.dsh-mt-error-inline { color: var(--dsw-alias-state-error-primary); }
.dsh-mt-card {
  padding: 4px 18px 6px;
  border: 1px solid var(--dsw-alias-settings-card-stroke);
  background: var(--dsw-alias-settings-card-fill);
  border-radius: var(--dsw-radius-xl, 16px);
}
.dsh-mt-prov-head {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 12px 0 10px;
}
.dsh-mt-prov-name { font-size: 14px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.dsh-mt-prov-count { margin-left: 8px; font-size: 12px; font-weight: 400; color: var(--dsw-alias-label-tertiary); }
.dsh-mt-prov-btns { display: flex; gap: 8px; flex-shrink: 0; }
.dsh-mt-mini {
  height: 28px; padding: 0 12px; font-size: 12.5px; cursor: pointer;
  border-radius: 999px; border: 1px solid var(--dsw-alias-border-l3);
  background: transparent; color: var(--dsw-alias-label-secondary);
}
.dsh-mt-mini:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dsh-mt-mini:disabled { opacity: .35; cursor: not-allowed; }
.dsh-mt-row {
  display: grid; grid-template-columns: 40px minmax(120px, 1fr) auto;
  gap: 12px; align-items: center; min-height: 48px;
  border-top: 1px solid var(--dsw-alias-border-l2);
}
.dsh-mt-row.is-hidden .dsh-mt-name { text-decoration: line-through; color: var(--dsw-alias-label-tertiary); }
.dsh-mt-head {
  min-height: 28px; font-size: 12px; border-top: none;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-tertiary);
}
.dsh-mt-head:hover { background: transparent; }
.dsh-mt-col-show { display: flex; justify-content: center; }
.dsh-mt-col-show input { width: 16px; height: 16px; cursor: pointer; accent-color: var(--dsw-alias-button-primary-fill); }
.dsh-mt-col-model { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.dsh-mt-name {
  font-size: 13.5px; color: var(--dsw-alias-label-primary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dsh-mt-meta {
  font-size: 11.5px; color: var(--dsw-alias-label-tertiary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dsh-mt-col-alias { display: flex; justify-content: flex-end; }
.dsh-mt-alias-button {
  height: 28px; max-width: 200px; padding: 0 12px; font-size: 12.5px;
  cursor: pointer; border-radius: 999px; text-align: left;
  border: 1px solid var(--dsw-alias-border-l3);
  background: transparent; color: var(--dsw-alias-label-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dsh-mt-alias-button:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dsh-mt-alias-button.is-set {
  border-color: var(--dsw-alias-state-success-primary);
  color: var(--dsw-alias-state-success-primary);
}
.dsh-mt-actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.dsh-mt-button {
  height: 36px; padding: 0 16px; font-size: 13px; cursor: pointer;
  border-radius: var(--dsw-radius-lg, 10px);
  border: 1px solid var(--dsw-alias-border-l3);
  background: transparent; color: var(--dsw-alias-label-primary);
}
.dsh-mt-button:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-mt-button:disabled { opacity: .38; cursor: not-allowed; }
.dsh-mt-danger:hover:not(:disabled) {
  border-color: var(--dsw-alias-state-error-primary);
  background: var(--dsw-alias-interactive-bg-hover-danger);
  color: var(--dsw-alias-state-error-primary);
}
.dsh-mt-grow { margin-left: auto; }
.dsh-mt-tip {
  padding: 12px 14px; font-size: 12.5px; line-height: 1.6;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-lg, 10px);
  color: var(--dsw-alias-label-tertiary);
}
.dsh-mt-tip strong { display: block; margin-bottom: 4px; color: var(--dsw-alias-label-secondary); }
.dsh-mt-tip p { margin: 0; }

/* Alias dialog. The settings shell exposes no portal to third-party sections,
   so this is plugin-owned DOM mounted on body — but it borrows the host's
   tokens and layer colours, so it reads as part of the same surface. */
.dsh-mt-overlay {
  position: fixed; inset: 0; z-index: 2147483000;
  display: flex; align-items: center; justify-content: center;
  padding: 24px; background: rgba(0,0,0,.42);
}
.dsh-mt-dialog {
  display: flex; flex-direction: column; gap: 14px;
  width: min(460px, 100%); padding: 22px 24px 18px;
  border-radius: var(--dsw-radius-xl, 16px);
  border: 1px solid var(--dsw-alias-border-l3);
  background: var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-module-platform));
  color: var(--dsw-alias-label-primary);
  box-shadow: 0 18px 48px rgba(0,0,0,.34);
}
.dsh-mt-dialog-title { margin: 0; font-size: 15px; font-weight: 600; }
.dsh-mt-dialog-sub { margin: 0; font-size: 12.5px; line-height: 1.55; color: var(--dsw-alias-label-tertiary); }
.dsh-mt-dialog-sub code {
  padding: 1px 5px; border-radius: 4px; font-size: 12px;
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
}
.dsh-mt-dialog-input {
  width: 100%; height: 38px; padding: 0 13px; font-size: 13px;
  border-radius: var(--dsw-radius-lg, 10px);
  border: 1px solid var(--dsw-alias-border-l3);
  background: transparent; color: var(--dsw-alias-label-primary); outline: none;
}
.dsh-mt-dialog-input:focus { border-color: var(--dsw-focus-ring-color); }
.dsh-mt-dialog-btns { display: flex; gap: 10px; justify-content: flex-end; }
.dsh-mt-dialog-primary {
  height: 36px; padding: 0 18px; font-size: 13px; cursor: pointer;
  border-radius: var(--dsw-radius-lg, 10px); border: none;
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
}
.dsh-mt-dialog-primary:hover { background: var(--dsw-alias-button-primary-hover); }
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

      /**
       * Show or hide every model at once.
       *
       * Deliberately ignores any active search or provider chip: those narrow
       * what you are looking at, not what you are acting on. Honouring a filter
       * here would let "show all" leave hidden models behind, invisible because
       * the filter that hid them is still on.
       */
      setAllHidden(nextHidden) {
        if (!this.store?.rows) return
        this.apply(this.store.rows.map(row => Object.assign({}, row, { hidden: nextHidden })))
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

    /** Rows matching the search box and the provider chip. */
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

    /**
     * The alias editor.
     *
     * Own DOM mounted on document.body rather than inside the section: the
     * settings shell renders sections in flow, so an in-place panel would be
     * clipped by the surrounding scroll container. Mounting on body also keeps
     * the dialog clear of the rows behind it, which is the whole point of not
     * putting a text field in every row.
     *
     * Escape and a click on the backdrop both cancel; the field takes focus on
     * open so the common case is "type, Enter".
     */
    function AliasDialog(props) {
      const { t, row, onSave, onClose } = props
      const initial = row.alias
      const [draft, setDraft] = useState(initial)
      const inputRef = useRef(null)
      const host = globalThis.document

      useEffect(() => {
        const timer = globalThis.setTimeout(() => inputRef.current?.focus(), 0)
        const onKey = event => {
          if (event.key === 'Escape') onClose()
        }
        host?.addEventListener('keydown', onKey)
        return () => {
          globalThis.clearTimeout(timer)
          host?.removeEventListener('keydown', onKey)
        }
      }, [onClose, host])

      const commit = () => {
        onSave(draft)
        onClose()
      }

      const dialog = h(
        'div',
        {
          className: 'dsh-mt-dialog',
          role: 'dialog',
          'aria-modal': 'true',
          'aria-label': t('aliasDialogTitle'),
          onClick: event => event.stopPropagation(),
        },
        h('h3', { className: 'dsh-mt-dialog-title' }, t('aliasDialogTitle')),
        h(
          'p',
          { className: 'dsh-mt-dialog-sub' },
          row.name,
          row.model === row.name ? null : h('code', null, row.provider + '/' + row.model),
          ' — ' + t('aliasDialogSub'),
        ),
        h('input', {
          ref: inputRef,
          className: 'dsh-mt-dialog-input',
          type: 'text',
          value: draft,
          placeholder: t('aliasDialogPlaceholder'),
          onChange: event => setDraft(event.target.value),
          onKeyDown: event => {
            if (event.key === 'Enter') commit()
          },
        }),
        h(
          'div',
          { className: 'dsh-mt-dialog-btns' },
          draft === '' && initial !== ''
            ? h(
                'button',
                { type: 'button', className: 'dsh-mt-button', onClick: () => { onSave(''); onClose() } },
                t('aliasDialogClear'),
              )
            : null,
          h('button', { type: 'button', className: 'dsh-mt-button', onClick: onClose }, t('aliasDialogCancel')),
          h('button', { type: 'button', className: 'dsh-mt-dialog-primary', onClick: commit }, t('aliasDialogSave')),
        ),
      )

      // Rendered through a portal when React offers one, so the dialog escapes
      // any transformed or clipped ancestor; otherwise mounted inline, which
      // the fixed positioning still places correctly.
      if (typeof react.createPortal === 'function' && host?.body) {
        return react.createPortal(h('div', { className: 'dsh-mt-overlay', onClick: onClose }, dialog), host.body)
      }
      return h('div', { className: 'dsh-mt-overlay', onClick: onClose }, dialog)
    }

    function ModelTidyPanel(props) {
      const { controller, t } = props
      const state = useSyncExternalStore(
        useCallback(cb => controller.subscribe(cb), [controller]),
        useCallback(() => controller.store, [controller]),
      )
      const [query, setQuery] = useState('')
      const [provider, setProvider] = useState(ALL_PROVIDERS)
      const [editing, setEditing] = useState(null)
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
      const everyHidden = state.rows.length > 0 && state.rows.every(row => row.hidden)
      const multiProvider = state.providers.length > 1

      // With one provider there is nothing to filter between, so the chips and
      // the per-provider heading are noise: a group of one is a label.
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
        multiProvider
          ? h(
              'button',
              {
                type: 'button',
                className: provider === ALL_PROVIDERS ? 'dsh-mt-chip is-active' : 'dsh-mt-chip',
                onClick: () => setProvider(ALL_PROVIDERS),
              },
              t('providerAll'),
            )
          : null,
        multiProvider
          ? state.providers.map(name =>
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
            )
          : null,
      )

      const actions = h(
        'div',
        { className: 'dsh-mt-actions' },
        h(
          'button',
          {
            type: 'button',
            className: 'dsh-mt-button',
            disabled: busy || state.rows.length === 0 || state.hiddenCount === 0,
            onClick: () => controller.setAllHidden(false),
          },
          t('showAll'),
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'dsh-mt-button',
            disabled: busy || state.rows.length === 0 || everyHidden,
            onClick: () => controller.setAllHidden(true),
          },
          t('hideAll'),
        ),
        h('span', { className: 'dsh-mt-grow' }),
        h(
          'button',
          {
            type: 'button',
            className: 'dsh-mt-button',
            disabled: busy || state.aliasCount === 0,
            onClick: () => controller.clearAliases(),
          },
          t('clearAliases'),
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'dsh-mt-button dsh-mt-danger',
            disabled: busy || (state.hiddenCount === 0 && state.aliasCount === 0),
            onClick: () => {
              const scope = globalThis
              if (typeof scope.confirm === 'function' && scope.confirm(t('confirmReset')) === false) return
              controller.resetAll()
            },
          },
          t('resetAll'),
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

      // The star nudge. A real anchor with `target="_blank"`, not a click
      // handler: the harness's own link policy then applies, middle-click and
      // "copy link" work as the user expects, and nothing here needs to know
      // how the desktop shell routes external URLs.
      const starButton = h(
        'a',
        {
          className: 'dsh-mt-star',
          href: REPO_URL,
          target: '_blank',
          rel: 'noreferrer noopener',
          title: t('starTitle'),
        },
        h(
          'svg',
          { viewBox: '0 0 16 16', fill: 'currentColor', 'aria-hidden': 'true' },
          h('path', {
            d: 'M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z',
          }),
        ),
        h('span', null, t('starCta')),
      )

      const rowOf = row =>
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
            h(
              'button',
              {
                type: 'button',
                className: row.alias.trim() === '' ? 'dsh-mt-alias-button' : 'dsh-mt-alias-button is-set',
                title: t('colAlias'),
                onClick: () => setEditing(row),
              },
              row.alias.trim() === '' ? t('aliasSet') : row.alias,
            ),
          ),
        )

      const groups = state.providers
        .map(name => ({ name, own: state.rows.filter(row => row.provider === name) }))
        .filter(group => group.own.length > 0)

      const cards = multiProvider
        ? groups
            .map(group => ({ ...group, shown: group.own.filter(row => rows.includes(row)) }))
            .filter(group => group.shown.length > 0)
            .map(group => {
              const allHidden = group.own.every(row => row.hidden)
              return h(
                'div',
                { key: group.name, className: 'dsh-mt-card' },
                h(
                  'div',
                  { className: 'dsh-mt-prov-head' },
                  h(
                    'div',
                    null,
                    h('span', { className: 'dsh-mt-prov-name' }, group.name),
                    h('span', { className: 'dsh-mt-prov-count' }, String(group.own.length)),
                  ),
                  h(
                    'div',
                    { className: 'dsh-mt-prov-btns' },
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'dsh-mt-mini',
                        disabled: busy || !allHidden,
                        onClick: () => controller.toggleProvider(group.name, false),
                      },
                      t('showProvider'),
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'dsh-mt-mini',
                        disabled: busy || allHidden,
                        onClick: () => controller.toggleProvider(group.name, true),
                      },
                      t('hideProvider'),
                    ),
                  ),
                ),
                head,
                group.shown.map(rowOf),
              )
            })
        : h('div', { className: 'dsh-mt-card' }, head, rows.map(rowOf))

      return h(
        'div',
        { className: 'dsh-mt' },
        h(
          'div',
          { className: 'dsh-mt-head-row' },
          h('p', { className: 'dsh-mt-subtitle' }, t('subtitle')),
          starButton,
        ),
        toolbar,
        actions,
        summary,
        rows.length === 0 ? h('div', { className: 'dsh-mt-empty' }, t('empty')) : cards,
        h(
          'div',
          { className: 'dsh-mt-tip' },
          h('strong', null, t('tipTitle')),
          h('p', null, t('tipBody')),
        ),
        editing === null
          ? null
          : h(AliasDialog, {
              key: editing.key,
              t,
              row: editing,
              onSave: alias => {
                controller.setAlias(editing.key, alias)
                void controller.flush()
              },
              onClose: () => setEditing(null),
            }),
      )
    }

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
