// 紐づけ解決: 紐づけプリセット(ルール) × 解析済みデータ → 項目値。
// ルールは「ヘッダ名 / 項目キー / セル位置」で値を取り出すため、データの中身が
// 変わってもルールは不変(= 同じ項目名で再利用できる)。
import { applyNormalize } from '../util/normalize.js';

/** 1フィールドの生値をデータから取り出す */
function extractRaw(source, parsed, recordIndex) {
  if (!source) return { value: '', matched: false };
  switch (source.type) {
    case 'fixed':
      return { value: source.value ?? '', matched: true };
    case 'header': {
      if (parsed.mode !== 'table' || !parsed.records) return { value: '', matched: false };
      const rec = parsed.records[recordIndex] || parsed.records[0] || {};
      const has = Object.prototype.hasOwnProperty.call(rec, source.name);
      return { value: has ? rec[source.name] : '', matched: has };
    }
    case 'key': {
      const hit = (parsed.kv || []).find((x) => x.key === source.name);
      return { value: hit ? hit.value : '', matched: !!hit };
    }
    case 'cell': {
      const row = parsed.grid[source.r];
      const v = row ? row[source.c] : undefined;
      return { value: v ?? '', matched: v != null };
    }
    default:
      return { value: '', matched: false };
  }
}

/**
 * 全フィールドを解決。
 * 返り値: { values: {key:string}, meta: {key:{raw, matched, label}} }
 */
export function resolveFields(binding, parsed, recordIndex = 0) {
  const values = {};
  const meta = {};
  for (const f of binding.fields || []) {
    const { value: raw, matched } = extractRaw(f.source, parsed, recordIndex);
    const normalized = applyNormalize(raw, f.normalize || []);
    values[f.key] = normalized;
    meta[f.key] = { raw, matched, label: f.label || f.key };
  }
  return { values, meta };
}

/** 数値スコープ(計算式 expr 用): 各フィールド値を数値化したもの */
export function numericScope(values) {
  const scope = {};
  for (const [k, v] of Object.entries(values)) {
    const n = Number(String(v).replace(/[, ¥$€£円]/g, ''));
    if (!isNaN(n)) scope[k] = n;
  }
  return scope;
}
