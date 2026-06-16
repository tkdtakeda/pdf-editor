// バーコード/QRコード生成。グローバル(JsBarcode, qrcode)は index.html の <script> で読込済み。
// それぞれ canvas を返し、描画側(render.js)が要素ボックスへ contain 配置する。

let qrUtf8Ready = false;
function ensureQrUtf8() {
  if (qrUtf8Ready) return;
  try { window.qrcode.stringToBytes = window.qrcode.stringToBytesFuncs['UTF-8']; } catch { /* noop */ }
  qrUtf8Ready = true;
}

/**
 * Code128 バーコードを canvas に描画して返す。生成不可(空・非対応文字)なら null。
 * opts: { moduleColor, bgOn, bgColor, showText, heightPx, margin }
 */
export function renderBarcode(value, opts = {}) {
  const v = value == null ? '' : String(value);
  if (v === '') return null;
  const canvas = document.createElement('canvas');
  let ok = true;
  const options = {
    format: 'CODE128',
    lineColor: opts.moduleColor || '#000000',
    width: 2,
    height: opts.heightPx || 120,
    displayValue: !!opts.showText,
    margin: opts.margin != null ? opts.margin : 6,
    fontSize: 18,
    valid: (isValid) => { ok = isValid; },
  };
  if (opts.bgOn) options.background = opts.bgColor || '#ffffff';
  try {
    window.JsBarcode(canvas, v, options);
  } catch {
    ok = false;
  }
  return ok ? canvas : null;
}

/**
 * QRコードを canvas に描画して返す。日本語(UTF-8)対応。生成不可なら null。
 * opts: { ecLevel:'L'|'M'|'Q'|'H', moduleColor, bgOn, bgColor, quietZone(モジュール数) }
 */
export function renderQRCode(value, opts = {}) {
  const v = value == null ? '' : String(value);
  if (v === '') return null;
  ensureQrUtf8();
  let qr;
  try {
    qr = window.qrcode(0, opts.ecLevel || 'M'); // 0 = データに合わせて自動でサイズ決定
    qr.addData(v);
    qr.make();
  } catch {
    return null; // データが大きすぎる等
  }
  const count = qr.getModuleCount();
  const quiet = opts.quietZone != null ? opts.quietZone : 2;
  const scale = 10; // 1モジュール=10px(出力時に縮小される)
  const size = (count + quiet * 2) * scale;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (opts.bgOn) { ctx.fillStyle = opts.bgColor || '#ffffff'; ctx.fillRect(0, 0, size, size); }
  ctx.fillStyle = opts.moduleColor || '#000000';
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
    }
  }
  return canvas;
}
