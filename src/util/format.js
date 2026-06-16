// 数値の桁数合わせ・整形。
// 丸めモード:
//   round   四捨五入 (0.5は0から遠い方へ / round half away from zero)
//   floor   切り捨て (0へ向けて桁を落とす / truncate toward zero)
//   ceil    切り上げ (0から遠い方へ)
//   bankers 銀行丸め (0.5は偶数side / round half to even)。会計で誤差が偏らない。
//   none    丸めない
import { evalExpr } from './expr.js';

export const ROUNDING_MODES = [
  { value: 'round', label: '四捨五入' },
  { value: 'floor', label: '切り捨て' },
  { value: 'ceil', label: '切り上げ' },
  { value: 'bankers', label: '銀行丸め' },
  { value: 'none', label: '丸めなし' },
];

/** value を小数 decimals 桁に、指定モードで丸める。 */
export function roundTo(value, decimals = 0, mode = 'round') {
  if (!isFinite(value)) return value;
  if (mode === 'none') return value;
  const f = Math.pow(10, decimals);
  // 浮動小数の誤差を抑えるため、僅かに補正してからスケール
  const x = value * f;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  // 1e-9 程度の補正で 1.005*100=100.49999... のような誤差を吸収
  const corrected = ax + 1e-9;
  let r;
  switch (mode) {
    case 'floor': r = Math.floor(corrected); break;               // 0方向へ
    case 'ceil': r = Math.ceil(ax - 1e-9); break;                 // 0から遠ざかる
    case 'bankers': {
      const floor = Math.floor(corrected);
      const diff = corrected - floor;
      if (Math.abs(diff - 0.5) < 1e-6) r = floor % 2 === 0 ? floor : floor + 1; // 偶数へ
      else r = Math.round(corrected);
      break;
    }
    case 'round':
    default: r = Math.floor(corrected + 0.5); break;              // 0から遠い方へ(half away)
  }
  return (sign * r) / f;
}

/** 文字列/数値から数値を抽出(カンマ・通貨記号・全角数字に耐える)。失敗時 NaN。 */
export function toNumber(v) {
  if (typeof v === 'number') return v;
  if (v == null) return NaN;
  let s = String(v).trim();
  // 全角数字→半角
  s = s.replace(/[０-９．＋－]/g, (c) => '0123456789.+-'['０１２３４５６７８９．＋－'.indexOf(c)]);
  s = s.replace(/[, _\s¥$€£円]/g, '');
  if (s === '') return NaN;
  const n = Number(s);
  return isNaN(n) ? NaN : n;
}

/** 3桁区切り */
function withThousands(intStr) {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * 整形パイプライン。
 * fmt = { enabled, calcExpr, decimals, rounding, useThousands, padLen, padChar, prefix, suffix, trimZeros }
 * scope = 他フィールドの数値参照用 { value, <fieldKey>:number, ... }
 * 返り値: 表示文字列。数値化できず計算も不要なら、prefix/suffix だけ付けて raw を返す。
 */
export function applyFormat(raw, fmt = {}, scope = {}) {
  const prefix = fmt.prefix || '';
  const suffix = fmt.suffix || '';
  if (!fmt.enabled) return raw == null ? '' : String(raw);

  // 1) 値の決定: 計算式があれば評価、なければ raw を数値化
  let num;
  if (fmt.calcExpr && fmt.calcExpr.trim()) {
    num = evalExpr(fmt.calcExpr, { ...scope, value: toNumber(raw) });
  } else {
    num = toNumber(raw);
  }

  if (isNaN(num)) {
    // 数値化できない → 文字列としてprefix/suffixのみ
    return prefix + (raw == null ? '' : String(raw)) + suffix;
  }

  // 2) 丸め
  const decimals = Math.max(0, fmt.decimals | 0);
  let r = roundTo(num, decimals, fmt.rounding || 'round');

  // 3) 文字列化
  const neg = r < 0;
  let body = Math.abs(r).toFixed(decimals);
  let [intPart, decPart = ''] = body.split('.');

  // 桁数合わせ(ゼロ埋め): 整数部を padLen まで padChar で左詰め
  if (fmt.padLen && fmt.padLen > intPart.length) {
    intPart = String(fmt.padChar || '0').repeat(fmt.padLen - intPart.length) + intPart;
  }
  if (fmt.useThousands) intPart = withThousands(intPart);

  let out = intPart + (decimals > 0 ? '.' + decPart : '');
  if (fmt.trimZeros && decimals > 0) out = out.replace(/\.?0+$/, '');
  if (neg) out = '-' + out;
  return prefix + out + suffix;
}
