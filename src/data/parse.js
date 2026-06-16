// 貼り付けデータの解析。
// 社内Webを Ctrl+A → コピー → 貼り付けすると、多くは「タブ区切り(TSV)」になる
// (HTMLの表をコピーするとセル間=タブ, 行間=改行)。これを2次元グリッドに分解し、
// データの形(table / keyvalue / matrix)を推定する。
//
// 重要: 推定はあくまで初期値。ユーザーがUIでモードや紐づけ先を上書きできる。

/** テキスト → 2次元グリッド(行×セル) */
function toGrid(text) {
  const norm = String(text || '').replace(/\r\n?/g, '\n').replace(/\s+$/,'');
  if (norm === '') return [];
  const lines = norm.split('\n');
  // 末尾の空行を除去
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  return lines.map((line) => line.split('\t'));
}

/**
 * モード推定。
 * 注意: 2列×複数行は「表(ヘッダ+データ)」とも「項目:値リスト」とも解釈でき、形だけでは判別不能。
 * 本ツールは複数レコード(=複数ラベル)を扱うため、2列×3行以上は既定で「表」とする。
 * 誤判定時はUIのモード切替で即座に変更できる。
 */
function detectMode(grid) {
  if (grid.length === 0) return 'matrix';
  const colCounts = grid.map((r) => r.length);
  const maxCols = Math.max(...colCounts);
  const consistent = colCounts.filter((c) => c === maxCols).length / grid.length >= 0.6;

  if (maxCols >= 3) return consistent ? 'table' : 'matrix';
  if (maxCols === 2) {
    if (!consistent) return 'matrix';
    return grid.length >= 3 ? 'table' : 'keyvalue';
  }
  return 'matrix'; // 1列のみ
}

/**
 * 解析結果を返す。
 * {
 *   raw, grid, rows, cols, mode,
 *   headers: string[]|null,         // table時: 1行目
 *   records: object[],              // table時: ヘッダ名→値 のレコード配列
 *   kv: {key,value}[],              // keyvalue時
 *   recordCount,                    // 選べるレコード数(複数なら行選択UIを出す)
 * }
 */
export function parseClipboard(text, forcedMode) {
  const grid = toGrid(text);
  const rows = grid.length;
  const cols = grid.reduce((m, r) => Math.max(m, r.length), 0);
  const mode = forcedMode || detectMode(grid);

  let headers = null;
  let records = [];
  let kv = [];

  if (mode === 'table' && rows >= 1) {
    headers = (grid[0] || []).map((h, i) => (h.trim() || `列${i + 1}`));
    records = grid.slice(1).map((row) => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i] ?? ''; });
      return obj;
    });
    if (records.length === 0) {
      // ヘッダしか無い → ヘッダ行自体を1レコード扱いにはしない。空レコードを1つ用意。
      records = [Object.fromEntries(headers.map((h) => [h, '']))];
    }
  } else if (mode === 'keyvalue') {
    kv = grid.map((r) => ({ key: (r[0] || '').trim(), value: r[1] ?? '' })).filter((x) => x.key !== '');
  }

  const recordCount = mode === 'table' ? Math.max(1, records.length) : 1;

  return { raw: text, grid, rows, cols, mode, headers, records, kv, recordCount };
}

/**
 * 紐づけ先の選択肢(UIのドロップダウン用)。
 * 返り値: [{ value, label, source }]
 *   source は binding.js が解釈するソース記述子。
 */
export function sourceOptions(parsed) {
  const opts = [];
  if (parsed.mode === 'table' && parsed.headers) {
    for (const h of parsed.headers) {
      opts.push({ value: 'h:' + h, label: `列「${h}」`, source: { type: 'header', name: h } });
    }
  } else if (parsed.mode === 'keyvalue') {
    for (const { key } of parsed.kv) {
      opts.push({ value: 'k:' + key, label: `項目「${key}」`, source: { type: 'key', name: key } });
    }
  }
  // どのモードでも、セル直接指定は可能にする(位置で取りたいケース)
  for (let r = 0; r < parsed.grid.length; r++) {
    for (let c = 0; c < parsed.grid[r].length; c++) {
      const preview = (parsed.grid[r][c] || '').slice(0, 12);
      opts.push({ value: `c:${r}:${c}`, label: `セル R${r + 1}C${c + 1}${preview ? ` (${preview})` : ''}`, source: { type: 'cell', r, c } });
    }
  }
  return opts;
}

/** ソース記述子 → UIで選択中の value 文字列 */
export function sourceToValue(source) {
  if (!source) return '';
  if (source.type === 'header') return 'h:' + source.name;
  if (source.type === 'key') return 'k:' + source.name;
  if (source.type === 'cell') return `c:${source.r}:${source.c}`;
  if (source.type === 'fixed') return 'fixed';
  return '';
}

/** UIの value 文字列 → ソース記述子 */
export function valueToSource(value) {
  if (!value) return null;
  if (value.startsWith('h:')) return { type: 'header', name: value.slice(2) };
  if (value.startsWith('k:')) return { type: 'key', name: value.slice(2) };
  if (value.startsWith('c:')) { const [, r, c] = value.split(':'); return { type: 'cell', r: +r, c: +c }; }
  return null;
}
