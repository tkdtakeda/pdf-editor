# 同梱ライブラリ（vendored）

このツールはオフラインで完結させるため、以下のブラウザ向けライブラリを `vendor/` に同梱しています。
すべて npm の公式配布物（`registry.npmjs.org`）から取得した、改変なしのビルド済みファイルです。

| ファイル | パッケージ | バージョン | ライセンス | グローバル変数 |
|---|---|---|---|---|
| `pdf-lib.min.js` | [pdf-lib](https://www.npmjs.com/package/pdf-lib) | 1.17.1 | MIT | `PDFLib` |
| `pdf.min.js` / `pdf.worker.min.js` | [pdfjs-dist](https://www.npmjs.com/package/pdfjs-dist) (legacy build) | 3.11.174 | Apache-2.0 | `pdfjsLib` |
| `JsBarcode.all.min.js` | [jsbarcode](https://www.npmjs.com/package/jsbarcode) | 3.11.6 | MIT | `JsBarcode` |
| `qrcode.js` | [qrcode-generator](https://www.npmjs.com/package/qrcode-generator) | 1.4.4 | MIT | `qrcode` |

## 役割

- **pdf-lib** … 元のテンプレートPDFを読み込み、オーバーレイ（透過PNG）を重ねて新しいPDFとして書き出す（元PDFは改変しない）。
- **pdfjs-dist** … テンプレートPDFを画面・PNG出力用に画像化（ラスタライズ）する。
- **jsbarcode** … Code128 等の1次元バーコードを生成。
- **qrcode-generator** … QRコードを生成（UTF-8対応のため日本語も格納可能）。

## 再取得（メンテナ向け）

```
npm install            # devDependencies を取得
npm run vendor         # node_modules から vendor/ へコピーし直す
```
