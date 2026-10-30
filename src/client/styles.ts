/** Theme-aware styles for the server directory panel. */
export const STYLE_ID = 'dsh-server-directory-style-v1'

export const CSS = `
.dsd-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--dsw-alias-bg-layer-1, transparent);
  color: var(--dsw-alias-label-primary, inherit);
  font-size: 12.5px;
  line-height: 1.45;
  box-sizing: border-box;
  position: relative;
}
.dsd-root *, .dsd-root *::before, .dsd-root *::after { box-sizing: border-box; }
.dsd-root button, .dsd-root input, .dsd-root select { font: inherit; color: inherit; }
.dsd-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.18));
  flex: none;
  min-width: 0;
  background: var(--dsw-alias-bg-layer-1, transparent);
}
.dsd-server-picker {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 7px;
}
.dsd-select {
  min-width: 0;
  flex: 1;
  height: 28px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3));
  background: var(--dsw-alias-bg-base, transparent);
  border-radius: 7px;
  padding: 0 7px;
  outline: none;
}
.dsd-select:focus { border-color: var(--dsw-alias-brand-primary, #4d6bfe); }
.dsd-dot {
  width: 7px; height: 7px; border-radius: 50%; flex: none;
  background: var(--dsw-alias-label-tertiary, #888);
}
.dsd-dot.on { background: var(--dsw-alias-state-success-primary, #3d9a5f); }
.dsd-dot.err { background: var(--dsw-alias-state-error-primary, #d9534f); }
.dsd-icon-btn {
  appearance: none;
  border: 1px solid transparent;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #888);
  border-radius: 7px;
  width: 28px; height: 28px;
  display: inline-grid; place-items: center;
  padding: 0; cursor: pointer; flex: none;
}
.dsd-icon-btn:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12));
  color: var(--dsw-alias-label-primary, inherit);
}
.dsd-icon-btn:disabled { opacity: .4; cursor: not-allowed; }
.dsd-icon-btn.danger { color: var(--dsw-alias-state-error-primary, #d9534f); }
.dsd-icon-btn.active { background: var(--dsw-alias-interactive-bg-active, rgba(77,107,254,.15)); color: var(--dsw-alias-brand-primary, #4d6bfe); }
.dsd-btn {
  appearance: none;
  border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3));
  background: var(--dsw-alias-bg-layer-2, transparent);
  color: var(--dsw-alias-label-primary, inherit);
  border-radius: 7px;
  min-height: 28px;
  padding: 4px 10px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  white-space: nowrap;
}
.dsd-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12)); }
.dsd-btn:disabled { opacity: .45; cursor: not-allowed; }
.dsd-btn.primary {
  background: var(--dsw-alias-button-primary-fill, var(--dsw-alias-brand-primary, #4d6bfe));
  color: var(--dsw-alias-label-primary-inverted, #fff);
  border-color: transparent;
}
.dsd-btn.primary:hover:not(:disabled) { filter: brightness(1.06); background: var(--dsw-alias-button-primary-hover, var(--dsw-alias-brand-primary, #4d6bfe)); }
.dsd-btn.danger {
  color: var(--dsw-alias-state-error-primary, #d9534f);
  border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary, #d9534f) 45%, transparent);
}
.dsd-btn.subtle { border-color: transparent; background: transparent; }
.dsd-pathbar {
  display: flex; align-items: center; gap: 5px;
  padding: 6px 8px; flex: none; min-width: 0;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.18));
}
.dsd-crumbs {
  flex: 1; min-width: 0; display: flex; align-items: center; gap: 1px;
  overflow: hidden; white-space: nowrap;
  direction: ltr;
}
.dsd-crumb {
  border: 0; background: transparent; color: var(--dsw-alias-label-secondary, #888);
  padding: 3px 4px; border-radius: 5px; cursor: pointer;
  max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dsd-crumb:hover { color: var(--dsw-alias-label-primary, inherit); background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12)); }
.dsd-crumb.current { color: var(--dsw-alias-label-primary, inherit); font-weight: 600; }
.dsd-sep { color: var(--dsw-alias-label-tertiary, #888); opacity: .6; flex: none; }
.dsd-path-input {
  height: 26px; width: 100%; border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3));
  background: var(--dsw-alias-bg-base, transparent);
  padding: 0 7px; outline: none;
}
.dsd-manage-bar {
  display: flex; align-items: center; justify-content: flex-end; gap: 4px;
  padding: 5px 8px; border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.18));
  flex: none;
}
.dsd-list-wrap { flex: 1; min-height: 0; overflow: auto; position: relative; }
.dsd-list { display: flex; flex-direction: column; padding: 4px 5px 12px; min-height: 100%; }
.dsd-entry {
  display: flex; align-items: center; gap: 7px;
  min-height: 33px; padding: 4px 6px; border-radius: 6px;
  border: 1px solid transparent; cursor: default; position: relative;
  user-select: none;
}
.dsd-entry:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.1)); }
.dsd-entry.selected {
  background: var(--dsw-alias-interactive-bg-active, rgba(77,107,254,.14));
  border-color: color-mix(in srgb, var(--dsw-alias-brand-primary, #4d6bfe) 35%, transparent);
}
.dsd-entry.dragover {
  border-color: var(--dsw-alias-brand-primary, #4d6bfe);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, #4d6bfe) 13%, transparent);
}
.dsd-entry-icon { flex: none; display: inline-grid; place-items: center; width: 18px; color: var(--dsw-alias-label-secondary, #888); }
.dsd-entry.directory .dsd-entry-icon { color: var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary, #4d6bfe)); }
.dsd-entry-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.dsd-entry-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-primary, inherit); }
.dsd-entry.directory .dsd-entry-name { cursor: pointer; }
.dsd-entry-sub { font-size: 10.5px; color: var(--dsw-alias-label-tertiary, #888); display: flex; gap: 6px; overflow: hidden; white-space: nowrap; }
.dsd-entry-actions { display: flex; align-items: center; gap: 1px; opacity: 0; flex: none; transition: opacity .12s; }
.dsd-entry:hover .dsd-entry-actions, .dsd-entry.selected .dsd-entry-actions { opacity: 1; }
.dsd-entry-actions .dsd-icon-btn { width: 25px; height: 25px; }
.dsd-drop-root {
  outline: 1px dashed transparent;
  outline-offset: -4px;
}
.dsd-drop-root.dragover {
  outline-color: var(--dsw-alias-brand-primary, #4d6bfe);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, #4d6bfe) 6%, transparent);
}
.dsd-empty {
  flex: 1; min-height: 150px; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 9px;
  padding: 26px 18px; color: var(--dsw-alias-label-secondary, #888);
  text-align: center;
}
.dsd-empty-icon { opacity: .55; }
.dsd-empty-title { font-weight: 600; color: var(--dsw-alias-label-primary, inherit); }
.dsd-empty-desc { max-width: 260px; font-size: 11.5px; line-height: 1.55; }
.dsd-card {
  margin: 10px; padding: 13px; border-radius: 10px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3));
  background: var(--dsw-alias-bg-base, transparent);
}
.dsd-card-title { font-weight: 600; margin-bottom: 4px; }
.dsd-card-desc { color: var(--dsw-alias-label-secondary, #888); margin-bottom: 10px; font-size: 11.5px; line-height: 1.55; }
.dsd-card-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.dsd-footbar {
  flex: none; display: flex; align-items: center; gap: 6px;
  padding: 6px 9px; min-height: 27px;
  border-top: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.18));
  color: var(--dsw-alias-label-tertiary, #888); font-size: 10.5px;
  overflow: hidden;
}
.dsd-footbar .grow { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsd-error {
  flex: none; display: flex; gap: 6px; align-items: flex-start;
  padding: 7px 9px; margin: 0;
  color: var(--dsw-alias-state-error-primary, #d9534f);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #d9534f) 9%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary, #d9534f) 25%, transparent);
  font-size: 11.5px; white-space: pre-wrap;
}
.dsd-error .grow { flex: 1; min-width: 0; }
.dsd-notice {
  flex: none; padding: 6px 9px; font-size: 11.5px;
  color: var(--dsw-alias-state-success-primary, #3d9a5f);
  background: color-mix(in srgb, var(--dsw-alias-state-success-primary, #3d9a5f) 8%, transparent);
}
.dsd-uploads {
  flex: none; border-top: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.18));
  max-height: 130px; overflow: auto; padding: 5px 8px; display: flex; flex-direction: column; gap: 4px;
}
.dsd-upload-row { display: flex; align-items: center; gap: 6px; font-size: 10.5px; min-width: 0; }
.dsd-upload-row .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsd-upload-row .state { color: var(--dsw-alias-label-secondary, #888); flex: none; }
.dsd-upload-row .state.err { color: var(--dsw-alias-state-error-primary, #d9534f); }
.dsd-progress { height: 3px; border-radius: 2px; background: var(--dsw-alias-border-l1, rgba(127,127,127,.2)); overflow: hidden; width: 70px; flex: none; }
.dsd-progress > span { display: block; height: 100%; background: var(--dsw-alias-brand-primary, #4d6bfe); transition: width .15s; }
.dsd-spinner {
  width: 13px; height: 13px; border-radius: 50%;
  border: 2px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3));
  border-top-color: var(--dsw-alias-brand-primary, #4d6bfe);
  animation: dsd-spin .8s linear infinite; flex: none;
}
@keyframes dsd-spin { to { transform: rotate(360deg); } }
.dsd-banner {
  display: flex; align-items: center; gap: 8px; padding: 7px 9px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.18));
  color: var(--dsw-alias-label-secondary, #888); font-size: 11px; flex: none;
}
.dsd-banner .grow { flex: 1; min-width: 0; }
.dsd-modal-layer {
  position: absolute; inset: 0; z-index: 40;
  display: flex; align-items: stretch; justify-content: center;
  padding: 14px 10px;
  background: color-mix(in srgb, var(--dsw-alias-bg-base, #111) 30%, transparent);
  backdrop-filter: blur(2px);
  overflow: auto;
}
.dsd-modal {
  margin: auto; width: 100%; max-width: 380px;
  background: var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1, #1d1d22));
  color: var(--dsw-alias-label-primary, inherit);
  border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3));
  border-radius: 11px;
  box-shadow: 0 16px 42px color-mix(in srgb, #000 30%, transparent);
  display: flex; flex-direction: column; max-height: 100%;
}
.dsd-modal-head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.18)); }
.dsd-modal-title { font-weight: 600; flex: 1; min-width: 0; }
.dsd-modal-body { padding: 12px; overflow: auto; min-height: 0; }
.dsd-modal-foot { display: flex; align-items: center; justify-content: flex-end; gap: 6px; padding: 9px 12px; border-top: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.18)); flex-wrap: wrap; }
.dsd-field { display: block; margin-bottom: 9px; }
.dsd-label { display: block; font-size: 11px; font-weight: 600; color: var(--dsw-alias-label-secondary, #888); margin-bottom: 4px; }
.dsd-input {
  width: 100%; height: 30px; border-radius: 7px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3));
  background: var(--dsw-alias-bg-base, transparent);
  padding: 0 8px; outline: none;
}
.dsd-input:focus { border-color: var(--dsw-alias-brand-primary, #4d6bfe); box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary, #4d6bfe) 18%, transparent); }
.dsd-input:disabled { opacity: .6; }
.dsd-check { display: flex; align-items: flex-start; gap: 7px; padding: 5px 0; cursor: pointer; font-size: 11.5px; color: var(--dsw-alias-label-primary, inherit); }
.dsd-check input { margin-top: 2px; accent-color: var(--dsw-alias-brand-primary, #4d6bfe); }
.dsd-hint { color: var(--dsw-alias-label-tertiary, #888); font-size: 10.5px; line-height: 1.5; margin-top: 4px; }
.dsd-warn { color: var(--dsw-alias-state-warn-primary, #d89b2b); font-size: 10.5px; line-height: 1.5; margin-top: 4px; }
.dsd-server-list { display: flex; flex-direction: column; gap: 5px; }
.dsd-server-item {
  display: flex; align-items: center; gap: 7px;
  padding: 7px; border: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.2)); border-radius: 8px;
  min-width: 0;
}
.dsd-server-item.active { border-color: var(--dsw-alias-brand-primary, #4d6bfe); }
.dsd-server-item .main { flex: 1; min-width: 0; }
.dsd-server-item .name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsd-server-item .endpoint { color: var(--dsw-alias-label-tertiary, #888); font-size: 10.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsd-server-item .actions { display: flex; gap: 2px; flex: none; }
.dsd-ctx {
  position: fixed; z-index: 2147483000;
  min-width: 175px; max-width: 240px; padding: 4px;
  background: var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-layer-2, #222));
  border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3));
  border-radius: 8px;
  box-shadow: 0 12px 30px color-mix(in srgb, #000 28%, transparent);
}
.dsd-ctx button {
  display: flex; align-items: center; gap: 7px;
  width: 100%; text-align: left; border: 0; background: transparent;
  color: var(--dsw-alias-label-primary, inherit); border-radius: 5px;
  padding: 6px 8px; cursor: pointer; font-size: 11.5px;
}
.dsd-ctx button:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.14)); }
.dsd-ctx button.danger { color: var(--dsw-alias-state-error-primary, #d9534f); }
.dsd-ctx hr { border: 0; border-top: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.2)); margin: 3px 4px; }
.dsd-fingerprint {
  margin: 8px 0; padding: 8px; border-radius: 7px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3));
  background: var(--dsw-alias-bg-base, transparent);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 10.5px; word-break: break-all; line-height: 1.55;
}
.dsd-protocol-tag {
  font-size: 9.5px; font-weight: 600; letter-spacing: .02em;
  color: var(--dsw-alias-label-secondary, #888);
  border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3));
  border-radius: 4px; padding: 0 4px; flex: none;
}
.dsd-hidden-file-input { display: none; }
@media (max-width: 420px) {
  .dsd-entry-actions { opacity: 1; }
  .dsd-crumb { max-width: 80px; }
}
`
