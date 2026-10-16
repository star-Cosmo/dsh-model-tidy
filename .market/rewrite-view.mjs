import fs from 'node:fs'

const file = 'lib/client.js'
let source = fs.readFileSync(file, 'utf8')

const startMarker = '    //#region view'
const endMarker = '    //#region apply'
const start = source.indexOf(startMarker)
const end = source.indexOf(endMarker)
if (start === -1 || end === -1) {
  console.error('rewrite-view: markers not found')
  process.exit(1)
}

const VIEW = `    //#region view
    const h = react.createElement

    /**
     * The on/off control one row carries.
     *
     * A button with \`role="switch"\` rather than a checkbox: it is the shape the
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

`

source = source.slice(0, start) + VIEW + source.slice(end)
fs.writeFileSync(file, source, 'utf8')
console.log('rewrite-view: view rebuilt on the reference layout')
