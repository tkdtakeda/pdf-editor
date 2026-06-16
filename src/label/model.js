// ラベルひな形(ワークフローB)のデータモデルとファクトリ。
// 座標はすべて mm・左上原点(絶対座標)。出力時に pt/px へ変換する。
import { uid } from '../util/dom.js';
import { applyFormat } from '../util/format.js';
import { numericScope } from '../data/binding.js';

export const ELEMENT_TYPES = [
  { type: 'text', label: 'テキスト', icon: 'text' },
  { type: 'rect', label: '矩形', icon: 'rect' },
  { type: 'line', label: '線', icon: 'line' },
  { type: 'barcode', label: 'バーコード(Code128)', icon: 'barcode' },
  { type: 'qrcode', label: 'QRコード', icon: 'qr' },
];

export const FONT_FAMILIES = [
  { value: 'sans-serif', label: 'ゴシック(sans-serif)' },
  { value: 'serif', label: '明朝(serif)' },
  { value: 'monospace', label: '等幅(monospace)' },
];

/** 既定のA4・余白なし。テンプレ読込時に上書きされる。 */
export function newLabel() {
  return {
    id: null,
    name: '',
    bindingPresetId: null,
    template: null, // { name, dataB64, pageIndex }
    page: { widthMm: 210, heightMm: 297 },
    output: { format: 'pdf', dpi: 300 },
    showTemplate: true,
    elements: [],
  };
}

/** 要素の既定値。type ごとに最小限の妥当な初期値を与える(Hickの法則: 既定で迷わせない)。 */
export function newElement(type, pageMm = { widthMm: 210, heightMm: 297 }) {
  const cx = Math.round(pageMm.widthMm / 2);
  const cy = Math.round(pageMm.heightMm / 2);
  const base = {
    id: uid('el'),
    type,
    name: '',
    x: Math.max(2, cx - 20),
    y: Math.max(2, cy - 5),
    w: 40,
    h: 10,
    rotation: 0,
    fieldKey: null,
    staticText: '',
    font: { size: 10, family: 'sans-serif', bold: false, italic: false, color: '#111111', align: 'left', valign: 'middle', lineHeight: 1.25, letterSpacing: 0 },
    autoFit: false,
    shape: { fillOn: false, fill: '#000000', strokeOn: true, stroke: '#111111', strokeWidth: 0.3, radius: 0, opacity: 1 },
    code: { moduleColor: '#000000', bgOn: true, bgColor: '#ffffff', quietZone: 2, ecLevel: 'M', showText: false },
    format: { enabled: false, calcExpr: '', decimals: 0, rounding: 'round', useThousands: false, padLen: 0, padChar: '0', prefix: '', suffix: '', trimZeros: false },
  };
  if (type === 'text') Object.assign(base, { w: 50, h: 8, staticText: 'テキスト' });
  if (type === 'rect') Object.assign(base, { w: 40, h: 20 });
  if (type === 'line') Object.assign(base, { w: 40, h: 0 });
  if (type === 'barcode') Object.assign(base, { w: 50, h: 16, staticText: '1234567890', code: { ...base.code, showText: true } });
  if (type === 'qrcode') Object.assign(base, { w: 22, h: 22, staticText: 'https://example.com' });
  return base;
}

/** 要素の表示名(レイヤ一覧用) */
export function elementTitle(elm, binding) {
  if (elm.name) return elm.name;
  if (elm.fieldKey) {
    const f = binding?.fields?.find((x) => x.key === elm.fieldKey);
    return `🔗 ${f ? f.label : elm.fieldKey}`;
  }
  const t = ELEMENT_TYPES.find((x) => x.type === elm.type)?.label || elm.type;
  if (elm.type === 'text') return `T: ${(elm.staticText || '').slice(0, 12) || '(空)'}`;
  if (elm.type === 'barcode' || elm.type === 'qrcode') return `${t}`;
  return t;
}

/**
 * 要素に流し込む最終文字列を計算。
 *  - fieldKey があれば紐づけ値、無ければ staticText を元値とする
 *  - format(計算/丸め/桁/接頭尾)を適用
 * values: {fieldKey: 値}
 */
export function resolveElementText(elm, values = {}) {
  const rawSource = elm.fieldKey != null ? (values[elm.fieldKey] ?? '') : (elm.staticText ?? '');
  return applyFormat(rawSource, elm.format, numericScope(values));
}
