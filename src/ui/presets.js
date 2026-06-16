// 管理画面: プリセットの一覧・複製・削除、JSONでのバックアップ/配布(エクスポート/インポート)。
import { el, clear, icon, toast, confirmDialog, download, openModal } from '../util/dom.js';
import { Store } from '../store.js';

export function renderManage(root, app) {
  const c = el('div', { class: 'container' });
  c.appendChild(el('div', { class: 'page-head' }, [
    el('h1', { text: '管理' }),
    el('p', { text: 'プリセットのバックアップ・配布や、削除を行います。すべてのデータはこのブラウザ内にのみ保存されます。' }),
  ]));

  c.appendChild(el('div', { class: 'card card__pad col gap-3 mb-4' }, [
    el('h3', { class: 'card__title', text: 'バックアップ / 配布' }),
    el('p', { class: 'small muted', text: '紐づけルールとラベル(テンプレPDFを含む)をJSONにまとめます。他のPCへ配布したり、設定の引き継ぎに使えます。' }),
    el('div', { class: 'row gap-2 row--wrap' }, [
      el('button', { class: 'btn btn--secondary', onClick: exportAll }, [icon('download'), 'すべてエクスポート']),
      el('label', { class: 'btn btn--ghost' }, ['JSONをインポート', el('input', { type: 'file', accept: 'application/json,.json', class: 'hidden', onChange: (e) => importFile(e.target.files[0], app) })]),
    ]),
  ]));

  c.appendChild(collection('紐づけルール (A)', Store.bindings, (b) => `項目 ${b.fields.length}`, (b) => app.openBindingEditor(structuredClone(b)), app));
  c.appendChild(collection('ラベル (B)', Store.labels, (l) => `${l.page.widthMm}×${l.page.heightMm}mm ・ 要素${l.elements.length}`, (l) => app.openLabelDesigner(structuredClone(l)), app, true));

  root.appendChild(c);
}

function collection(title, store, metaFn, onEdit, app, isLabel) {
  const list = store.list();
  const host = el('div', { class: 'card card__pad col gap-2 mb-4' }, [el('h3', { class: 'card__title', text: `${title} ・ ${list.length}件` })]);
  if (!list.length) { host.appendChild(el('div', { class: 'field-empty', text: 'まだありません。' })); return host; }
  for (const item of list) {
    host.appendChild(el('div', { class: 'row row--between', style: { padding: '8px 0', borderBottom: '1px solid var(--line)' } }, [
      el('div', { class: 'col', style: { gap: '2px' } }, [el('span', { class: 'strong', text: item.name || '(無題)' }), el('span', { class: 'xs muted', text: `${metaFn(item)} ・ 更新 ${new Date(item.updatedAt).toLocaleString('ja-JP')}` })]),
      el('div', { class: 'row gap-2' }, [
        isLabel ? el('button', { class: 'btn btn--ghost btn--sm', onClick: () => app.openRun(item.id) }, '使う') : null,
        el('button', { class: 'btn btn--secondary btn--sm', onClick: () => onEdit(item) }, '編集'),
        el('button', { class: 'btn btn--danger btn--sm', onClick: async () => { if (await confirmDialog(`「${item.name}」を削除しますか？`, { okLabel: '削除' })) { store.remove(item.id); toast('削除しました'); app.render(); } } }, [icon('trash', 16)]),
      ]),
    ]));
  }
  return host;
}

function exportAll() {
  const json = Store.exportAll();
  download(new Blob([json], { type: 'application/json' }), `labelmaker_backup_${new Date().toISOString().slice(0, 10)}.json`);
  toast('エクスポートしました', 'success');
}

async function importFile(file, app) {
  if (!file) return;
  const text = await file.text();
  openModal({
    title: 'インポート方法',
    width: 440,
    body: el('p', { class: 'muted', text: '取り込み方法を選んでください。「置き換え」は現在のデータをすべて削除します。' }),
    actions: [
      { label: 'キャンセル', kind: 'ghost', onClick: () => {} },
      { label: '追加(マージ)', kind: 'primary', onClick: () => doImport(text, 'merge', app) },
      { label: '全置き換え', kind: 'danger', onClick: () => doImport(text, 'replace', app) },
    ],
  });
}
function doImport(text, mode, app) {
  try { Store.importAll(text, mode); toast('インポートしました', 'success'); app.render(); }
  catch (e) { toast('インポート失敗: ' + e.message, 'error'); }
}
