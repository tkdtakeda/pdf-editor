// 貼り付けデータの解析。
// 社内データは「位置で意味が決まる(不定形)」ことがあるため、まず2次元グリッドに分解し、
// ユーザーが表(Excelライク)上でセルを選んで項目に紐づけられるようにする。
// 区切り文字(列/行)は変更可能(タブ/カンマ/セミコロン/コロン/空白/任意)。

export const COL_DELIMS = [
  { value: 'tab', label: 'タブ' },
  { value: 'comma', label: 'カンマ ,' },
  { value: 'semicolon', label: 'セミコロン ;' },
  { value: 'colon', label: 'コロン :' },
  { value: 'space', label: '空白' },
  { value: 'custom', label: '任意…' },
];
export const ROW_DELIMS = [
  { value: 'newline', label: '改行(Enter)' },
  { value: 'semicolon', label: 'セミコロン ;' },
  { value: 'comma', label: 'カンマ ,' },
  { value: 'custom', label: '任意…' },
];

export const DEFAULT_DELIM = { col: 'tab', row: 'newline', colCustom: '', rowCustom: '' };

function rowSplitter(delim) {
  switch (delim?.row) {
    case 'semicolon': return (t) => t.split(';');
    case 'comma': return (t) => t.split(',');
    case 'custom': return (t) => (delim.rowCustom ? t.split(delim.rowCustom) : [t]);
    case 'newline':
    default: return (t) => t.split(/\r\n?|\n/);
  }
}
function colSplitter(delim) {
  switch (delim?.col) {
    case 'comma': return (line) => line.split(',');
    case 'semicolon': return (line) => line.split(';');
    case 'colon': return (line) => line.split(':');
    case 'space': return (line) => line.split(/[ \t　]+/);
    case 'custom': return (line) => (delim.colCustom ? line.split(delim.colCustom) : [line]);
    case 'tab':
    default: return (line) => line.split('\t');
  }
}

/** テキスト → 2次元グリッド(行×セル) */
function toGrid(text, delim) {
  const raw = String(text || '');
  if (raw.trim() === '') return [];
  const splitRows = rowSplitter(delim);
  const splitCols = colSplitter(delim);
  let rows = splitRows(raw);
  // 末尾の空行を除去
  while (rows.length && rows[rows.length - 1].trim() === '') rows.pop();
  return rows.map((line) => splitCols(line));
}

/** 列名 0→A, 1→B, ... 25→Z, 26→AA */
export function colName(n) {
  let s = '';
  n += 1;
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
/** セル参照 (r,c) → "B3" */
export function cellRef(r, c) { return `${colName(c)}${r + 1}`; }

/** モード推定(自動作成や複数レコード判定の補助。不定形データでは matrix になりやすい) */
function detectMode(grid) {
  if (grid.length === 0) return 'matrix';
  const colCounts = grid.map((r) => r.length);
  const maxCols = Math.max(...colCounts);
  const consistent = colCounts.filter((c) => c === maxCols).length / grid.length >= 0.6;
  if (maxCols >= 3) return consistent ? 'table' : 'matrix';
  if (maxCols === 2) { if (!consistent) return 'matrix'; return grid.length >= 3 ? 'table' : 'keyvalue'; }
  return 'matrix';
}

/**
 * 解析結果。
 * @param text 貼り付け文字列
 * @param forcedMode 'table'|'keyvalue'|'matrix'|undefined(自動)
 * @param delim {col,row,colCustom,rowCustom}
 */
export function parseClipboard(text, forcedMode, delim = DEFAULT_DELIM) {
  const grid = toGrid(text, delim);
  const rows = grid.length;
  const cols = grid.reduce((m, r) => Math.max(m, r.length), 0);
  const mode = forcedMode || detectMode(grid);

  let headers = null, records = [], kv = [];
  if (mode === 'table' && rows >= 1) {
    headers = (grid[0] || []).map((h, i) => (h.trim() || `列${i + 1}`));
    records = grid.slice(1).map((row) => { const o = {}; headers.forEach((h, i) => { o[h] = row[i] ?? ''; }); return o; });
    if (records.length === 0) records = [Object.fromEntries(headers.map((h) => [h, '']))];
  } else if (mode === 'keyvalue') {
    kv = grid.map((r) => ({ key: (r[0] || '').trim(), value: r[1] ?? '' })).filter((x) => x.key !== '');
  }
  const recordCount = mode === 'table' ? Math.max(1, records.length) : 1;
  return { raw: text, grid, rows, cols, mode, headers, records, kv, recordCount };
}

/** 紐づけ先候補(自動作成や代替指定用) */
export function sourceOptions(parsed) {
  const opts = [];
  if (parsed.mode === 'table' && parsed.headers) for (const h of parsed.headers) opts.push({ value: 'h:' + h, label: `列「${h}」`, source: { type: 'header', name: h } });
  else if (parsed.mode === 'keyvalue') for (const { key } of parsed.kv) opts.push({ value: 'k:' + key, label: `項目「${key}」`, source: { type: 'key', name: key } });
  for (let r = 0; r < parsed.grid.length; r++) for (let c = 0; c < parsed.grid[r].length; c++) {
    const preview = (parsed.grid[r][c] || '').slice(0, 12);
    opts.push({ value: `c:${r}:${c}`, label: `${cellRef(r, c)}${preview ? ` (${preview})` : ''}`, source: { type: 'cell', r, c } });
  }
  return opts;
}

export function sourceToValue(source) {
  if (!source) return '';
  if (source.type === 'header') return 'h:' + source.name;
  if (source.type === 'key') return 'k:' + source.name;
  if (source.type === 'cell') return `c:${source.r}:${source.c}`;
  if (source.type === 'fixed') return 'fixed';
  return '';
}
export function valueToSource(value) {
  if (!value) return null;
  if (value.startsWith('h:')) return { type: 'header', name: value.slice(2) };
  if (value.startsWith('k:')) return { type: 'key', name: value.slice(2) };
  if (value.startsWith('c:')) { const [, r, c] = value.split(':'); return { type: 'cell', r: +r, c: +c }; }
  return null;
}
