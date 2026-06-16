// 設計キャンバス(直接操作)。
//  - 背景canvas(テンプレ) + オーバーレイcanvas(要素の実描画) + DOM操作レイヤ の3層構造。
//  - オーバーレイは出力と同じ renderOverlayCanvas を使うため、見たまま=出力(WYSIWYG)。
//  - ドラッグ移動/リサイズ + スナップ + 整列ガイド + 矢印キー微調整で、精密配置の負荷を下げる。
//  - 回転はインスペクタの数値で指定(操作の単純化)。
import { el, clear } from '../util/dom.js';
import { renderOverlayCanvas, renderTemplatePage } from '../label/render.js';
import { mmToPx, clamp } from '../util/units.js';

const PREVIEW_DPI = 160;            // オーバーレイ内部解像度(表示はCSSで拡縮)
const SCREEN_PX_PER_MM = 96 / 25.4; // 96dpi基準。zoom=1 でほぼ実寸
const SNAP_PX = 5;                  // スナップ許容(画面px)

export function createEditorCanvas({ getLabel, getValues, getSelectedId, onSelect, onChange }) {
  let zoom = 1;
  let pxPerMm = SCREEN_PX_PER_MM * zoom;
  let bgToken = 0;

  const bg = el('canvas', { class: 'canvas-bg' });
  const overlay = el('canvas', { class: 'canvas-overlay' });
  const hit = el('div', { class: 'canvas-hit' });
  const stack = el('div', { class: 'canvas-stack' }, [bg, overlay, hit]);
  const scroll = el('div', { class: 'stage-scroll' }, [stack]);

  function disp(mm) { return mm * pxPerMm; }
  function toMm(px) { return px / pxPerMm; }

  function setZoom(z) {
    zoom = clamp(z, 0.2, 4);
    pxPerMm = SCREEN_PX_PER_MM * zoom;
    layout();
    onZoomChange?.(zoom);
  }
  let onZoomChange = null;

  function layout() {
    const label = getLabel();
    const wPx = disp(label.page.widthMm);
    const hPx = disp(label.page.heightMm);
    stack.style.width = wPx + 'px';
    stack.style.height = hPx + 'px';
    // 内部解像度(描画品質)
    const ow = Math.max(1, Math.round(mmToPx(label.page.widthMm, PREVIEW_DPI)));
    const oh = Math.max(1, Math.round(mmToPx(label.page.heightMm, PREVIEW_DPI)));
    overlay.width = ow; overlay.height = oh;
    bg.width = ow; bg.height = oh;
    refreshOverlay();
    refreshBackground();
    refreshBoxes();
  }

  async function refreshBackground() {
    const label = getLabel();
    const ctx = bg.getContext('2d');
    ctx.clearRect(0, 0, bg.width, bg.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, bg.width, bg.height);
    if (label.template && label.showTemplate) {
      const token = ++bgToken;
      try {
        const tpl = await renderTemplatePage(label.template.dataB64, label.template.pageIndex || 0, PREVIEW_DPI);
        if (token !== bgToken) return; // 競合(連打)対策
        ctx.drawImage(tpl, 0, 0, bg.width, bg.height);
      } catch (e) { console.warn(e); }
    }
  }

  function refreshOverlay() {
    const label = getLabel();
    const oc = renderOverlayCanvas(label, getValues(), { dpi: PREVIEW_DPI, forOutput: false });
    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    ctx.drawImage(oc, 0, 0);
  }

  // ---- 操作ボックス ----
  function refreshBoxes() {
    clear(hit);
    const label = getLabel();
    const selId = getSelectedId();
    for (const elm of label.elements) {
      const box = el('div', { class: 'el-box' + (elm.id === selId ? ' is-selected' : ''), dataset: { id: elm.id } });
      box.style.left = disp(elm.x) + 'px';
      box.style.top = disp(elm.y) + 'px';
      box.style.width = disp(elm.w) + 'px';
      box.style.height = Math.max(disp(elm.h), elm.type === 'line' ? 2 : 0) + 'px';
      box.addEventListener('pointerdown', (e) => startMove(e, elm));
      if (elm.id === selId) addHandles(box, elm);
      hit.appendChild(box);
    }
  }

  function addHandles(box, elm) {
    const dirs = elm.type === 'line' ? ['w', 'e'] : ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
    for (const d of dirs) {
      const h = el('div', { class: 'handle ' + d });
      h.addEventListener('pointerdown', (e) => startResize(e, elm, d));
      box.appendChild(h);
    }
  }

  // ---- 移動 ----
  function startMove(e, elm) {
    e.stopPropagation();
    if (getSelectedId() !== elm.id) { onSelect(elm.id); }
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY;
    const ox = elm.x, oy = elm.y;
    const others = getLabel().elements.filter((x) => x !== elm);
    function move(ev) {
      let nx = ox + toMm(ev.clientX - sx);
      let ny = oy + toMm(ev.clientY - sy);
      const snapped = applySnap(elm, nx, ny, others);
      elm.x = round1(snapped.x); elm.y = round1(snapped.y);
      drawGuides(snapped.guides);
      box(elm).style.left = disp(elm.x) + 'px';
      box(elm).style.top = disp(elm.y) + 'px';
      scheduleOverlay();
    }
    function up() {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      clearGuides();
      onChange();
    }
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  }

  // ---- リサイズ ----
  function startResize(e, elm, dir) {
    e.stopPropagation(); e.preventDefault();
    const sx = e.clientX, sy = e.clientY;
    const o = { x: elm.x, y: elm.y, w: elm.w, h: elm.h };
    const page = getLabel().page;
    function move(ev) {
      const dx = toMm(ev.clientX - sx);
      const dy = toMm(ev.clientY - sy);
      let { x, y, w, h } = o;
      if (dir.includes('e')) w = o.w + dx;
      if (dir.includes('s')) h = o.h + dy;
      if (dir.includes('w')) { w = o.w - dx; x = o.x + dx; }
      if (dir.includes('n')) { h = o.h - dy; y = o.y + dy; }
      const minW = 1, minH = elm.type === 'line' ? 0 : 1;
      if (w < minW) { if (dir.includes('w')) x = o.x + o.w - minW; w = minW; }
      if (h < minH) { if (dir.includes('n')) y = o.y + o.h - minH; h = minH; }
      elm.x = round1(clamp(x, 0, page.widthMm));
      elm.y = round1(clamp(y, 0, page.heightMm));
      elm.w = round1(w); elm.h = round1(h);
      const b = box(elm);
      b.style.left = disp(elm.x) + 'px'; b.style.top = disp(elm.y) + 'px';
      b.style.width = disp(elm.w) + 'px'; b.style.height = Math.max(disp(elm.h), elm.type === 'line' ? 2 : 0) + 'px';
      scheduleOverlay();
    }
    function up() {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      onChange();
    }
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  }

  // ---- スナップ & ガイド ----
  function applySnap(elm, nx, ny, others) {
    const page = getLabel().page;
    const thr = toMm(SNAP_PX);
    const guides = [];
    // 候補(縦線=x座標, 横線=y座標)
    const vx = [0, page.widthMm / 2, page.widthMm];
    const hy = [0, page.heightMm / 2, page.heightMm];
    for (const o of others) {
      vx.push(o.x, o.x + o.w / 2, o.x + o.w);
      hy.push(o.y, o.y + o.h / 2, o.y + o.h);
    }
    // 自分の3つの基準(左/中央/右)を各候補に合わせる
    const tryX = [{ edge: nx, off: 0 }, { edge: nx + elm.w / 2, off: elm.w / 2 }, { edge: nx + elm.w, off: elm.w }];
    let bestX = null;
    for (const t of tryX) for (const c of vx) {
      const d = Math.abs(t.edge - c);
      if (d <= thr && (!bestX || d < bestX.d)) bestX = { x: c - t.off, line: c, d };
    }
    const tryY = [{ edge: ny, off: 0 }, { edge: ny + elm.h / 2, off: elm.h / 2 }, { edge: ny + elm.h, off: elm.h }];
    let bestY = null;
    for (const t of tryY) for (const c of hy) {
      const d = Math.abs(t.edge - c);
      if (d <= thr && (!bestY || d < bestY.d)) bestY = { y: c - t.off, line: c, d };
    }
    if (bestX) { nx = bestX.x; guides.push({ type: 'v', mm: bestX.line }); }
    if (bestY) { ny = bestY.y; guides.push({ type: 'h', mm: bestY.line }); }
    return { x: nx, y: ny, guides };
  }
  function drawGuides(guides) {
    clearGuides();
    for (const g of guides) {
      const line = el('div', { class: 'guide ' + g.type });
      if (g.type === 'v') line.style.left = disp(g.mm) + 'px';
      else line.style.top = disp(g.mm) + 'px';
      hit.appendChild(line);
    }
  }
  function clearGuides() { hit.querySelectorAll('.guide').forEach((n) => n.remove()); }

  function box(elm) { return hit.querySelector(`.el-box[data-id="${elm.id}"]`); }
  function round1(v) { return Math.round(v * 10) / 10; }

  // オーバーレイ再描画のrAFスロットリング
  let rafId = null;
  function scheduleOverlay() { if (rafId) return; rafId = requestAnimationFrame(() => { rafId = null; refreshOverlay(); }); }

  // 背景クリックで選択解除
  hit.addEventListener('pointerdown', (e) => { if (e.target === hit) onSelect(null); });

  // 矢印キーで微調整 / Delete / Ctrl+D
  function onKey(e) {
    const selId = getSelectedId();
    if (!selId) return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
    const elm = getLabel().elements.find((x) => x.id === selId);
    if (!elm) return;
    const step = e.shiftKey ? 5 : 0.5;
    let handled = true;
    if (e.key === 'ArrowLeft') elm.x = round1(elm.x - step);
    else if (e.key === 'ArrowRight') elm.x = round1(elm.x + step);
    else if (e.key === 'ArrowUp') elm.y = round1(elm.y - step);
    else if (e.key === 'ArrowDown') elm.y = round1(elm.y + step);
    else if (e.key === 'Delete' || e.key === 'Backspace') { onDelete?.(elm.id); return; }
    else if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) { onDuplicate?.(elm.id); e.preventDefault(); return; }
    else handled = false;
    if (handled) { e.preventDefault(); refreshOverlay(); refreshBoxes(); onChange(); }
  }
  document.addEventListener('keydown', onKey);

  let onDelete = null, onDuplicate = null;

  return {
    element: scroll,
    setZoom,
    getZoom: () => zoom,
    onZoomChange: (fn) => { onZoomChange = fn; },
    onDelete: (fn) => { onDelete = fn; },
    onDuplicate: (fn) => { onDuplicate = fn; },
    layout,            // ページサイズ等が変わったら
    refreshOverlay,    // 値・スタイル変更時
    refreshBackground, // テンプレ変更時
    refreshBoxes,      // 選択・要素増減時
    destroy: () => document.removeEventListener('keydown', onKey),
    // ドラッグ&ドロップでフィールドを落とす座標 → mm
    clientToMm: (clientX, clientY) => {
      const r = stack.getBoundingClientRect();
      return { x: round1(toMm(clientX - r.left)), y: round1(toMm(clientY - r.top)) };
    },
    stackEl: stack,
  };
}
