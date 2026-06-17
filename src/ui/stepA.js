// ワークフローA: データ紐づけ
//  ①貼り付け(区切り変更可) → ②Excelライクな表でセルを選んで項目に紐づけ(+正規化) → ③保存
// 位置(セル)で取得するため、データの中身が変わっても同じ位置から値を取れる(=ルール不変)。
import { el, clear, icon, toast, confirmDialog } from '../util/dom.js';
import { Store } from '../store.js';
import { parseClipboard, sourceOptions, cellRef, colName, defaultDelim, COL_DELIMS, ROW_DELIMS } from '../data/parse.js';
import { resolveFields } from '../data/binding.js';
import { NORMALIZE_OPS } from '../util/normalize.js';
import { labeledField, textInput, selectInput, segmented, pasteArea, emptyState, stepBlock, expander } from './components.js';

function newBinding() {
  // parseMode='auto': A/B/C で同じ自動判定を使い、解釈のズレを防ぐ(セル指定はモード非依存)
  return { id: null, name: '', parseMode: 'auto', sampleData: '', delim: defaultDelim(), fields: [] };
}
/** 旧形式(col/rowが文字列)を配列形式へ移行 */
function migrateDelim(d) {
  if (!d) return defaultDelim();
  const arr = (x) => (Array.isArray(x) ? x.slice() : (x ? [x] : []));
  return { col: arr(d.col), row: arr(d.row), colCustom: d.colCustom || '', rowCustom: d.rowCustom || '', collapse: d.collapse !== false };
}
function makeKey(label, existingKeys) {
  let base = (label || 'field').trim().replace(/\s+/g, '_').replace(/[^\wぁ-鿿]/g, '') || 'field';
  let k = base, i = 2;
  while (existingKeys.has(k)) k = `${base}_${i++}`;
  return k;
}

export function renderStepA(root, app) {
  if (app.editingBinding) renderEditor(root, app);
  else renderList(root, app);
}

// ---------------------------------------------------------------- 一覧
function renderList(root, app) {
  const list = Store.bindings.list();
  const c = el('div', { class: 'container' });
  c.appendChild(el('div', { class: 'page-head' }, [
    el('h1', { text: 'A. データ紐づけ' }),
    el('p', { text: '社内データをコピー&貼り付けし、表のセルを選んで項目名に紐づけます。位置で取得するので、中身が変わっても同じルールで使えます。' }),
  ]));
  c.appendChild(el('div', { class: 'row row--between mb-4' }, [
    el('div', { class: 'muted small', text: `保存済み: ${list.length}件` }),
    el('button', { class: 'btn btn--primary', onClick: () => app.openBindingEditor(newBinding()) }, [icon('plus'), '新規作成']),
  ]));
  if (!list.length) {
    c.appendChild(el('div', { class: 'card' }, [emptyState({
      icon: '🔗', title: 'まずはデータ紐づけルールを作りましょう',
      desc: 'データを貼り付け、表のセルをクリックして項目名に割り当てるだけ。ここで作ったルールが B(設計) と C(作成) の土台になります。',
      action: el('button', { class: 'btn btn--primary btn--lg', onClick: () => app.openBindingEditor(newBinding()) }, [icon('plus'), '最初のルールを作る']),
    })]));
  } else {
    const grid = el('div', { class: 'preset-grid' });
    for (const b of list) grid.appendChild(el('div', { class: 'preset-card' }, [
      el('div', { class: 'preset-card__name', text: b.name || '(無題)' }),
      el('div', { class: 'preset-card__meta', text: `項目 ${b.fields.length} / 更新 ${new Date(b.updatedAt).toLocaleString('ja-JP')}` }),
      el('div', { class: 'field-chips' }, b.fields.slice(0, 8).map((f) => el('span', { class: 'chip chip--ghost', text: f.label }))),
      el('div', { class: 'row row--end gap-2 mt-2' }, [
        el('button', { class: 'btn btn--ghost btn--sm', onClick: () => duplicate(b, app) }, [icon('copy', 16), '複製']),
        el('button', { class: 'btn btn--danger btn--sm', onClick: () => remove(b, app) }, [icon('trash', 16)]),
        el('button', { class: 'btn btn--secondary btn--sm', onClick: () => app.openBindingEditor(structuredClone(b)) }, '編集'),
      ]),
    ]));
    c.appendChild(grid);
  }
  root.appendChild(c);
}
function duplicate(b, app) { const copy = structuredClone(b); copy.id = null; copy.name = b.name + ' のコピー'; Store.bindings.upsert(copy); toast('複製しました', 'success'); app.render(); }
async function remove(b, app) { if (await confirmDialog(`「${b.name}」を削除します。よろしいですか？`, { okLabel: '削除' })) { Store.bindings.remove(b.id); toast('削除しました'); app.render(); } }

// ---------------------------------------------------------------- エディタ
function renderEditor(root, app) {
  const b = app.editingBinding;
  b.delim = migrateDelim(b.delim);
  let parsed = parseClipboard(b.sampleData || '', undefined, b.delim);
  let pickFieldKey = null;            // セル選択モード中の項目key
  const previewEls = new Map();       // key -> {valueEl, badgeEl}

  const c = el('div', { class: 'container container--wide' });
  c.appendChild(el('div', { class: 'row row--between page-head' }, [
    el('div', {}, [el('h1', { text: b.id ? 'データ紐づけを編集' : 'データ紐づけを新規作成' })]),
    el('button', { class: 'btn btn--ghost', onClick: () => app.closeBindingEditor() }, '← 一覧へ'),
  ]));
  root.appendChild(c);

  // 名前
  c.appendChild(el('div', { class: 'card card__pad mb-4' }, [
    labeledField('このルールの名前', textInput({ value: b.name, placeholder: '例: 出荷指示データ', oninput: (v) => { b.name = v; } }), '保存して B/C から呼び出すときの名前です。'),
  ]));

  // ① 貼り付け + 区切り
  const gridHost = el('div');
  const ta = pasteArea({ value: b.sampleData, onData: (text) => { b.sampleData = text; onDataChanged(); } });
  c.appendChild(el('div', { class: 'card card__pad mb-4' }, [
    stepBlock('1', 'データを貼り付け', el('div', { class: 'col gap-3' }, [
      el('p', { class: 'small muted', text: '社内データを Ctrl+C でコピーし、下に Ctrl+V で貼り付けます。うまく列が分かれない時は区切り文字を変更してください。' }),
      delimiterControls(),
      ta,
    ])),
  ]));

  // ② 紐づけ(表 + 項目)
  const fieldsHost = el('div', { class: 'col gap-2' });
  const pickBanner = el('div', { class: 'pick-banner hidden' });
  c.appendChild(el('div', { class: 'card card__pad' }, [
    stepBlock('2', '表のセルを項目に紐づけ', el('div', { class: 'col gap-3' }, [
      el('p', { class: 'small muted', text: '項目の「セルを選択」を押し、右の表で対応するセルをクリックします。位置で取得するので、毎回同じ場所から値が入ります。' }),
      pickBanner,
      el('div', { class: 'two-pane' }, [
        el('div', { class: 'col gap-2' }, [
          el('div', { class: 'row row--wrap gap-2' }, [
            el('button', { class: 'btn btn--secondary btn--sm', onClick: autofillFields }, [icon('plus', 16), 'ヘッダ/項目から自動作成']),
            el('button', { class: 'btn btn--ghost btn--sm', onClick: addField }, [icon('plus', 16), '項目を追加']),
          ]),
          fieldsHost,
        ]),
        el('div', {}, [el('div', { class: 'section-title', text: '貼り付けデータ(クリックで選択)' }), gridHost]),
      ]),
    ])),
  ]));

  // ③ 保存
  c.appendChild(el('div', { class: 'flow-actions' }, [
    el('div', { class: 'muted small', text: `${b.fields.length}項目` }),
    el('div', { class: 'spacer' }),
    el('button', { class: 'btn btn--ghost', onClick: () => app.closeBindingEditor() }, 'キャンセル'),
    el('button', { class: 'btn btn--primary btn--lg', onClick: save }, [icon('save'), 'プリセットとして保存']),
  ]));

  // ---- 区切り文字UI(複数選択の組み合わせ) ----
  function delimChips(selected, options, onChange) {
    return options.map((o) => {
      const on = selected.includes(o.value);
      const input = el('input', { type: 'checkbox', ...(on ? { checked: true } : {}), onchange: (e) => {
        if (e.target.checked) { if (!selected.includes(o.value)) selected.push(o.value); }
        else { const i = selected.indexOf(o.value); if (i >= 0) selected.splice(i, 1); }
        lbl.classList.toggle('is-on', e.target.checked);
        onChange();
      } });
      const lbl = el('label', { class: 'delim-chip' + (on ? ' is-on' : '') }, [input, el('span', { text: o.label })]);
      return lbl;
    });
  }
  function delimiterControls() {
    const colCustom = textInput({ value: b.delim.colCustom, placeholder: '任意文字', sm: true, oninput: (v) => { b.delim.colCustom = v; onDataChanged(); } });
    const rowCustom = textInput({ value: b.delim.rowCustom, placeholder: '任意文字', sm: true, oninput: (v) => { b.delim.rowCustom = v; onDataChanged(); } });
    const colCustomWrap = el('div', { class: 'with-unit', style: { width: '120px' } }, [colCustom]);
    const rowCustomWrap = el('div', { class: 'with-unit', style: { width: '120px' } }, [rowCustom]);
    const syncCustom = () => { colCustomWrap.classList.toggle('hidden', !b.delim.col.includes('custom')); rowCustomWrap.classList.toggle('hidden', !b.delim.row.includes('custom')); };
    const onColChange = () => { syncCustom(); onDataChanged(); };
    const onRowChange = () => { syncCustom(); onDataChanged(); };
    const ctrl = el('div', { class: 'col gap-3' }, [
      labeledField('列(横)の区切り — 複数選択で組み合わせ', el('div', { class: 'row row--wrap gap-2' }, [...delimChips(b.delim.col, COL_DELIMS, onColChange), colCustomWrap])),
      labeledField('行(縦)の区切り — 複数選択で組み合わせ', el('div', { class: 'row row--wrap gap-2' }, [...delimChips(b.delim.row, ROW_DELIMS, onRowChange), rowCustomWrap])),
      el('label', { class: 'row gap-2 small', style: { cursor: 'pointer' } }, [
        el('input', { type: 'checkbox', ...(b.delim.collapse !== false ? { checked: true } : {}), onchange: (e) => { b.delim.collapse = e.target.checked; onDataChanged(); } }),
        el('span', { text: '連続する区切りを1つにまとめる（空セルを作らない）' }),
      ]),
    ]);
    syncCustom();
    return ctrl;
  }

  // ---- データ更新 ----
  function reparse() { parsed = parseClipboard(b.sampleData || '', undefined, b.delim); }
  function onDataChanged() { reparse(); renderGrid(); renderFields(); }

  // ---- 表(Excelライク) ----
  function boundCellMap() {
    const map = new Map(); // "r:c" -> [labels]
    for (const f of b.fields) if (f.source && f.source.type === 'cell') {
      const k = `${f.source.r}:${f.source.c}`;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(f.label || f.key);
    }
    return map;
  }
  function renderGrid() {
    clear(gridHost);
    if (!parsed.rows) { gridHost.appendChild(el('div', { class: 'muted small', style: { padding: '12px' }, text: 'データがありません。' })); return; }
    const bound = boundCellMap();
    const wrap = el('div', { class: 'tablewrap' + (pickFieldKey ? ' is-picking' : '') });
    const table = el('table', { class: 'grid grid--pick' });
    // ヘッダ(列名)
    const thead = el('thead');
    const htr = el('tr', {}, [el('th', { class: 'rownum corner' })]);
    for (let cIdx = 0; cIdx < parsed.cols; cIdx++) htr.appendChild(el('th', { text: colName(cIdx) }));
    thead.appendChild(htr); table.appendChild(thead);
    // 本体
    const tbody = el('tbody');
    for (let r = 0; r < parsed.grid.length; r++) {
      const tr = el('tr', {}, [el('td', { class: 'rownum', text: String(r + 1) })]);
      for (let cIdx = 0; cIdx < parsed.cols; cIdx++) {
        const val = parsed.grid[r][cIdx] ?? '';
        const k = `${r}:${cIdx}`;
        const labels = bound.get(k);
        const td = el('td', { class: 'cell' + (labels ? ' is-bound' : ''), dataset: { r, c: cIdx } }, [
          el('span', { class: 'cell__v', text: val }),
          labels ? el('span', { class: 'cell__tag', text: labels.join(', ') }) : null,
        ]);
        td.addEventListener('click', () => onCellClick(r, cIdx));
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    gridHost.appendChild(wrap);
  }
  function onCellClick(r, c) {
    if (!pickFieldKey) { toast('先に項目の「セルを選択」を押してください', 'warn'); return; }
    const f = b.fields.find((x) => x.key === pickFieldKey);
    if (f) { f.source = { type: 'cell', r, c }; }
    setPick(null);
    renderGrid(); renderFields();
  }
  function setPick(key) {
    pickFieldKey = key;
    if (key) {
      const f = b.fields.find((x) => x.key === key);
      pickBanner.className = 'pick-banner';
      clear(pickBanner);
      pickBanner.append(icon('arrow', 16), el('span', { html: `「<b>${f?.label || ''}</b>」に割り当てるセルを表でクリック` }), el('button', { class: 'btn btn--ghost btn--sm', onClick: () => { setPick(null); renderGrid(); renderFields(); } }, 'キャンセル(Esc)'));
    } else { pickBanner.className = 'pick-banner hidden'; }
  }

  // ---- 項目 ----
  function renderFields() {
    clear(fieldsHost); previewEls.clear();
    if (!b.fields.length) { fieldsHost.appendChild(el('div', { class: 'field-empty', text: 'まだ項目がありません。「項目を追加」してから、表のセルを選びます。' })); return; }
    for (const f of b.fields) {
      const isFixed = f.source?.type === 'fixed';
      const cellBtnLabel = f.source?.type === 'cell' ? `📍 ${cellRef(f.source.r, f.source.c)}` : '📍 セルを選択';
      const valueEl = el('div', { class: 'preview-value' });
      const badgeEl = el('span', {});
      previewEls.set(f.key, { valueEl, badgeEl, field: f });

      const srcControl = isFixed
        ? textInput({ value: f.source.value || '', placeholder: '固定で入れる値', sm: true, oninput: (v) => { f.source.value = v; updatePreviews(); } })
        : el('button', { class: 'btn btn--sm ' + (pickFieldKey === f.key ? 'btn--bind' : (f.source?.type === 'cell' ? 'btn--secondary' : 'btn--ghost')), onClick: () => { setPick(pickFieldKey === f.key ? null : f.key); renderGrid(); renderFields(); } }, cellBtnLabel);

      const row = el('div', { class: 'field-card' }, [
        el('div', { class: 'row gap-2 row--wrap', style: { alignItems: 'flex-end' } }, [
          el('div', { class: 'field grow', style: { minWidth: '120px' } }, [el('label', { text: '項目名' }), textInput({ value: f.label, placeholder: '例: 品番', sm: true, oninput: (v) => { f.label = v; } })]),
          el('div', { class: 'field' }, [el('label', { text: '取得方法' }), segmented({ value: isFixed ? 'fixed' : 'cell', options: [{ value: 'cell', label: 'セル' }, { value: 'fixed', label: '固定' }], onchange: (v) => { f.source = v === 'fixed' ? { type: 'fixed', value: '' } : null; if (v === 'cell') setPick(f.key); renderGrid(); renderFields(); } })]),
          el('div', { class: 'field' }, [el('label', { text: isFixed ? '値' : '対応セル' }), srcControl]),
          el('button', { class: 'icon-btn icon-btn--danger', title: '削除', onClick: () => { b.fields = b.fields.filter((x) => x !== f); if (pickFieldKey === f.key) setPick(null); renderGrid(); renderFields(); } }, [icon('trash', 18)]),
        ]),
        el('div', { class: 'row gap-2 mt-2', style: { alignItems: 'center' } }, [el('span', { class: 'xs muted nowrap', text: '結果' }), valueEl, badgeEl]),
        normalizeEditor(f, updatePreviews),
      ]);
      fieldsHost.appendChild(row);
    }
    updatePreviews();
  }
  function updatePreviews() {
    const { values, meta } = resolveFields(b, parsed, 0);
    for (const [key, refs] of previewEls) {
      const v = values[key]; const m = meta[key] || {};
      refs.valueEl.textContent = v === '' ? '(空)' : v;
      refs.valueEl.classList.toggle('muted', v === '');
      clear(refs.badgeEl);
      if (refs.field.source && refs.field.source.type !== 'fixed' && !m.matched) refs.badgeEl.appendChild(el('span', { class: 'badge badge--warn', text: '未取得' }));
      else if (v !== '') refs.badgeEl.appendChild(el('span', { class: 'badge badge--ok', text: 'OK' }));
    }
  }
  function addField() {
    const keys = new Set(b.fields.map((f) => f.key));
    const label = `項目${b.fields.length + 1}`;
    const key = makeKey(label, keys);
    b.fields.push({ key, label, source: null, normalize: [] });
    renderFields(); setPick(key); renderGrid();
  }
  function autofillFields() {
    reparse();
    const keys = new Set(b.fields.map((f) => f.key));
    const sources = parsed.mode === 'table' && parsed.headers ? parsed.headers.map((h) => ({ label: h, source: { type: 'header', name: h } }))
      : parsed.mode === 'keyvalue' ? parsed.kv.map((x) => ({ label: x.key, source: { type: 'key', name: x.key } })) : [];
    if (!sources.length) { toast('自動作成できる項目が見つかりません。セルを手動で選択してください。', 'warn'); return; }
    let added = 0;
    for (const s of sources) { if (b.fields.some((f) => f.label === s.label)) continue; const k = makeKey(s.label, keys); b.fields.push({ key: k, label: s.label, source: s.source, normalize: [] }); keys.add(k); added++; }
    toast(`${added}件の項目を作成しました`, 'success');
    renderFields(); renderGrid();
  }

  function save() {
    if (!b.name.trim()) { toast('名前を入力してください', 'warn'); return; }
    if (!b.fields.length) { toast('項目を1つ以上作成してください', 'warn'); return; }
    if (Store.bindings.nameExists(b.name.trim(), b.id)) { toast('同じ名前のルールが既にあります', 'warn'); return; }
    b.name = b.name.trim();
    app.editingBinding = Store.bindings.upsert(b);
    toast('保存しました', 'success');
    app.render();
  }

  // Escでセル選択キャンセル
  const onKey = (e) => { if (e.key === 'Escape' && pickFieldKey) { setPick(null); renderGrid(); renderFields(); } };
  document.addEventListener('keydown', onKey);
  // 画面離脱時の後始末はAppの再描画でDOMごと消えるため割愛(リスナはDOM参照を保持しない)

  renderGrid();
  renderFields();
}

/** 正規化操作の編集(段階的開示) */
function normalizeEditor(field, onChange) {
  const list = el('div', { class: 'col gap-2' });
  function renderList() {
    clear(list);
    field.normalize = field.normalize || [];
    field.normalize.forEach((step, idx) => {
      const def = NORMALIZE_OPS.find((o) => o.op === step.op);
      const args = [];
      if (def?.args?.includes('find')) args.push(textInput({ value: step.find || '', placeholder: '検索', sm: true, oninput: (v) => { step.find = v; onChange(); } }));
      if (def?.args?.includes('repl')) args.push(textInput({ value: step.repl || '', placeholder: '置換後', sm: true, oninput: (v) => { step.repl = v; onChange(); } }));
      if (def?.args?.includes('regex')) args.push(el('label', { class: 'row gap-2 small' }, [el('input', { type: 'checkbox', ...(step.regex ? { checked: true } : {}), onchange: (e) => { step.regex = e.target.checked; onChange(); } }), '正規表現']));
      if (def?.args?.includes('text')) args.push(textInput({ value: step.text || '', placeholder: '文字', sm: true, oninput: (v) => { step.text = v; onChange(); } }));
      if (def?.args?.includes('start')) args.push(textInput({ value: step.start ?? '', placeholder: '開始', sm: true, oninput: (v) => { step.start = v === '' ? '' : (parseInt(v, 10) || 0); onChange(); } }));
      if (def?.args?.includes('len')) args.push(textInput({ value: step.len ?? '', placeholder: '長さ', sm: true, oninput: (v) => { step.len = v; onChange(); } }));
      list.appendChild(el('div', { class: 'row gap-2 row--wrap', style: { alignItems: 'center' } }, [
        el('span', { class: 'badge badge--muted', text: String(idx + 1) }),
        selectInput({ value: step.op, sm: true, options: NORMALIZE_OPS.map((o) => ({ value: o.op, label: o.label })), onchange: (v) => { step.op = v; renderList(); onChange(); } }),
        ...args,
        el('button', { class: 'icon-btn icon-btn--danger', title: '削除', onClick: () => { field.normalize.splice(idx, 1); renderList(); onChange(); } }, [icon('trash', 16)]),
      ]));
    });
    list.appendChild(el('button', { class: 'btn btn--ghost btn--sm', style: { alignSelf: 'flex-start' }, onClick: () => { field.normalize.push({ op: 'trim' }); renderList(); onChange(); } }, [icon('plus', 16), '正規化を追加']));
  }
  renderList();
  const count = (field.normalize || []).length;
  return el('div', { class: 'mt-2' }, [expander(`正規化(整える)${count ? ` ・${count}` : ''}`, list, false)]);
}
