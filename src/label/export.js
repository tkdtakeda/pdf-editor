// 出力。PNG = テンプレ画像 + オーバーレイの合成。PDF = 元PDFにオーバーレイPNGをスタンプ。
// いずれも元テンプレートは改変せず、メモリ上のコピーに対して処理する。
import { mmToPx, mmToPt } from '../util/units.js';
import { renderOverlayCanvas, renderTemplatePage, base64ToUint8 } from './render.js';

const PDFDocument = () => window.PDFLib.PDFDocument;

function canvasToPngBytes(canvas) {
  return new Promise((resolve) => {
    canvas.toBlob(async (blob) => resolve(new Uint8Array(await blob.arrayBuffer())), 'image/png');
  });
}
function canvasToPngBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

/** 画面プレビュー/PNG用に、テンプレ+オーバーレイを合成した1枚の canvas を作る */
export async function composite(label, values, dpi, forOutput = true) {
  const W = Math.max(1, Math.round(mmToPx(label.page.widthMm, dpi)));
  const H = Math.max(1, Math.round(mmToPx(label.page.heightMm, dpi)));
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  if (label.template && label.showTemplate) {
    try {
      const tpl = await renderTemplatePage(label.template.dataB64, label.template.pageIndex || 0, dpi);
      ctx.drawImage(tpl, 0, 0, W, H);
    } catch (e) { console.warn('テンプレ描画失敗', e); }
  }
  const overlay = renderOverlayCanvas(label, values, { dpi, forOutput });
  ctx.drawImage(overlay, 0, 0, W, H);
  return canvas;
}

/** PNG 出力 → Blob */
export async function exportPNG(label, values, dpi) {
  const canvas = await composite(label, values, dpi, true);
  return await canvasToPngBlob(canvas);
}

/** 1レコード=1ページの PDFDocument を作る(使用ページのみ抽出して上塗り) */
async function buildSinglePageDoc(label, values, dpi) {
  const overlay = renderOverlayCanvas(label, values, { dpi, forOutput: true });
  const pngBytes = await canvasToPngBytes(overlay);
  const doc = await PDFDocument().create();
  let page;
  if (label.template) {
    const src = await PDFDocument().load(base64ToUint8(label.template.dataB64));
    const idx = Math.min(label.template.pageIndex || 0, src.getPageCount() - 1);
    const [copied] = await doc.copyPages(src, [idx]);
    doc.addPage(copied);
    page = doc.getPage(0);
    if (page.getRotation && page.getRotation().angle) page.setRotation(window.PDFLib.degrees(0));
  } else {
    page = doc.addPage([mmToPt(label.page.widthMm), mmToPt(label.page.heightMm)]);
  }
  const png = await doc.embedPng(pngBytes);
  const { width, height } = page.getSize();
  page.drawImage(png, { x: 0, y: 0, width, height }); // 透過部分は元PDFが見える=上塗り
  return doc;
}

/** PDF 出力 → Blob (元PDFにオーバーレイを上塗り) */
export async function exportPDF(label, values, dpi) {
  const doc = await buildSinglePageDoc(label, values, dpi);
  const bytes = await doc.save();
  return new Blob([bytes], { type: 'application/pdf' });
}

/** 複数レコードを1つの複数ページPDFへ */
export async function exportPDFBatch(label, valuesList, dpi) {
  const out = await PDFDocument().create();
  for (const values of valuesList) {
    const single = await buildSinglePageDoc(label, values, dpi);
    const [pg] = await out.copyPages(single, [0]);
    out.addPage(pg);
  }
  const bytes = await out.save();
  return new Blob([bytes], { type: 'application/pdf' });
}

/** ラベル設定に従って出力 → {blob, ext} */
export async function exportLabel(label, values, { format, dpi } = {}) {
  const fmt = format || label.output.format || 'pdf';
  const useDpi = dpi || label.output.dpi || 300;
  if (fmt === 'png') return { blob: await exportPNG(label, values, useDpi), ext: 'png' };
  return { blob: await exportPDF(label, values, useDpi), ext: 'pdf' };
}

/** ファイル名生成(安全化) */
export function makeFilename(label, suffix = '') {
  const base = (label.name || 'label').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
  const stamp = new Date().toISOString().slice(0, 10);
  return `${base}${suffix ? '_' + suffix : ''}_${stamp}`;
}
