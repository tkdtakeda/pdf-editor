// レンダリングの中核。
//  1) テンプレPDF → canvas (pdf.js) … 設計画面の背景 / PNG合成に使用
//  2) オーバーレイ(要素のみ) → 透明canvas … プレビュー・PNG・PDFスタンプで共通利用
//
// 「元PDFは編集せず上塗り」を、オーバーレイ描画を一本化することで実現する。
import { mmToPx, ptToPx, ptToMm, clamp } from '../util/units.js';
import { resolveElementText } from './model.js';
import { renderBarcode, renderQRCode } from './codes.js';

// pdf.js worker 設定(同梱ファイルを指す)
if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../../vendor/pdf.worker.min.js', import.meta.url).href;
}

// ---- base64 / バイト変換 ----------------------------------------------------
export async function fileToBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(bin);
}
export function base64ToUint8(b64) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

// ---- pdf.js テンプレート -----------------------------------------------------
let _cache = { b64: null, doc: null };
async function getDoc(b64) {
  if (_cache.b64 === b64 && _cache.doc) return _cache.doc;
  const doc = await window.pdfjsLib.getDocument({ data: base64ToUint8(b64) }).promise;
  _cache = { b64, doc };
  return doc;
}

/** 各ページの mm サイズ一覧 */
export async function getTemplatePageSizes(b64) {
  const doc = await getDoc(b64);
  const sizes = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 1 }); // scale1 → 1単位=1pt
    sizes.push({ widthMm: ptToMm(vp.width), heightMm: ptToMm(vp.height) });
  }
  return { numPages: doc.numPages, sizes };
}

/** 指定ページを dpi で canvas にレンダリング */
export async function renderTemplatePage(b64, pageIndex, dpi) {
  const doc = await getDoc(b64);
  const page = await doc.getPage(clamp(pageIndex, 0, doc.numPages - 1) + 1);
  const scale = dpi / 72;
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(vp.width);
  canvas.height = Math.round(vp.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height); // PDFは透明背景のことがある→白地に
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return canvas;
}

// ---- テキスト折返し ----------------------------------------------------------
function wrapText(ctx, text, maxWidth) {
  const lines = [];
  for (const para of String(text).split('\n')) {
    if (para === '') { lines.push(''); continue; }
    const words = para.split(/(\s+)/); // 空白も保持
    let cur = '';
    const pushChars = (token) => {
      for (const ch of token) {
        if (cur && ctx.measureText(cur + ch).width > maxWidth) { lines.push(cur); cur = ch; }
        else cur += ch;
      }
    };
    for (const w of words) {
      if (cur === '' && w.trim() === '') continue;
      if (ctx.measureText(cur + w).width <= maxWidth) cur += w;
      else if (ctx.measureText(w).width > maxWidth) pushChars(w); // 1語が長すぎ→文字で割る
      else { if (cur) lines.push(cur.replace(/\s+$/, '')); cur = w.trimStart(); }
    }
    lines.push(cur.replace(/\s+$/, ''));
  }
  return lines;
}

function fontString(font, sizePx) {
  return `${font.italic ? 'italic ' : ''}${font.bold ? '700' : '400'} ${sizePx}px ${font.family || 'sans-serif'}`;
}

// ---- 要素描画 ----------------------------------------------------------------
function drawText(ctx, elm, str, box, dpi) {
  const f = elm.font;
  let sizePx = ptToPx(f.size, dpi);
  try { ctx.letterSpacing = `${ptToPx(f.letterSpacing || 0, dpi)}px`; } catch { /* 非対応ブラウザ */ }
  ctx.fillStyle = f.color;
  ctx.textBaseline = 'top';

  let lines;
  ctx.font = fontString(f, sizePx);
  if (elm.autoFit) {
    // 幅・高さに収まるまで縮小(Constraintの可視化: はみ出させない)
    for (let guard = 0; guard < 60; guard++) {
      ctx.font = fontString(f, sizePx);
      lines = wrapText(ctx, str, box.w);
      const widest = Math.max(0, ...lines.map((l) => ctx.measureText(l).width));
      const totalH = lines.length * sizePx * f.lineHeight;
      if ((widest <= box.w && totalH <= box.h) || sizePx <= 5) break;
      sizePx -= 1;
    }
  } else {
    lines = wrapText(ctx, str, box.w);
  }

  const lineH = sizePx * f.lineHeight;
  const totalH = lines.length * lineH;
  let startY = 0;
  if (f.valign === 'middle') startY = (box.h - totalH) / 2;
  else if (f.valign === 'bottom') startY = box.h - totalH;

  ctx.textAlign = f.align === 'center' ? 'center' : f.align === 'right' ? 'right' : 'left';
  const ax = f.align === 'center' ? box.w / 2 : f.align === 'right' ? box.w : 0;

  // クリップして枠外へあふれさせない
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, box.w, box.h);
  ctx.clip();
  lines.forEach((line, i) => ctx.fillText(line, ax, startY + i * lineH));
  ctx.restore();
  try { ctx.letterSpacing = '0px'; } catch { /* noop */ }
}

function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawRect(ctx, elm, box, dpi) {
  const s = elm.shape;
  ctx.globalAlpha = s.opacity != null ? s.opacity : 1;
  const r = mmToPx(s.radius || 0, dpi);
  roundRectPath(ctx, 0, 0, box.w, box.h, r);
  if (s.fillOn) { ctx.fillStyle = s.fill; ctx.fill(); }
  if (s.strokeOn) { ctx.lineWidth = Math.max(1, mmToPx(s.strokeWidth, dpi)); ctx.strokeStyle = s.stroke; ctx.stroke(); }
  ctx.globalAlpha = 1;
}

function drawLine(ctx, elm, box, dpi) {
  const s = elm.shape;
  ctx.globalAlpha = s.opacity != null ? s.opacity : 1;
  ctx.lineWidth = Math.max(1, mmToPx(s.strokeWidth, dpi));
  ctx.strokeStyle = s.stroke;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(box.w, box.h); // バウンディングボックスの対角(既定は h=0 で水平線)
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawCodeCanvas(ctx, codeCanvas, box, keepSquare) {
  if (keepSquare) {
    const side = Math.min(box.w, box.h);
    const ox = (box.w - side) / 2;
    const oy = (box.h - side) / 2;
    ctx.drawImage(codeCanvas, ox, oy, side, side);
  } else {
    ctx.drawImage(codeCanvas, 0, 0, box.w, box.h);
  }
}

function drawPlaceholder(ctx, box, text) {
  ctx.save();
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = '#c026d3';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, box.w - 1, box.h - 1);
  ctx.setLineDash([]);
  ctx.fillStyle = '#c026d3';
  ctx.font = '12px sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(text, box.w / 2, box.h / 2, box.w - 4);
  ctx.restore();
}

/**
 * オーバーレイ(要素のみ)を透明 canvas に描画。
 * opts: { dpi, forOutput(true=出力, false=編集プレビュー), selectedId }
 */
export function renderOverlayCanvas(label, values, opts = {}) {
  const dpi = opts.dpi || 150;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(mmToPx(label.page.widthMm, dpi)));
  canvas.height = Math.max(1, Math.round(mmToPx(label.page.heightMm, dpi)));
  const ctx = canvas.getContext('2d');

  const ordered = [...label.elements];
  for (const elm of ordered) {
    const pw = mmToPx(elm.w, dpi);
    const ph = mmToPx(elm.h, dpi);
    const px = mmToPx(elm.x, dpi);
    const py = mmToPx(elm.y, dpi);
    ctx.save();
    ctx.translate(px + pw / 2, py + ph / 2);
    if (elm.rotation) ctx.rotate((elm.rotation * Math.PI) / 180);
    ctx.translate(-pw / 2, -ph / 2);
    const box = { w: pw, h: ph };

    if (elm.type === 'text') {
      drawText(ctx, elm, resolveElementText(elm, values), box, dpi);
    } else if (elm.type === 'rect') {
      drawRect(ctx, elm, box, dpi);
    } else if (elm.type === 'line') {
      drawLine(ctx, elm, box, dpi);
    } else if (elm.type === 'barcode') {
      const str = resolveElementText(elm, values);
      const cc = renderBarcode(str, { moduleColor: elm.code.moduleColor, bgOn: elm.code.bgOn, bgColor: elm.code.bgColor, showText: elm.code.showText });
      if (cc) drawCodeCanvas(ctx, cc, box, false);
      else if (!opts.forOutput) drawPlaceholder(ctx, box, str ? 'バーコード不可' : 'バーコード');
    } else if (elm.type === 'qrcode') {
      const str = resolveElementText(elm, values);
      const cc = renderQRCode(str, { ecLevel: elm.code.ecLevel, moduleColor: elm.code.moduleColor, bgOn: elm.code.bgOn, bgColor: elm.code.bgColor, quietZone: elm.code.quietZone });
      if (cc) drawCodeCanvas(ctx, cc, box, true);
      else if (!opts.forOutput) drawPlaceholder(ctx, box, str ? 'QR不可' : 'QR');
    }
    ctx.restore();
  }
  return canvas;
}
