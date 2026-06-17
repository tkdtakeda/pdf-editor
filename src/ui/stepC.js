// ワークフローC: ラベル作成(日常運用)
//  ①使用ラベル選択 → ②データ貼り付け → ③項目に応じて自動上書き → ④出力
import { el, clear, icon, toast, download } from '../util/dom.js';
import { Store } from '../store.js';
import { parseClipboard } from '../data/parse.js';
import { resolveFields } from '../data/binding.js';
import { composite, exportLabel, exportPDFBatch, makeFilename } from '../label/export.js';
import { pasteArea, segmented, selectInput, emptyState } from './components.js';

export function renderStepC(root, app) {
  const label = app.runLabelId ? Store.labels.get(app.runLabelId) : null;
  if (!label) renderPicker(root, app);
  else renderRun(root, app, label);
}

// ---------------------------------------------------------------- ラベル選択
function renderPicker(root, app) {
  const labels = Store.labels.list();
  const c = el('div', { class: 'container' });
  c.appendChild(el('div', { class: 'page-head' }, [
    el('h1', { text: 'C. ラベル作成' }),
    el('p', { text: '使うラベルを選び、社内Webのデータを貼り付けて出力します。日々の作業はこの画面だけで完結します。' }),
  ]));
  if (!labels.length) {
    c.appendChild(el('div', { class: 'card' }, [emptyState({
      icon: '🏷️', title: 'まだラベルがありません',
      desc: '先に B(ラベル設計) でひな形を作成してください。',
      action: el('button', { class: 'btn btn--primary btn--lg', onClick: () => app.go('B') }, 'ラベル設計へ'),
    })]));
  } else {
    const grid = el('div', { class: 'preset-grid' });
    for (const lb of labels) {
      const thumb = el('div', { class: 'preset-thumb' });
      composite(lb, previewPlaceholders(lb), 72, false).then((cv) => { thumb.appendChild(el('img', { src: cv.toDataURL('image/png') })); }).catch(() => { thumb.textContent = '🏷️'; });
      grid.appendChild(el('div', { class: 'preset-card', style: { cursor: 'pointer' }, onClick: () => app.openRun(lb.id) }, [
        thumb,
        el('div', { class: 'preset-card__name', text: lb.name }),
        el('div', { class: 'preset-card__meta', text: bindingName(lb) }),
        el('button', { class: 'btn btn--primary btn--block', onClick: () => app.openRun(lb.id) }, [icon('run', 16), 'このラベルを使う']),
      ]));
    }
    c.appendChild(grid);
  }
  root.appendChild(c);
}

function bindingName(lb) {
  if (!lb.bindingPresetId) return '固定内容のみ';
  const b = Store.bindings.get(lb.bindingPresetId);
  return b ? `紐づけ: ${b.name}` : '紐づけ: (見つかりません)';
}
function previewPlaceholders(lb) {
  const b = lb.bindingPresetId ? Store.bindings.get(lb.bindingPresetId) : null;
  const v = {}; if (b) for (const f of b.fields) v[f.key] = `［${f.label}］`; return v;
}

// ---------------------------------------------------------------- 実行
function renderRun(root, app, label) {
  const binding = label.bindingPresetId ? Store.bindings.get(label.bindingPresetId) : null;
  let pasteText = '';
  let parsed = parseClipboard('', binding && binding.parseMode !== 'auto' ? binding.parseMode : undefined, binding && binding.delim);
  let recordIndex = 0;
  let fmt = label.output.format;
  let dpi = label.output.dpi;

  const c = el('div', { class: 'container container--wide' });
  c.appendChild(el('div', { class: 'row row--between page-head' }, [
    el('div', {}, [el('h1', { text: label.name }), el('p', { class: 'muted small', text: bindingName(label) })]),
    el('button', { class: 'btn btn--ghost', onClick: () => { app.runLabelId = null; app.go('C'); } }, '← ラベル一覧へ'),
  ]));

  const left = el('div', { class: 'col gap-4' });
  const right = el('div', { class: 'col gap-4' });
  c.appendChild(el('div', { class: 'two-pane' }, [left, right]));
  root.appendChild(c);

  // 左: データ貼り付け + 値一覧
  const recordHost = el('div');
  const kvHost = el('div', { class: 'kv-list' });
  const ta = pasteArea({
    onData: (text) => { pasteText = text; reparse(); recordIndex = 0; refreshData(); schedulePreview(); },
  });
  left.appendChild(el('div', { class: 'card card__pad col gap-3' }, [
    el('div', { class: 'row gap-2' }, [el('span', { class: 'step-block__num', text: '2' }), el('h3', { class: 'card__title', text: 'データを貼り付け' })]),
    binding ? el('p', { class: 'small muted', text: '社内Web上で Ctrl+A → Ctrl+C し、ここに Ctrl+V で貼り付けます。' }) : el('p', { class: 'small', text: 'このラベルは紐づけが未設定のため、固定内容のみで出力されます。' }),
    binding ? ta : null,
    recordHost,
  ]));
  if (binding) left.appendChild(el('div', { class: 'card card__pad col gap-2' }, [
    el('div', { class: 'row gap-2' }, [el('span', { class: 'step-block__num', text: '3' }), el('h3', { class: 'card__title', text: '項目に上書きされる内容' })]),
    kvHost,
  ]));

  // 右: プレビュー + 出力
  const previewHost = el('div', { class: 'run-preview' }, [el('div', { class: 'muted', text: 'プレビュー' })]);
  const outActions = el('div', { class: 'col gap-3' });
  right.appendChild(el('div', { class: 'card card__pad col gap-3' }, [
    el('div', { class: 'row row--between' }, [el('h3', { class: 'card__title', text: 'プレビュー' }), el('div', { class: 'row gap-2' }, [
      segmented({ value: fmt, options: [{ value: 'pdf', label: 'PDF' }, { value: 'png', label: 'PNG' }], onchange: (v) => { fmt = v; refreshOut(); } }),
      selectInput({ value: String(dpi), sm: true, options: [{ value: '150', label: '150dpi' }, { value: '300', label: '300dpi' }, { value: '600', label: '600dpi' }], onchange: (v) => { dpi = +v; } }),
    ])]),
    previewHost,
    outActions,
  ]));

  function reparse() { parsed = parseClipboard(pasteText, binding && binding.parseMode !== 'auto' ? binding.parseMode : (binding ? undefined : 'matrix'), binding && binding.delim); if (recordIndex >= parsed.recordCount) recordIndex = 0; }

  function currentValues() { return binding ? resolveFields(binding, parsed, recordIndex).values : {}; }

  function refreshData() {
    clear(recordHost);
    if (binding && parsed.mode === 'table' && parsed.recordCount > 1) {
      recordHost.appendChild(el('div', { class: 'field mt-2' }, [
        el('label', { class: 'field-label', text: `データが ${parsed.recordCount} 件あります。出力する行:` }),
        selectInput({ value: String(recordIndex), options: parsed.records.map((_, i) => ({ value: String(i), label: `${i + 1}行目: ${Object.values(parsed.records[i])[0] || ''}` })), onchange: (v) => { recordIndex = +v; refreshKv(); schedulePreview(); refreshOut(); } }),
      ]));
    }
    refreshKv();
    refreshOut();
  }

  function refreshKv() {
    if (!binding) return;
    clear(kvHost);
    const { values, meta } = resolveFields(binding, parsed, recordIndex);
    for (const f of binding.fields) {
      const v = values[f.key];
      const m = meta[f.key] || {};
      kvHost.appendChild(el('div', { class: 'kv-row' }, [
        el('div', { class: 'kv-k' }, [el('span', { class: 'badge badge--bind', text: '項目' }), f.label]),
        el('div', { class: 'kv-v' + (v === '' ? ' is-empty' : '') }, v === '' ? (m.matched ? '(空)' : '未取得') : v),
      ]));
    }
  }

  // プレビュー(デバウンス)
  let previewTimer = null;
  function schedulePreview() { clearTimeout(previewTimer); previewTimer = setTimeout(renderPreview, 250); }
  async function renderPreview() {
    try {
      const cv = await composite(label, currentValues(), Math.min(dpi, 150), true);
      clear(previewHost); previewHost.appendChild(el('img', { src: cv.toDataURL('image/png') }));
    } catch (e) { clear(previewHost); previewHost.appendChild(el('div', { class: 'small', text: 'プレビュー失敗: ' + e.message })); }
  }

  function refreshOut() {
    clear(outActions);
    const multi = binding && parsed.mode === 'table' && parsed.recordCount > 1;
    outActions.appendChild(el('button', { class: 'btn btn--primary btn--lg btn--block', onClick: () => outputOne() }, [icon('download'), `この内容を出力 (${fmt.toUpperCase()})`]));
    if (multi) {
      outActions.appendChild(el('button', { class: 'btn btn--secondary btn--block', onClick: () => outputAll() }, [icon('download', 16), `全 ${parsed.recordCount} 件を一括出力`]));
      outActions.appendChild(el('div', { class: 'hint', text: 'PDFは1つの複数ページPDFに、PNGは1枚ずつダウンロードします。' }));
    }
  }

  async function outputOne() {
    try {
      const { blob, ext } = await exportLabel(label, currentValues(), { format: fmt, dpi });
      download(blob, makeFilename(label) + '.' + ext);
      toast('出力しました', 'success');
    } catch (e) { console.error(e); toast('出力に失敗: ' + e.message, 'error'); }
  }

  async function outputAll() {
    const valuesList = parsed.records.map((_, i) => resolveFields(binding, parsed, i).values);
    try {
      if (fmt === 'pdf') {
        const blob = await exportPDFBatch(label, valuesList, dpi);
        download(blob, makeFilename(label, `${valuesList.length}件`) + '.pdf');
      } else {
        for (let i = 0; i < valuesList.length; i++) {
          const { blob } = await exportLabel(label, valuesList[i], { format: 'png', dpi });
          download(blob, makeFilename(label, String(i + 1).padStart(3, '0')) + '.png');
          await new Promise((r) => setTimeout(r, 200));
        }
      }
      toast(`${valuesList.length}件を出力しました`, 'success');
    } catch (e) { console.error(e); toast('一括出力に失敗: ' + e.message, 'error'); }
  }

  refreshData();
  renderPreview();
}
