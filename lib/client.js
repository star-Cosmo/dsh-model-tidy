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
    const { useState, useEffect, useCallback, useRef, useSyncExternalStore } = react

    /** Namespace shared with the host half; the settings section id. */
    const NS = 'model-tidy'
    const STYLE_ID = 'dsh-model-tidy-styles'
    /** Synthetic provider id standing for "every provider". */
    const ALL_PROVIDERS = '*'
    /** Where the star button points. Kept in one place so it cannot drift. */
    const REPO_URL = 'https://github.com/star-Cosmo/dsh-model-tidy'
    /** Coalescing window for alias edits, in ms. */
    const WRITE_DEBOUNCE_MS = 350
    /**
     * The separator providers use to append billing facts to a display name.
     *
     * A middle dot with spaces, chosen by the vendor because model names
     * themselves contain hyphens (`GLM-5.3-Flash`). This must match the host
     * half's constant: the two halves are separate module systems and cannot
     * share a value.
     */
    const RATE_SEPARATOR = ' · '

    /**
     * Split a display name into its bare name and the vendor's trailing text.
     *
     * Providers join several trailing facts — rate, promo badges — with the same
     * separator, so the first occurrence is the boundary and everything after it
     * is suffix.
     */
    function splitSuffix(name) {
      const text = String(name ?? '')
      const at = text.indexOf(RATE_SEPARATOR)
      return at === -1
        ? { bare: text, suffix: '' }
        : { bare: text.slice(0, at), suffix: text.slice(at + RATE_SEPARATOR.length) }
    }

    //#region locales
    const zh = {
      nav: '模型整理',
      aliasDialogTitle: '修改备注名',
      aliasDialogSub: '这个名称只用于模型选择器里的显示，不会改动模型本身。留空即恢复原名。',
      aliasDialogPlaceholder: '例如：DS 快',
      aliasDialogSave: '保存',
      aliasDialogCancel: '取消',
      aliasDialogClear: '清除备注',
      showAllProviders: '全部显示',
      hideAllProviders: '全部隐藏',
      visibleCount: '已显示 {visible} / {total}',
      providerRow: '{visible}/{total}',
      retry: '重试',
      emptyCatalog: '模型目录是空的。',
      noMatch: '没有匹配的模型。',
      allHiddenWarning: '所有模型都已隐藏，模型选择器里将没有可选模型。',
      aliasEdit: '改备注',
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
      showAllProviders: 'Show all',
      hideAllProviders: 'Hide all',
      visibleCount: '{visible} of {total} shown',
      providerRow: '{visible}/{total}',
      retry: 'Retry',
      emptyCatalog: 'The model catalogue is empty.',
      noMatch: 'No matching models.',
      allHiddenWarning: 'Every model is hidden, so the model selector has nothing to offer.',
      aliasEdit: 'Edit alias',
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
/* Built on the harness's own design tokens (--dsw-*), so the section follows
   the active theme rather than guessing at grey values. The layout mirrors the
   reference plugin: one card per provider, one switch per model. */
.dsh-mt { display: flex; flex-direction: column; gap: 16px; }
.dsh-mt-note { padding: 16px 4px; font-size: 13px; color: var(--dsw-alias-label-tertiary); }
.dsh-mt-error { padding: 16px 4px; font-size: 13px; color: var(--dsw-alias-state-error-primary); }
.dsh-mt-warn { font-size: 12.5px; color: var(--dsw-alias-state-warn-label, #c77700); }
.dsh-mt-head-row {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 16px; flex-wrap: wrap;
}
.dsh-mt-subtitle {
  flex: 1 1 320px; min-width: 0; margin: 0;
  font-size: 13px; line-height: 1.6; color: var(--dsw-alias-label-secondary);
}
.dsh-mt-star {
  display: inline-flex; align-items: center; gap: 7px; flex-shrink: 0;
  height: 34px; padding: 0 15px; font-size: 12.5px; cursor: pointer;
  border-radius: 999px; text-decoration: none; white-space: nowrap;
  border: 1px solid var(--dsw-alias-border-l3);
  background: transparent; color: var(--dsw-alias-label-secondary);
}
.dsh-mt-star:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dsh-mt-star svg { width: 15px; height: 15px; display: block; flex-shrink: 0; }
.dsh-mt-controls { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.dsh-mt-search {
  flex: 1 1 220px; min-width: 160px; height: 38px; padding: 0 14px;
  font-size: 13px; border-radius: var(--dsw-radius-lg, 10px);
  border: 1px solid var(--dsw-alias-border-l3);
  background: transparent; color: var(--dsw-alias-label-primary); outline: none;
}
.dsh-mt-search:focus { border-color: var(--dsw-focus-ring-color); }
.dsh-mt-search::placeholder { color: var(--dsw-alias-label-tertiary); }
.dsh-mt-pill {
  height: 36px; padding: 0 16px; font-size: 13px; cursor: pointer;
  border-radius: 999px; border: 1px solid var(--dsw-alias-border-l3);
  background: transparent; color: var(--dsw-alias-label-primary);
}
.dsh-mt-pill:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-mt-pill:disabled { opacity: .4; cursor: not-allowed; }
.dsh-mt-count { margin-left: auto; font-size: 12.5px; color: var(--dsw-alias-label-tertiary); }
.dsh-mt-card {
  padding: 6px 18px 8px;
  border: 1px solid var(--dsw-alias-settings-card-stroke);
  background: var(--dsw-alias-settings-card-fill);
  border-radius: var(--dsw-radius-xl, 16px);
}
.dsh-mt-prov-head {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 12px 0 10px;
}
.dsh-mt-prov-name { font-size: 15px; font-weight: 650; color: var(--dsw-alias-label-primary); }
.dsh-mt-prov-count { margin-left: 10px; font-size: 12px; font-weight: 400; color: var(--dsw-alias-label-tertiary); }
.dsh-mt-prov-btns { display: flex; gap: 8px; flex-shrink: 0; }
.dsh-mt-mini {
  height: 30px; padding: 0 13px; font-size: 12.5px; cursor: pointer;
  border-radius: 999px; border: 1px solid var(--dsw-alias-border-l3);
  background: transparent; color: var(--dsw-alias-label-secondary);
  white-space: nowrap;
}
.dsh-mt-mini:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dsh-mt-mini:disabled { opacity: .4; cursor: not-allowed; }
.dsh-mt-mini.is-set { border-color: var(--dsw-alias-state-success-primary); color: var(--dsw-alias-state-success-primary); }
.dsh-mt-row {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  min-height: 46px; border-top: 1px solid var(--dsw-alias-border-l2);
}
.dsh-mt-row.is-hidden .dsh-mt-name { text-decoration: line-through; color: var(--dsw-alias-label-tertiary); }
.dsh-mt-name {
  display: flex; align-items: baseline; gap: 8px; min-width: 0;
  font-size: 14px; color: var(--dsw-alias-label-primary);
}
.dsh-mt-name > :first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-mt-id { flex-shrink: 0; padding-right: 6px; font-size: 12px; color: var(--dsw-alias-label-tertiary); }
.dsh-mt-row-actions { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
/* Switch: the same control the reference plugin renders — a track with a
   travelling thumb, driven by aria-checked. */
.dsh-mt-switch {
  position: relative; flex-shrink: 0;
  width: 40px; height: 22px; padding: 0; cursor: pointer;
  border-radius: 999px; border: 1px solid var(--dsw-alias-border-l3);
  background: var(--dsw-alias-interactive-bg-hover);
  transition: background .15s ease, border-color .15s ease;
}
.dsh-mt-switch:disabled { opacity: .4; cursor: not-allowed; }
.dsh-mt-switch.is-on {
  border-color: var(--dsw-alias-button-primary-fill);
  background: var(--dsw-alias-button-primary-fill);
}
.dsh-mt-switch-thumb {
  position: absolute; top: 50%; left: 2px; transform: translateY(-50%);
  width: 16px; height: 16px; border-radius: 50%;
  background: var(--dsw-alias-bg-layer-1, #fff);
  transition: left .15s ease;
}
.dsh-mt-switch.is-on .dsh-mt-switch-thumb { left: 20px; }
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
.dsh-mt-tip {
  padding: 12px 14px; font-size: 12.5px; line-height: 1.6;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-lg, 10px);
  color: var(--dsw-alias-label-tertiary);
}
.dsh-mt-tip strong { display: block; margin-bottom: 4px; color: var(--dsw-alias-label-secondary); }
.dsh-mt-tip p { margin: 0; }
/* Alias dialog. The settings shell exposes no portal to third-party sections,
   so this is plugin-owned DOM mounted on body — borrowing the host's tokens. */
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

    /**
     * Inject the stylesheet once, into the document the section renders in.
     *
     * Idempotent on purpose: a re-mount, a second instance or React's
     * double-invoked effects all land on the same `STYLE_ID`, so the check is
     * what keeps a duplicate sheet from being appended.
     */
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
     *   - **`hidden` is the state.** Every operation reads it fresh from
     *     `form.getSnapshot()`, computes the next list, and writes that list.
     *     Nothing is derived from a local cache of rows.
     *   - **The catalogue is presentation.** It is read to render rows, and
     *     re-read after each write because the host filters it; a hidden model
     *     is simply absent, and its row is rebuilt from the `hidden` entry,
     *     which carries the display name it had when it was hidden.
     *   - **One field per write where possible.** `hidden` and `renamed` are
     *     separate fields; a visibility edit touches only `hidden`, so there is
     *     no window in which half an edit is visible to a reader.
     */
    class ModelTidyController {
      constructor(form, readCatalog) {
        this.form = form
        this.readCatalog = readCatalog
        this.listeners = new Set()
        /** Catalogue as last read, already filtered by `hidden`. */
        this.catalog = null
        this.loadError = ''
        this.phase = 'loading'
        this.generation = 0
        this.disposed = false
        this.unsubscribeForm = undefined
        /**
         * Where each row was first seen, so hiding a model does not move it.
         *
         * Keyed by `provider\0model`, valued by the sequence number within its
         * provider. Entries are never removed while the section is mounted: a
         * model that leaves the catalogue and comes back keeps its slot, which
         * is the behaviour a reader expects from a list they are editing.
         */
        this.order = new Map()
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
       * catalogue.
       *
       * A hidden model is absent from the catalogue — the host filters it — so
       * its row can only be rebuilt from its saved entry. Doing that by
       * appending, as an earlier version did, moved the row to the end of its
       * group the moment it was hidden: hide the third of five models and it
       * reappears fifth. The row's *position* is part of what the user is
       * looking at, so it is remembered here.
       *
       * `this.order` maps a row key to the sequence number it was first seen
       * with, per group. A row rebuilt from the document takes its remembered
       * number back and sorts into place; a model the catalogue has never
       * advertised before gets the next free number, i.e. lands at the end,
       * which is where a newly added model belongs.
       */
      recompute() {
        const hidden = this.hiddenEntries()
        const aliases = new Map(
          this.renamedEntries().map(entry => [`${entry.provider}\u0000${entry.model}`, String(entry.alias ?? '')]),
        )
        const hiddenByKey = new Map(hidden.map(entry => [`${entry.provider}\u0000${entry.model}`, entry]))

        if (this.order === null || this.order === undefined) this.order = new Map()
        /** Claim the next slot in a group, or take back the remembered one. */
        const slotOf = (provider, key) => {
          const remembered = this.order.get(key)
          if (remembered !== undefined) return remembered
          let next = 0
          for (const [other, seq] of this.order) {
            if (other.startsWith(`${provider}\u0000`) && seq >= next) next = seq + 1
          }
          this.order.set(key, next)
          return next
        }

        const groups = []
        const seen = new Set()
        for (const group of this.catalog ?? []) {
          const rows = []
          for (const model of group.models) {
            const key = `${group.id}\u0000${model.id}`
            seen.add(key)
            rows.push({
              key,
              provider: group.id,
              model: model.id,
              name: model.name,
              alias: aliases.get(key) ?? '',
              hidden: hiddenByKey.has(key),
              stale: false,
              seq: slotOf(group.id, key),
            })
          }
          groups.push({ id: group.id, name: group.name, rows })
        }

        // Rows that exist only because they are hidden or renamed: the model
        // stopped being advertised, but the decision about it must survive —
        // and so must its place in the list.
        for (const [key, entry] of hiddenByKey) {
          if (seen.has(key)) continue
          const [provider, model] = key.split('\u0000')
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
            seq: slotOf(provider, key),
          })
        }
        for (const [key] of aliases) {
          if (seen.has(key) || hiddenByKey.has(key)) continue
          const [provider, model] = key.split('\u0000')
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
            seq: slotOf(provider, key),
          })
        }

        // Restore each row to the position it was first seen at. `seq` is
        // carried on the row and stripped before the state is published, so the
        // view never has to know about it.
        for (const group of groups) {
          group.rows.sort((a, b) => a.seq - b.seq)
          for (const row of group.rows) delete row.seq
          // Keep the catalogue's own model order as the tie-breaker for rows
          // that are present in it; `sort` is stable, so this holds already.
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
       * The vendor's trailing facts — billing rate and promo badges — ride in
       * `name`, and the host exposes no field for them, so a rename that
       * replaced the name outright would drop the rate. The suffix is captured
       * here, at the moment of the rename, and stored beside the alias; the
       * host half puts the two back together.
       *
       * Capturing rather than re-deriving matters: once the rename is applied
       * the catalogue name reads `alias · suffix`, so a later derivation would
       * see that whole tail as suffix and append it a second time.
       *
       * Only `renamed` is written, so a rename never disturbs the hidden list.
       */
      async setAlias(provider, model, alias) {
        const trimmed = String(alias ?? '').trim()
        const rest = this.renamedEntries().filter(
          entry => !(entry.provider === provider && entry.model === model),
        )
        let next = rest
        if (trimmed !== '') {
          const split = this.bareNameOf(provider, model)
          next = [
            ...rest,
            { provider, model, alias: trimmed, ...(split.suffix === '' ? {} : { suffix: split.suffix }) },
          ]
        }
        try {
          await this.form.set('renamed', next)
        } catch {
          /* the subscription recomputes from the document either way */
        }
        this.recompute()
      }

      /**
       * A model's current display name, split into its bare name and the
       * vendor's suffix.
       *
       * Prefers the live catalogue, which is where the vendor's suffix arrives;
       * falls back to the saved entry for a model the catalogue no longer
       * advertises.
       */
      bareNameOf(provider, model) {
        for (const group of this.catalog ?? []) {
          if (group.id !== provider) continue
          const found = group.models.find(entry => entry.id === model)
          if (found !== undefined) return splitSuffix(found.name)
        }
        const stored = this.renamedEntries().find(
          entry => entry.provider === provider && entry.model === model,
        )
        return { bare: String(stored?.alias ?? model), suffix: String(stored?.suffix ?? '') }
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

    //#endregion

    //#region view
    const h = react.createElement

    /**
     * The on/off control one row carries.
     *
     * A button with `role="switch"` rather than a checkbox: it is the shape the
     * reference implementation uses, it is what the harness's own primitives
     * render, and it reads correctly to assistive technology without a label
     * element to point at.
     */
    function Switch(props) {
      const { on, disabled, label, onChange } = props
      return h(
        'button',
        {
          type: 'button',
          role: 'switch',
          'aria-checked': on,
          'aria-label': label,
          disabled: disabled === true,
          className: on ? 'dsh-mt-switch is-on' : 'dsh-mt-switch',
          onClick: () => onChange(!on),
        },
        h('span', { className: 'dsh-mt-switch-thumb' }),
      )
    }

    /** Groups and rows matching the query. */
    function filterGroups(groups, query) {
      const needle = query.trim().toLowerCase()
      if (needle === '') return groups
      return groups
        .map(group => ({
          ...group,
          rows: group.rows.filter(
            row =>
              row.model.toLowerCase().includes(needle) ||
              row.name.toLowerCase().includes(needle) ||
              row.alias.toLowerCase().includes(needle) ||
              group.id.toLowerCase().includes(needle) ||
              group.name.toLowerCase().includes(needle),
          ),
        }))
        .filter(group => group.rows.length > 0)
    }

    /**
     * The alias editor.
     *
     * Own DOM mounted on body rather than inside the section: the settings shell
     * renders sections in flow, so an in-place panel would be clipped by the
     * surrounding scroll container.
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
          initial !== ''
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

      if (typeof react.createPortal === 'function' && host?.body) {
        return react.createPortal(h('div', { className: 'dsh-mt-overlay', onClick: onClose }, dialog), host.body)
      }
      return h('div', { className: 'dsh-mt-overlay', onClick: onClose }, dialog)
    }

    function ModelTidyPanel(props) {
      const { controller, t } = props
      const [query, setQuery] = useState('')
      const [editing, setEditing] = useState(null)
      const first = useRef(true)

      // Re-render whenever the controller publishes new state. The controller
      // owns its snapshot; this only mirrors it.
      const [, forceRender] = useState(0)
      useEffect(() => {
        return controller.subscribe(() => forceRender(n => n + 1))
      }, [controller])

      // Stylesheet after commit, not during render: appending to <head> is a
      // side effect, and React may discard or double-invoke a render-phase one.
      useEffect(() => {
        ensureStyles()
      }, [])

      useEffect(() => {
        if (first.current) {
          first.current = false
          void controller.load()
        }
      }, [controller])

      const state = controller.state ?? { phase: 'loading', groups: [], total: 0, visible: 0 }

      // The heading is rendered in every phase, so a slow or refused catalogue
      // still leaves a recognizable page with the star link on it.
      const heading = h(
        'div',
        { className: 'dsh-mt-head-row' },
        h('p', { className: 'dsh-mt-subtitle' }, t('subtitle')),
        h(
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
        ),
      )

      if (state.phase === 'loading') {
        return h('div', { className: 'dsh-mt' }, heading, h('div', { className: 'dsh-mt-note' }, t('loading')))
      }
      if (state.phase === 'error') {
        return h(
          'div',
          { className: 'dsh-mt' },
          heading,
          h('div', { className: 'dsh-mt-error' }, t('loadError').replace('{message}', state.error)),
          h(
            'div',
            null,
            h(
              'button',
              { type: 'button', className: 'dsh-mt-button', onClick: () => void controller.load() },
              t('retry'),
            ),
          ),
        )
      }

      const groups = filterGroups(state.groups, query)
      const writable = state.writable !== false
      const busy = false

      const controls = h(
        'div',
        { className: 'dsh-mt-controls' },
        h('input', {
          type: 'search',
          className: 'dsh-mt-search',
          value: query,
          placeholder: t('search'),
          'aria-label': t('search'),
          onChange: event => setQuery(event.target.value),
        }),
        h(
          'button',
          {
            type: 'button',
            className: 'dsh-mt-pill',
            disabled: !writable || state.visible === state.total,
            onClick: () => void controller.showAll(),
          },
          t('showAllProviders'),
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'dsh-mt-pill',
            disabled: !writable || state.visible === 0,
            onClick: () => void controller.hideAll(),
          },
          t('hideAllProviders'),
        ),
        h('span', { className: 'dsh-mt-count' }, t('visibleCount').replace('{visible}', String(state.visible)).replace('{total}', String(state.total))),
      )

      const cards = groups.map(group => {
        const groupVisible = group.rows.filter(row => !row.hidden).length
        return h(
          'div',
          { key: group.id, className: 'dsh-mt-card' },
          h(
            'div',
            { className: 'dsh-mt-prov-head' },
            h(
              'div',
              null,
              h('span', { className: 'dsh-mt-prov-name' }, group.name),
              h(
                'span',
                { className: 'dsh-mt-prov-count' },
                t('providerRow').replace('{visible}', String(groupVisible)).replace('{total}', String(group.rows.length)),
              ),
            ),
            h(
              'div',
              { className: 'dsh-mt-prov-btns' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-mt-mini',
                  disabled: !writable || groupVisible === 0,
                  onClick: () => void controller.toggleProvider(group.id, true),
                },
                t('hideProvider'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-mt-mini',
                  disabled: !writable || groupVisible === group.rows.length,
                  onClick: () => void controller.toggleProvider(group.id, false),
                },
                t('showProvider'),
              ),
            ),
          ),
          group.rows.map(row =>
            h(
              'div',
              { key: row.key, className: row.hidden ? 'dsh-mt-row is-hidden' : 'dsh-mt-row' },
              h(
                'span',
                { className: 'dsh-mt-name' },
                row.alias.trim() === '' ? row.name : row.alias,
                row.alias.trim() === '' && row.name !== row.model ? h('span', { className: 'dsh-mt-id' }, row.model) : null,
                row.alias.trim() !== '' ? h('span', { className: 'dsh-mt-id' }, row.name) : null,
                row.stale ? h('span', { className: 'dsh-mt-id' }, t('stale')) : null,
              ),
              h(
                'span',
                { className: 'dsh-mt-row-actions' },
                h(
                  'button',
                  {
                    type: 'button',
                    className: row.alias.trim() === '' ? 'dsh-mt-mini' : 'dsh-mt-mini is-set',
                    title: t('colAlias'),
                    disabled: !writable,
                    onClick: () => setEditing(row),
                  },
                  row.alias.trim() === '' ? t('aliasSet') : t('aliasEdit'),
                ),
                h(Switch, {
                  on: !row.hidden,
                  disabled: !writable,
                  label: row.name,
                  onChange: visible => void controller.toggle(row.provider, row.model, row.name, !visible),
                }),
              ),
            ),
          ),
        )
      })

      return h(
        'div',
        { className: 'dsh-mt' },
        heading,
        controls,
        state.total === 0 ? h('div', { className: 'dsh-mt-note' }, t('emptyCatalog')) : null,
        state.total > 0 && groups.length === 0 ? h('div', { className: 'dsh-mt-note' }, t('noMatch')) : null,
        state.total > 0 && state.visible === 0 ? h('div', { className: 'dsh-mt-warn' }, t('allHiddenWarning')) : null,
        cards,
        h(
          'div',
          { className: 'dsh-mt-actions' },
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-mt-button',
              disabled: !writable || state.aliasCount === 0,
              onClick: () => void controller.clearAliases(),
            },
            t('clearAliases'),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-mt-button dsh-mt-danger',
              disabled: !writable || (state.hiddenCount === 0 && state.aliasCount === 0),
              onClick: () => {
                const scope = globalThis
                if (typeof scope.confirm === 'function' && scope.confirm(t('confirmReset')) === false) return
                void controller.resetAll()
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
        editing === null
          ? null
          : h(AliasDialog, {
              key: editing.key,
              t,
              row: editing,
              onSave: alias => void controller.setAlias(editing.provider, editing.model, alias),
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
