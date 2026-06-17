// 配布用の単一HTML(dist/label-maker.html)を生成する。
// これ1ファイルをダブルクリック(file://)するだけで動く: ライブラリ・CSS・pdf.jsワーカーを内包し、
// ESモジュールは結合してclassicスクリプト化(file://ではESモジュールが読めないため)。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');
const escScript = (s) => s.replace(/<\/script>/gi, '<\\/script>'); // <script>内/平文埋め込みの保護

// ESモジュールを結合順(依存順)に並べる
const MODULES = [
  'src/util/dom.js', 'src/util/units.js', 'src/util/expr.js', 'src/util/format.js', 'src/util/normalize.js',
  'src/store.js', 'src/data/parse.js', 'src/data/binding.js',
  'src/label/codes.js', 'src/label/model.js', 'src/label/render.js', 'src/label/export.js',
  'src/ui/components.js', 'src/ui/editorCanvas.js', 'src/ui/inspector.js',
  'src/ui/stepA.js', 'src/ui/stepB.js', 'src/ui/stepC.js', 'src/ui/presets.js', 'src/ui/help.js',
  'src/main.js',
];

function stripModule(src) {
  return src
    .replace(/^\s*import\s[^\n]*$/gm, '')        // import 文を除去
    .replace(/^(\s*)export\s+/gm, '$1')          // export キーワードを除去
    .replace(/import\.meta\.url/g, 'document.baseURI'); // classicスクリプトで解釈可能に
}

/** アプリ全体を1つのIIFEに結合した文字列を返す(テストからも使用) */
export function assembleApp() {
  const body = MODULES.map((m) => `\n/* ===== ${m} ===== */\n` + stripModule(read(m))).join('\n');
  return `(function(){\n"use strict";\n${body}\n})();`;
}

function buildHtml() {
  const css = ['styles/base.css', 'styles/components.css', 'styles/editor.css'].map(read).join('\n');
  const vendor = {
    pdfjs: read('vendor/pdf.min.js'),
    pdflib: read('vendor/pdf-lib.min.js'),
    jsbarcode: read('vendor/JsBarcode.all.min.js'),
    qrcode: read('vendor/qrcode.js'),
    worker: read('vendor/pdf.worker.min.js'),
  };
  const app = assembleApp();

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>ラベルメーカー — テンプレPDFに上塗りしてラベル作成</title>
<style>
${css}
</style>
</head>
<body>
<header class="appbar">
  <div class="brand"><span class="brand__mark" aria-hidden="true">🏷️</span><span class="brand__name">ラベルメーカー</span></div>
  <nav class="stepper" id="nav" aria-label="作業ステップ"></nav>
  <div class="appbar__actions" id="appbarActions"></div>
</header>
<main id="view" class="view"></main>

<!-- pdf.js ワーカー(本文を Blob URL 化して使う。file:// でも動く) -->
<script type="text/plain" id="pdf-worker-src">${escScript(vendor.worker)}</script>
<script>${escScript(vendor.pdfjs)}</script>
<script>${escScript(vendor.pdflib)}</script>
<script>${escScript(vendor.jsbarcode)}</script>
<script>${escScript(vendor.qrcode)}</script>
<script>
  try {
    var __wsrc = document.getElementById('pdf-worker-src').textContent;
    window.__PDF_WORKER_URL__ = URL.createObjectURL(new Blob([__wsrc], { type: 'application/javascript' }));
  } catch (e) { console.warn('worker blob 化に失敗', e); }
</script>
<script>${escScript(app)}</script>
<noscript>このツールはJavaScriptが必要です。</noscript>
</body>
</html>`;

  mkdirSync(resolve(root, 'dist'), { recursive: true });
  const out = resolve(root, 'dist/label-maker.html');
  writeFileSync(out, html);
  const kb = Math.round(Buffer.byteLength(html) / 1024);
  console.log(`built ${out} (${kb} KB)`);
}

// 直接実行時のみビルド
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) buildHtml();
