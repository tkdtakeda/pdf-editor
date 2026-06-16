// 永続化レイヤ。すべてブラウザ内(localStorage)に保存し、社内データを外部に送らない。
//  - bindings: ワークフローA(データ紐づけルール)のプリセット
//  - labels:   ワークフローB(ラベルひな形)のプリセット
//  - settings: アプリ設定(最後に開いた画面など)
import { uid } from './util/dom.js';

const KEYS = {
  bindings: 'labelmaker.bindings.v1',
  labels: 'labelmaker.labels.v1',
  settings: 'labelmaker.settings.v1',
};

function read(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (e) {
    console.error('保存に失敗', e);
    return false;
  }
}

function makeCollection(key) {
  return {
    list() {
      const arr = read(key, []);
      return arr.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    },
    get(id) { return read(key, []).find((x) => x.id === id) || null; },
    upsert(obj) {
      const arr = read(key, []);
      const now = Date.now();
      if (!obj.id) { obj.id = uid(key.includes('binding') ? 'bind' : 'label'); obj.createdAt = now; }
      obj.updatedAt = now;
      const idx = arr.findIndex((x) => x.id === obj.id);
      if (idx >= 0) arr[idx] = obj; else arr.push(obj);
      write(key, arr);
      return obj;
    },
    remove(id) {
      write(key, read(key, []).filter((x) => x.id !== id));
    },
    /** 名前の重複チェック(自分自身は除外) */
    nameExists(name, exceptId) {
      return read(key, []).some((x) => x.name === name && x.id !== exceptId);
    },
  };
}

export const Store = {
  bindings: makeCollection(KEYS.bindings),
  labels: makeCollection(KEYS.labels),

  getSettings() { return read(KEYS.settings, {}); },
  setSetting(k, v) { const s = read(KEYS.settings, {}); s[k] = v; write(KEYS.settings, s); },

  /** すべてのプリセットをJSONへ(バックアップ/配布用)。テンプレPDFも内包される。 */
  exportAll() {
    return JSON.stringify({
      kind: 'labelmaker-export',
      version: 1,
      exportedAt: new Date().toISOString(),
      bindings: read(KEYS.bindings, []),
      labels: read(KEYS.labels, []),
    }, null, 2);
  },

  /** JSONから取り込み。mode: 'merge'(ID重複は上書き) | 'replace'(全置換) */
  importAll(json, mode = 'merge') {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    if (data.kind !== 'labelmaker-export') throw new Error('対応していないファイル形式です');
    if (mode === 'replace') {
      write(KEYS.bindings, data.bindings || []);
      write(KEYS.labels, data.labels || []);
      return;
    }
    for (const kind of ['bindings', 'labels']) {
      const cur = read(KEYS[kind], []);
      const map = new Map(cur.map((x) => [x.id, x]));
      for (const item of data[kind] || []) map.set(item.id, item);
      write(KEYS[kind], Array.from(map.values()));
    }
  },
};
