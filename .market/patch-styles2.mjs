import fs from 'node:fs'

const file = 'lib/client.js'
const TICK = String.fromCharCode(96)

let lines = fs.readFileSync(file, 'utf8').split('\n')

// Locate the STYLES assignment line, then the next line that is only a tick.
const startLine = lines.findIndex(l => l.startsWith('    const STYLES = ' + TICK))
if (startLine === -1) {
  console.error('patch-styles2: STYLES start not found')
  process.exit(1)
}
let endLine = -1
for (let i = startLine + 1; i < lines.length; i++) {
  if (lines[i].trim() === TICK) {
    endLine = i
    break
  }
}
if (endLine === -1) {
  console.error('patch-styles2: STYLES end not found')
  process.exit(1)
}

// How much content follows the tick on the same line? The reference format puts
// the tick alone, but be safe and keep whatever trails it.
const trailing = lines[endLine].slice(1)
console.log(`STYLES spans lines ${startLine + 1}..${endLine + 1}; trailing after tick: ${JSON.stringify(trailing)}`)

const STYLES = `    const STYLES = ${TICK}
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
${TICK}${trailing}`

const out = [...lines.slice(0, startLine), ...STYLES.split('\n'), ...lines.slice(endLine + 1)]
fs.writeFileSync(file, out.join('\n'), 'utf8')
console.log('patch-styles2: stylesheet replaced')
