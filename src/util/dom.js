// 軽量DOMヘルパ群。フレームワークは使わず、宣言的に要素を組み立てる。
// 認知心理学メモ:
//  - トースト/モーダルは「システム状態の可視化」(Nielsen #1) と「エラー予防」(#5) のための共通部品。
//  - role/aria を付与し、視覚以外でも状態が伝わるようにする(認知的アクセシビリティ)。

/** 要素ビルダ。props に class, style, dataset, onXxx, text, html, 任意属性を渡せる。 */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'dataset' && typeof v === 'object') Object.assign(node.dataset, v);
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, v);
  }
  append(node, children);
  return node;
}

/** 子要素(文字列/ノード/配列/null)を追加 */
export function append(parent, children) {
  const list = Array.isArray(children) ? children : [children];
  for (const c of list) {
    if (c == null || c === false) continue;
    parent.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return parent;
}

export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/** SVGアイコン(ストロークライン)。視覚的シグニファイア用。 */
export function icon(name, size = 18) {
  const paths = {
    data: '<path d="M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3Z"/><path d="M4 7v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    design: '<path d="M3 3h18v18H3z"/><path d="M3 9h18M9 3v18"/>',
    run: '<path d="M5 3l14 9-14 9V3z"/>',
    manage: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7M12 17h.01"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
    save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v6h7M8 21v-6h8v6"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
    text: '<path d="M4 6V4h16v2M9 20h6M12 4v16"/>',
    rect: '<rect x="4" y="6" width="16" height="12" rx="1"/>',
    line: '<path d="M4 20L20 4"/>',
    barcode: '<path d="M4 5v14M7 5v14M10 5v10M13 5v14M16 5v10M19 5v14"/>',
    qr: '<rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><path d="M14 14h2v2M18 14v2M14 18h6M20 16v4"/>',
    check: '<path d="M5 12l5 5L20 7"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  };
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = paths[name] || '';
  return svg;
}

// ---- トースト(システム状態の可視化) ---------------------------------------
let toastHost;
export function toast(message, type = 'info', ms = 3200) {
  if (!toastHost) {
    toastHost = el('div', { class: 'toast-host', 'aria-live': 'polite', role: 'status' });
    document.body.appendChild(toastHost);
  }
  const t = el('div', { class: `toast toast--${type}` }, [
    icon(type === 'error' ? 'help' : type === 'success' ? 'check' : 'help', 16),
    el('span', { text: message }),
  ]);
  toastHost.appendChild(t);
  requestAnimationFrame(() => t.classList.add('is-in'));
  setTimeout(() => {
    t.classList.remove('is-in');
    setTimeout(() => t.remove(), 250);
  }, ms);
}

// ---- モーダル ---------------------------------------------------------------
/** openModal({title, body(node), actions:[{label,kind,onClick->bool|void}], width}) */
export function openModal({ title, body, actions = [], width = 520, onClose } = {}) {
  const overlay = el('div', { class: 'modal-overlay' });
  const footer = el('div', { class: 'modal__footer' });
  const dialog = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title || '', style: { maxWidth: width + 'px' } }, [
    title ? el('div', { class: 'modal__header' }, [el('h2', { class: 'modal__title', text: title }), el('button', { class: 'icon-btn', 'aria-label': '閉じる', onClick: () => close() }, '✕')]) : null,
    el('div', { class: 'modal__body' }, [body]),
    footer,
  ]);
  function close() {
    overlay.classList.remove('is-in');
    setTimeout(() => overlay.remove(), 180);
    document.removeEventListener('keydown', onKey);
    onClose?.();
  }
  for (const a of actions) {
    footer.appendChild(el('button', {
      class: `btn btn--${a.kind || 'ghost'}`,
      onClick: async () => { const r = await a.onClick?.(); if (r !== false) close(); },
    }, a.label));
  }
  function onKey(e) { if (e.key === 'Escape') close(); }
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('is-in'));
  return { close, dialog };
}

/** 破壊的操作の確認(エラー予防 / 取り返しのつかない操作を保護) */
export function confirmDialog(message, { okLabel = '実行', danger = true } = {}) {
  return new Promise((resolve) => {
    openModal({
      title: '確認',
      width: 420,
      body: el('p', { class: 'muted', text: message }),
      actions: [
        { label: 'キャンセル', kind: 'ghost', onClick: () => resolve(false) },
        { label: okLabel, kind: danger ? 'danger' : 'primary', onClick: () => resolve(true) },
      ],
      onClose: () => resolve(false),
    });
  });
}

/** ファイルダウンロード */
export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 一意ID */
export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
