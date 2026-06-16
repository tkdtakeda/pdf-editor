// データ正規化(ワークフローA)。貼り付けた生データを項目値へ整える一連の操作。
// 「中身は変わってもルールは変わらない」ため、ここでの操作列はプリセットに保存される。

export const NORMALIZE_OPS = [
  { op: 'trim', label: '前後の空白を削除' },
  { op: 'collapseSpaces', label: '連続空白を1つに' },
  { op: 'removeSpaces', label: '空白をすべて削除(全角空白含む)' },
  { op: 'zen2han', label: '全角英数記号→半角' },
  { op: 'han2zenKana', label: '半角カナ→全角' },
  { op: 'removeCommas', label: 'カンマを削除' },
  { op: 'digitsOnly', label: '数字(.-)のみ残す' },
  { op: 'upper', label: '大文字に' },
  { op: 'lower', label: '小文字に' },
  { op: 'replace', label: '置換(検索→置換)', args: ['find', 'repl', 'regex'] },
  { op: 'slice', label: '範囲切り出し(開始/長さ)', args: ['start', 'len'] },
  { op: 'prefix', label: '先頭に追加', args: ['text'] },
  { op: 'suffix', label: '末尾に追加', args: ['text'] },
];

const HALF_KANA = { 'ｶﾞ': 'ガ', 'ｷﾞ': 'ギ', 'ｸﾞ': 'グ', 'ｹﾞ': 'ゲ', 'ｺﾞ': 'ゴ', 'ｻﾞ': 'ザ', 'ｼﾞ': 'ジ', 'ｽﾞ': 'ズ', 'ｾﾞ': 'ゼ', 'ｿﾞ': 'ゾ', 'ﾀﾞ': 'ダ', 'ﾁﾞ': 'ヂ', 'ﾂﾞ': 'ヅ', 'ﾃﾞ': 'デ', 'ﾄﾞ': 'ド', 'ﾊﾞ': 'バ', 'ﾋﾞ': 'ビ', 'ﾌﾞ': 'ブ', 'ﾍﾞ': 'ベ', 'ﾎﾞ': 'ボ', 'ﾊﾟ': 'パ', 'ﾋﾟ': 'ピ', 'ﾌﾟ': 'プ', 'ﾍﾟ': 'ペ', 'ﾎﾟ': 'ポ', 'ｳﾞ': 'ヴ', 'ｱ': 'ア', 'ｲ': 'イ', 'ｳ': 'ウ', 'ｴ': 'エ', 'ｵ': 'オ', 'ｶ': 'カ', 'ｷ': 'キ', 'ｸ': 'ク', 'ｹ': 'ケ', 'ｺ': 'コ', 'ｻ': 'サ', 'ｼ': 'シ', 'ｽ': 'ス', 'ｾ': 'セ', 'ｿ': 'ソ', 'ﾀ': 'タ', 'ﾁ': 'チ', 'ﾂ': 'ツ', 'ﾃ': 'テ', 'ﾄ': 'ト', 'ﾅ': 'ナ', 'ﾆ': 'ニ', 'ﾇ': 'ヌ', 'ﾈ': 'ネ', 'ﾉ': 'ノ', 'ﾊ': 'ハ', 'ﾋ': 'ヒ', 'ﾌ': 'フ', 'ﾍ': 'ヘ', 'ﾎ': 'ホ', 'ﾏ': 'マ', 'ﾐ': 'ミ', 'ﾑ': 'ム', 'ﾒ': 'メ', 'ﾓ': 'モ', 'ﾔ': 'ヤ', 'ﾕ': 'ユ', 'ﾖ': 'ヨ', 'ﾗ': 'ラ', 'ﾘ': 'リ', 'ﾙ': 'ル', 'ﾚ': 'レ', 'ﾛ': 'ロ', 'ﾜ': 'ワ', 'ｦ': 'ヲ', 'ﾝ': 'ン', 'ｧ': 'ァ', 'ｨ': 'ィ', 'ｩ': 'ゥ', 'ｪ': 'ェ', 'ｫ': 'ォ', 'ｬ': 'ャ', 'ｭ': 'ュ', 'ｮ': 'ョ', 'ｯ': 'ッ', 'ｰ': 'ー', '｡': '。', '｢': '「', '｣': '」', '､': '、', '･': '・' };

function zenToHan(s) {
  return s.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/　/g, ' ');
}
function hanKanaToZen(s) {
  return s.replace(/([ｦ-ﾟ]ﾞ?ﾟ?)|[ｦ-ﾟ]/g, (m) => HALF_KANA[m] || (HALF_KANA[m[0]] ? HALF_KANA[m[0]] + (m[1] || '') : m));
}

function applyOp(s, step) {
  switch (step.op) {
    case 'trim': return s.trim();
    case 'collapseSpaces': return s.replace(/[\s　]+/g, ' ').trim();
    case 'removeSpaces': return s.replace(/[\s　]+/g, '');
    case 'zen2han': return zenToHan(s);
    case 'han2zenKana': return hanKanaToZen(s);
    case 'removeCommas': return s.replace(/,/g, '');
    case 'digitsOnly': return s.replace(/[^0-9.\-]/g, '');
    case 'upper': return s.toUpperCase();
    case 'lower': return s.toLowerCase();
    case 'replace': {
      const find = step.find ?? '';
      if (find === '') return s;
      if (step.regex) { try { return s.replace(new RegExp(find, 'g'), step.repl ?? ''); } catch { return s; } }
      return s.split(find).join(step.repl ?? '');
    }
    case 'slice': {
      const start = step.start | 0;
      const len = step.len === '' || step.len == null ? undefined : (step.len | 0);
      return len == null ? s.slice(start) : s.substr(start, len);
    }
    case 'prefix': return (step.text ?? '') + s;
    case 'suffix': return s + (step.text ?? '');
    default: return s;
  }
}

/** 正規化操作列を順に適用 */
export function applyNormalize(value, ops = []) {
  let s = value == null ? '' : String(value);
  for (const step of ops) s = applyOp(s, step);
  return s;
}
