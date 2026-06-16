// メンテナ向け: node_modules のブラウザ向けビルドを vendor/ にコピーし直す。
// 使い方:  npm install && npm run vendor
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nm = resolve(root, 'node_modules');
const out = resolve(root, 'vendor');
mkdirSync(out, { recursive: true });

const files = [
  ['pdf-lib/dist/pdf-lib.min.js', 'pdf-lib.min.js'],
  ['pdfjs-dist/legacy/build/pdf.min.js', 'pdf.min.js'],
  ['pdfjs-dist/legacy/build/pdf.worker.min.js', 'pdf.worker.min.js'],
  ['jsbarcode/dist/JsBarcode.all.min.js', 'JsBarcode.all.min.js'],
  ['qrcode-generator/qrcode.js', 'qrcode.js'],
];

for (const [from, to] of files) {
  copyFileSync(resolve(nm, from), resolve(out, to));
  console.log('copied', to);
}
console.log('done.');
