// ワークフローB: ラベル設計(ひな形作成)
//  テンプレPDFを読み込み、項目を絶対座標(mm)で配置し、文字/図形/Code128/QR・計算/桁を設定して保存。
import { el, clear, icon, toast, confirmDialog, openModal, download } from '../util/dom.js';
import { Store } from '../store.js';
import { newLabel, newElement, ELEMENT_TYPES, elementTitle } from '../label/model.js';
import { createEditorCanvas } from './editorCanvas.js';
import { renderElementInspector } from './inspector.js';
import { fileToBase64, getTemplatePageSizes } from '../label/render.js';
import { composite, exportLabel, makeFilename } from '../label/export.js';
import { parseClipboard } from '../data/parse.js';
import { resolveFields } from '../data/binding.js';
import { selectInput, segmented, numberInput, labeledField, textInput, emptyState } from './components.js';

export function renderStepB(root, app) {
  if (app.editingLabel) renderDesigner(root, app);
  else renderList(root, app);
}

/** B/Cプレビュー用の値: 紐づけのサンプルデータがあれば実値、無ければ［項目名］のプレースホルダ */
export function getPreviewValues(binding) {
  const values = {};
  if (!binding) return values;
  let resolved = {};
  if (binding.sampleData) {
    try { resolved = resolveFields(binding, parseClipboard(binding.sampleData, binding.parseMode === 'auto' ? undefined : binding.parseMode, binding.delim), 0).values; } catch { /* noop */ }
  }
  for (const f of binding.fields) {
    const v = resolved[f.key];
    values[f.key] = v && v !== '' ? v : `［${f.label}］`;
  }
  return values;
}

// ---------------------------------------------------------------- 一覧
function renderList(root, app) {
  const list = Store.labels.list();
  const c = el('div', { class: 'container' });
  c.appendChild(el('div', { class: 'page-head' }, [
    el('h1', { text: 'B. ラベル設計' }),
    el('p', { text: 'テンプレートPDFを読み込み、Aで作った項目を配置してひな形を作ります。元PDFは編集せず、文字や図形を上塗りします。' }),
  ]));
  c.appendChild(el('div', { class: 'row row--between mb-4' }, [
    el('div', { class: 'muted small', text: `保存済み: ${list.length}件` }),
    el('button', { class: 'btn btn--primary', onClick: () => startNew(app) }, [icon('plus'), '新規作成']),
  ]));

  if (!list.length) {
    c.appendChild(el('div', { class: 'card' }, [emptyState({
      icon: '🎨', title: 'ラベルのひな形を作りましょう',
      desc: 'テンプレートPDF(なければ白紙)に、項目や図形・バーコードを配置します。',
      action: el('button', { class: 'btn btn--primary btn--lg', onClick: () => startNew(app) }, [icon('plus'), '最初のラベルを作る']),
    })]));
  } else {
    const grid = el('div', { class: 'preset-grid' });
    for (const lb of list) {
      const thumb = el('div', { class: 'preset-thumb' });
      renderThumb(thumb, lb);
      grid.appendChild(el('div', { class: 'preset-card' }, [
        thumb,
        el('div', { class: 'preset-card__name', text: lb.name || '(無題)' }),
        el('div', { class: 'preset-card__meta', text: `${lb.page.widthMm}×${lb.page.heightMm}mm ・ ${lb.output.format.toUpperCase()} ・ 要素${lb.elements.length}` }),
        el('div', { class: 'row row--end gap-2' }, [
          el('button', { class: 'btn btn--ghost btn--sm', onClick: () => duplicate(lb, app) }, [icon('copy', 16), '複製']),
          el('button', { class: 'btn btn--danger btn--sm', onClick: () => remove(lb, app) }, [icon('trash', 16)]),
          el('button', { class: 'btn btn--secondary btn--sm', onClick: () => app.openRun(lb.id) }, [icon('run', 16), '使う']),
          el('button', { class: 'btn btn--secondary btn--sm', onClick: () => app.openLabelDesigner(structuredClone(lb)) }, '編集'),
        ]),
      ]));
    }
    c.appendChild(grid);
  }
  root.appendChild(c);
}

async function renderThumb(host, label) {
  try {
    const binding = label.bindingPresetId ? Store.bindings.get(label.bindingPresetId) : null;
    const canvas = await composite(label, getPreviewValues(binding), 72, false);
    const img = el('img', { src: canvas.toDataURL('image/png') });
    clear(host); host.appendChild(img);
  } catch { host.textContent = '🏷️'; }
}

function startNew(app) { app.openLabelDesigner(newLabel()); }
function duplicate(lb, app) { const copy = structuredClone(lb); copy.id = null; copy.name = lb.name + ' のコピー'; Store.labels.upsert(copy); toast('複製しました', 'success'); app.render(); }
async function remove(lb, app) { if (await confirmDialog(`「${lb.name}」を削除します。よろしいですか？`, { okLabel: '削除' })) { Store.labels.remove(lb.id); toast('削除しました'); app.render(); } }

// ---------------------------------------------------------------- デザイナー
function renderDesigner(root, app) {
  const label = app.editingLabel;
  let selectedId = null;
  let dirty = false;
  const markDirty = () => { dirty = true; };

  const binding = () => (label.bindingPresetId ? Store.bindings.get(label.bindingPresetId) : null);

  const wrap = el('div', { class: 'designer' });
  const left = el('div', { class: 'designer__col designer__left' });
  const stage = el('div', { class: 'designer__stage' });
  const right = el('div', { class: 'designer__col designer__right inspector' });
  wrap.append(left, stage, right);
  root.appendChild(wrap);

  // --- キャンバス ---
  const canvas = createEditorCanvas({
    getLabel: () => label,
    getValues: () => getPreviewValues(binding()),
    getSelectedId: () => selectedId,
    onSelect: (id) => selectAndRefresh(id),
    onChange: () => { markDirty(); refreshInspector(); refreshLayers(); },
  });
  canvas.onDelete((id) => deleteElement(id));
  canvas.onDuplicate((id) => duplicateElement(id));

  // --- ステージ・ツールバー ---
  const zoomReadout = el('span', { class: 'zoom-readout', text: '100%' });
  canvas.onZoomChange((z) => { zoomReadout.textContent = Math.round(z * 100) + '%'; });
  const toolbar = el('div', { class: 'stage-toolbar' }, [
    el('button', { class: 'btn btn--ghost btn--sm', onClick: () => back() }, '← 一覧へ'),
    el('div', { class: 'spacer' }),
    el('button', { class: 'icon-btn', title: '縮小', onClick: () => canvas.setZoom(canvas.getZoom() - 0.1) }, '－'),
    zoomReadout,
    el('button', { class: 'icon-btn', title: '拡大', onClick: () => canvas.setZoom(canvas.getZoom() + 0.1) }, '＋'),
    el('button', { class: 'btn btn--ghost btn--sm', onClick: () => fitZoom() }, '全体表示'),
    el('div', { class: 'spacer' }),
    el('button', { class: 'btn btn--ghost btn--sm', onClick: () => openPreview() }, [icon('run', 16), 'プレビュー']),
    el('button', { class: 'btn btn--primary', onClick: () => save() }, [icon('save'), '保存']),
  ]);
  stage.append(toolbar, canvas.element);

  // --- 左: ラベル設定 / 要素追加 / 項目 ---
  function refreshLeft() {
    clear(left);
    // ラベル設定
    const settings = el('div', { class: 'panel col gap-3' });
    settings.appendChild(el('h4', { text: 'ラベル設定' }));
    settings.appendChild(labeledField('ラベル名', textInput({ value: label.name, placeholder: '例: 出荷ラベル A', sm: true, oninput: (v) => { label.name = v; markDirty(); } })));
    const bindings = Store.bindings.list();
    settings.appendChild(labeledField('紐づけプリセット', selectInput({
      value: label.bindingPresetId || '',
      options: [{ value: '', label: '— なし(固定テキストのみ) —' }, ...bindings.map((b) => ({ value: b.id, label: b.name }))],
      sm: true,
      onchange: (v) => { label.bindingPresetId = v || null; markDirty(); refreshFields(); refreshInspector(); canvas.refreshOverlay(); },
    }), bindings.length ? '配置した項目にこのルールでデータが入ります。' : 'まず A でデータ紐づけを作成してください。'));

    // テンプレート
    const tplRow = el('div', { class: 'col gap-2' });
    if (label.template) {
      tplRow.appendChild(el('div', { class: 'row gap-2' }, [el('span', { class: 'badge badge--ok', text: 'PDF' }), el('span', { class: 'small grow', style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, text: label.template.name }), el('button', { class: 'icon-btn icon-btn--danger', title: 'テンプレ解除', onClick: () => { label.template = null; markDirty(); canvas.layout(); refreshLeft(); } }, [icon('trash', 16)])]));
      if (label.template.numPages > 1) {
        tplRow.appendChild(labeledField('使用ページ', selectInput({ value: String(label.template.pageIndex || 0), options: Array.from({ length: label.template.numPages }, (_, i) => ({ value: String(i), label: `${i + 1}ページ目` })), sm: true, onchange: (v) => { label.template.pageIndex = +v; applyTemplatePageSize(); markDirty(); canvas.layout(); } })));
      }
    }
    tplRow.appendChild(el('label', { class: 'btn btn--ghost btn--sm btn--block' }, [
      icon('download', 16), label.template ? 'テンプレを差し替え' : 'テンプレPDFを読み込む',
      el('input', { type: 'file', accept: 'application/pdf', class: 'hidden', onChange: (e) => loadTemplate(e.target.files[0]) }),
    ]));
    settings.appendChild(labeledField('テンプレート', tplRow));

    // ページサイズ
    if (!label.template) {
      settings.appendChild(el('div', { class: 'coord-grid' }, [
        labeledField('幅(mm)', numberInput({ value: label.page.widthMm, min: 1, step: 1, oninput: (v) => { label.page.widthMm = +v || 1; markDirty(); canvas.layout(); } })),
        labeledField('高さ(mm)', numberInput({ value: label.page.heightMm, min: 1, step: 1, oninput: (v) => { label.page.heightMm = +v || 1; markDirty(); canvas.layout(); } })),
      ]));
      settings.appendChild(el('div', { class: 'row gap-2 row--wrap' }, presetSizes.map((p) => el('button', { class: 'btn btn--ghost btn--sm', onClick: () => { label.page.widthMm = p.w; label.page.heightMm = p.h; markDirty(); canvas.layout(); refreshLeft(); } }, p.label))));
    } else {
      settings.appendChild(el('div', { class: 'hint', text: `ページサイズ: ${label.page.widthMm}×${label.page.heightMm}mm (テンプレに追従)` }));
    }

    // 出力
    settings.appendChild(labeledField('出力形式', segmented({ value: label.output.format, options: [{ value: 'pdf', label: 'PDF' }, { value: 'png', label: 'PNG' }], onchange: (v) => { label.output.format = v; markDirty(); } })));
    settings.appendChild(labeledField('解像度', selectInput({ value: String(label.output.dpi), options: [{ value: '150', label: '150 dpi (軽い)' }, { value: '300', label: '300 dpi (印刷標準)' }, { value: '600', label: '600 dpi (高精細)' }], sm: true, onchange: (v) => { label.output.dpi = +v; markDirty(); } })));
    settings.appendChild(el('label', { class: 'row gap-2 small', style: { cursor: 'pointer' } }, [el('input', { type: 'checkbox', ...(label.showTemplate ? { checked: true } : {}), onchange: (e) => { label.showTemplate = e.target.checked; markDirty(); canvas.refreshBackground(); } }), 'テンプレを表示']));
    left.appendChild(settings);

    // 要素を追加
    const pal = el('div', { class: 'palette' });
    for (const t of ELEMENT_TYPES) pal.appendChild(el('button', { onClick: () => addElement(t.type), title: t.label }, [icon(t.icon, 22), el('span', { text: t.label.replace(/\(.*\)/, '') })]));
    left.appendChild(el('div', { class: 'panel' }, [el('h4', { text: '要素を追加' }), pal]));

    // 項目(ドラッグ配置)
    const fieldsHost = el('div', { class: 'field-chips' });
    left.appendChild(el('div', { class: 'panel' }, [el('h4', { text: '項目(ドラッグで配置)' }), fieldsHost]));
    refreshFieldsImpl = () => {
      clear(fieldsHost);
      const b = binding();
      if (!b || !b.fields.length) { fieldsHost.appendChild(el('span', { class: 'field-empty', text: '紐づけプリセットを選ぶと項目が出ます。' })); return; }
      for (const f of b.fields) {
        const chip = el('span', { class: 'chip', draggable: 'true', dataset: { key: f.key } }, [icon('text', 14), f.label]);
        chip.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/field', f.key));
        chip.addEventListener('click', () => addElement('text', f.key)); // クリックでも中央に追加
        fieldsHost.appendChild(chip);
      }
    };
    refreshFieldsImpl();
  }
  let refreshFieldsImpl = () => {};
  const refreshFields = () => refreshFieldsImpl();

  // --- 右: レイヤ + インスペクタ ---
  const layersHost = el('div', { class: 'panel' });
  const inspHost = el('div', { class: 'inspector grow' });
  right.append(layersHost, inspHost);

  function refreshLayers() {
    clear(layersHost);
    layersHost.appendChild(el('h4', { text: `レイヤ (${label.elements.length})` }));
    const list = el('div', { class: 'layers' });
    // 上にあるものを上に表示
    [...label.elements].reverse().forEach((elm) => {
      const idx = label.elements.indexOf(elm);
      list.appendChild(el('div', { class: 'layer' + (elm.id === selectedId ? ' is-selected' : ''), onClick: () => selectAndRefresh(elm.id) }, [
        el('span', { class: 'layer__icon' }, [icon(ELEMENT_TYPES.find((t) => t.type === elm.type)?.icon || 'rect', 16)]),
        el('span', { class: 'layer__title', text: elementTitle(elm, binding()) }),
        el('button', { class: 'icon-btn', title: '前面へ', onClick: (e) => { e.stopPropagation(); moveZ(idx, +1); } }, [icon('up', 15)]),
        el('button', { class: 'icon-btn', title: '背面へ', onClick: (e) => { e.stopPropagation(); moveZ(idx, -1); } }, [icon('down', 15)]),
        el('button', { class: 'icon-btn icon-btn--danger', title: '削除', onClick: (e) => { e.stopPropagation(); deleteElement(elm.id); } }, [icon('trash', 15)]),
      ]));
    });
    if (!label.elements.length) list.appendChild(el('div', { class: 'field-empty', text: '左の「要素を追加」または項目チップから配置します。' }));
    layersHost.appendChild(list);
  }

  function refreshInspector() {
    clear(inspHost);
    const elm = label.elements.find((x) => x.id === selectedId);
    if (!elm) { inspHost.appendChild(el('div', { class: 'panel' }, [el('div', { class: 'field-empty', text: '要素を選ぶと、ここで詳しく設定できます。' })])); return; }
    inspHost.appendChild(el('div', { class: 'panel', style: { paddingBottom: 0 } }, [el('div', { class: 'row row--between' }, [el('h4', { text: '選択中の要素', style: { margin: 0 } }), el('button', { class: 'btn btn--ghost btn--sm', onClick: () => duplicateElement(elm.id) }, [icon('copy', 15), '複製'])])]));
    renderElementInspector(inspHost, { element: elm, binding: binding(), getValues: () => getPreviewValues(binding()), onChange: () => { markDirty(); canvas.refreshOverlay(); canvas.refreshBoxes(); } });
  }

  // --- 操作 ---
  function selectAndRefresh(id) { selectedId = id; canvas.refreshBoxes(); refreshLayers(); refreshInspector(); }
  function addElement(type, fieldKey) {
    const elm = newElement(type, label.page);
    if (fieldKey) { elm.fieldKey = fieldKey; elm.staticText = ''; }
    label.elements.push(elm); markDirty();
    selectAndRefresh(elm.id); canvas.refreshOverlay();
  }
  function deleteElement(id) {
    label.elements = label.elements.filter((x) => x.id !== id);
    if (selectedId === id) selectedId = null;
    markDirty(); canvas.refreshOverlay(); canvas.refreshBoxes(); refreshLayers(); refreshInspector();
  }
  function duplicateElement(id) {
    const src = label.elements.find((x) => x.id === id); if (!src) return;
    const copy = structuredClone(src); copy.id = 'el_' + Math.random().toString(36).slice(2, 9);
    copy.x += 2; copy.y += 2; label.elements.push(copy); markDirty();
    selectAndRefresh(copy.id); canvas.refreshOverlay();
  }
  function moveZ(idx, dir) {
    const ni = idx + dir; if (ni < 0 || ni >= label.elements.length) return;
    const arr = label.elements;[arr[idx], arr[ni]] = [arr[ni], arr[idx]]; markDirty();
    canvas.refreshOverlay(); refreshLayers();
  }

  // ドロップでフィールド配置
  canvas.stackEl.addEventListener('dragover', (e) => e.preventDefault());
  canvas.stackEl.addEventListener('drop', (e) => {
    const key = e.dataTransfer.getData('text/field');
    if (!key) return;
    e.preventDefault();
    const pos = canvas.clientToMm(e.clientX, e.clientY);
    const elm = newElement('text', label.page);
    elm.fieldKey = key; elm.staticText = '';
    elm.x = Math.max(0, pos.x); elm.y = Math.max(0, pos.y);
    label.elements.push(elm); markDirty(); selectAndRefresh(elm.id); canvas.refreshOverlay();
  });

  async function loadTemplate(file) {
    if (!file) return;
    try {
      const dataB64 = await fileToBase64(file);
      const { numPages, sizes } = await getTemplatePageSizes(dataB64);
      label.template = { name: file.name, dataB64, pageIndex: 0, numPages };
      label.page.widthMm = Math.round(sizes[0].widthMm * 10) / 10;
      label.page.heightMm = Math.round(sizes[0].heightMm * 10) / 10;
      markDirty(); canvas.layout(); refreshLeft();
      toast('テンプレートを読み込みました', 'success');
    } catch (e) { console.error(e); toast('PDFの読み込みに失敗しました', 'error'); }
  }
  function applyTemplatePageSize() {
    getTemplatePageSizes(label.template.dataB64).then(({ sizes }) => {
      const s = sizes[label.template.pageIndex] || sizes[0];
      label.page.widthMm = Math.round(s.widthMm * 10) / 10; label.page.heightMm = Math.round(s.heightMm * 10) / 10;
      canvas.layout();
    });
  }

  function fitZoom() {
    const avail = stage.clientWidth - 80;
    const z = avail / (label.page.widthMm * (96 / 25.4));
    canvas.setZoom(z);
  }

  async function openPreview() {
    const body = el('div', { class: 'col gap-3' }, [el('div', { class: 'run-preview' }, [el('div', { class: 'muted', text: '生成中…' })])]);
    const m = openModal({ title: '出力プレビュー(サンプルデータ)', width: 720, body, actions: [{ label: '閉じる', kind: 'ghost', onClick: () => {} }] });
    try {
      const dpi = Math.min(label.output.dpi, 200);
      const c = await composite(label, getPreviewValues(binding()), dpi, true);
      clear(body);
      body.appendChild(el('div', { class: 'run-preview' }, [el('img', { src: c.toDataURL('image/png') })]));
      body.appendChild(el('div', { class: 'row row--end' }, [
        el('button', { class: 'btn btn--secondary', onClick: () => testOutput() }, [icon('download'), `テスト出力(${label.output.format.toUpperCase()})`]),
      ]));
    } catch (e) { clear(body); body.appendChild(el('p', { class: 'small', text: 'プレビュー生成に失敗: ' + e.message })); }
  }
  async function testOutput() {
    try { const { blob, ext } = await exportLabel(label, getPreviewValues(binding()), {}); download(blob, makeFilename(label, 'sample') + '.' + ext); toast('テスト出力しました', 'success'); }
    catch (e) { toast('出力に失敗: ' + e.message, 'error'); }
  }

  function back() { if (dirty) { confirmDialog('保存していない変更があります。一覧に戻ると失われます。', { okLabel: '破棄して戻る' }).then((ok) => { if (ok) app.closeLabelDesigner(); }); } else app.closeLabelDesigner(); }

  function save() {
    if (!label.name.trim()) { toast('ラベル名を入力してください', 'warn'); return; }
    if (Store.labels.nameExists(label.name.trim(), label.id)) { toast('同じ名前のラベルが既にあります', 'warn'); return; }
    label.name = label.name.trim();
    const saved = Store.labels.upsert(label);
    app.editingLabel = saved; dirty = false;
    toast('保存しました', 'success');
  }

  // 初期描画
  refreshLeft();
  refreshLayers();
  refreshInspector();
  requestAnimationFrame(() => fitZoom());
}

const presetSizes = [
  { label: 'A4', w: 210, h: 297 },
  { label: 'A6', w: 105, h: 148 },
  { label: 'はがき', w: 100, h: 148 },
  { label: '名刺', w: 91, h: 55 },
  { label: '横長ラベル', w: 70, h: 38 },
];
