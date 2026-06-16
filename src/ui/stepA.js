// ワークフローA: データ紐づけ
//  ①貼り付け → ②項目名に紐づけ(+正規化) → ③プリセット保存
// ルール(項目名・取得元・正規化)はデータの中身に依存せず保存され、再利用できる。
import { el, clear, icon, toast, confirmDialog, uid } from '../util/dom.js';
import { Store } from '../store.js';
import { parseClipboard, sourceOptions, sourceToValue, valueToSource } from '../data/parse.js';
import { resolveFields } from '../data/binding.js';
import { NORMALIZE_OPS } from '../util/normalize.js';
import { labeledField, textInput, selectInput, segmented, pasteArea, emptyState, stepBlock, expander } from './components.js';

function newBinding() {
  return { id: null, name: '', parseMode: 'auto', sampleData: '', fields: [] };
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
    el('p', { text: '社内Webの表をコピー&貼り付けし、各項目に「項目名」を付けて紐づけます。中身が変わってもルール(項目名)は同じまま再利用できます。' }),
  ]));
  c.appendChild(el('div', { class: 'row row--between mb-4' }, [
    el('div', { class: 'muted small', text: `保存済み: ${list.length}件` }),
    el('button', { class: 'btn btn--primary', onClick: () => app.openBindingEditor(newBinding()) }, [icon('plus'), '新規作成']),
  ]));

  if (!list.length) {
    c.appendChild(el('div', { class: 'card' }, [emptyState({
      icon: '🔗', title: 'まずはデータ紐づけルールを作りましょう',
      desc: '社内Webの表をコピーして貼り付け、項目名を付けるだけ。ここで作ったルールが B(設計) と C(作成) の土台になります。',
      action: el('button', { class: 'btn btn--primary btn--lg', onClick: () => app.openBindingEditor(newBinding()) }, [icon('plus'), '最初のルールを作る']),
    })]));
  } else {
    const grid = el('div', { class: 'preset-grid' });
    for (const b of list) {
      grid.appendChild(el('div', { class: 'preset-card' }, [
        el('div', { class: 'preset-card__name', text: b.name || '(無題)' }),
        el('div', { class: 'preset-card__meta', text: `項目 ${b.fields.length} / 更新 ${new Date(b.updatedAt).toLocaleString('ja-JP')}` }),
        el('div', { class: 'field-chips' }, b.fields.slice(0, 8).map((f) => el('span', { class: 'chip chip--ghost', text: f.label }))),
        el('div', { class: 'row row--end gap-2 mt-2' }, [
          el('button', { class: 'btn btn--ghost btn--sm', onClick: () => duplicate(b, app) }, [icon('copy', 16), '複製']),
          el('button', { class: 'btn btn--danger btn--sm', onClick: () => remove(b, app) }, [icon('trash', 16)]),
          el('button', { class: 'btn btn--secondary btn--sm', onClick: () => app.openBindingEditor(structuredClone(b)) }, '編集'),
        ]),
      ]));
    }
    c.appendChild(grid);
  }
  root.appendChild(c);
}

function duplicate(b, app) {
  const copy = structuredClone(b); copy.id = null; copy.name = b.name + ' のコピー';
  Store.bindings.upsert(copy); toast('複製しました', 'success'); app.render();
}
async function remove(b, app) {
  if (await confirmDialog(`「${b.name}」を削除します。よろしいですか？`, { okLabel: '削除' })) {
    Store.bindings.remove(b.id); toast('削除しました'); app.render();
  }
}

// ---------------------------------------------------------------- エディタ
function renderEditor(root, app) {
  const b = app.editingBinding;
  let parsed = parseClipboard(b.sampleData || '', b.parseMode === 'auto' ? undefined : b.parseMode);
  let recordIndex = 0;

  const c = el('div', { class: 'container' });
  const body = el('div', { class: 'col gap-5' });
  c.appendChild(el('div', { class: 'row row--between page-head' }, [
    el('div', {}, [el('h1', { text: app.editingBinding.id ? 'データ紐づけを編集' : 'データ紐づけを新規作成' })]),
    el('button', { class: 'btn btn--ghost', onClick: () => app.closeBindingEditor() }, '← 一覧へ'),
  ]));
  c.appendChild(body);
  root.appendChild(c);

  function reparse() {
    parsed = parseClipboard(b.sampleData || '', b.parseMode === 'auto' ? undefined : b.parseMode);
    if (recordIndex >= parsed.recordCount) recordIndex = 0;
  }

  function render() {
    clear(body);

    // 名前
    body.appendChild(el('div', { class: 'card card__pad' }, [
      labeledField('このルールの名前', textInput({ value: b.name, placeholder: '例: 出荷指示データ', oninput: (v) => { b.name = v; } }), '保存して B/C から呼び出すときの名前です。'),
    ]));

    // ① 貼り付け
    const ta = pasteArea({ value: b.sampleData, onData: (text) => { b.sampleData = text; reparse(); renderDataPart(); } });
    const dataPart = el('div', { class: 'col gap-4 mt-3' });
    body.appendChild(el('div', { class: 'card card__pad' }, [
      stepBlock('1', 'データを貼り付け', el('div', { class: 'col gap-3' }, [
        el('p', { class: 'small muted', text: '社内Web上で Ctrl+A → Ctrl+C でコピーし、下の枠に Ctrl+V で貼り付けます。表はタブ区切りとして自動解釈されます。' }),
        ta, dataPart,
      ])),
    ]));

    function renderDataPart() {
      clear(dataPart);
      if (!parsed.rows) { dataPart.appendChild(el('div', { class: 'muted small', text: 'まだデータがありません。' })); return; }
      // モード切替
      dataPart.appendChild(el('div', { class: 'row row--wrap gap-4' }, [
        labeledField('データの形', segmented({
          value: b.parseMode,
          options: [
            { value: 'auto', label: `自動(${labelOfMode(parsed.mode)})` },
            { value: 'table', label: '表' },
            { value: 'keyvalue', label: '項目:値' },
            { value: 'matrix', label: 'セル' },
          ],
          onchange: (v) => { b.parseMode = v; reparse(); renderDataPart(); render2(); },
        })),
        parsed.mode === 'table' && parsed.recordCount > 1
          ? labeledField('プレビュー対象の行', selectInput({
            value: String(recordIndex),
            options: parsed.records.map((_, i) => ({ value: String(i), label: `${i + 1}行目` })),
            onchange: (v) => { recordIndex = +v; render2(); },
          }))
          : null,
      ]));
      // グリッドプレビュー
      dataPart.appendChild(gridPreview(parsed));
    }
    renderDataPart();

    // ② 項目紐づけ
    const fieldsHost = el('div', { class: 'col gap-3' });
    const part2 = el('div', { class: 'card card__pad' }, [
      stepBlock('2', '項目名を付けて紐づける', el('div', { class: 'col gap-3' }, [
        el('div', { class: 'row row--wrap gap-2' }, [
          el('button', { class: 'btn btn--secondary btn--sm', onClick: autofillFields }, [icon('plus', 16), 'データから項目を自動作成']),
          el('button', { class: 'btn btn--ghost btn--sm', onClick: addField }, [icon('plus', 16), '項目を1つ追加']),
        ]),
        fieldsHost,
      ])),
    ]);
    body.appendChild(part2);

    function render2() { renderDataPart(); renderFields(); }

    function renderFields() {
      clear(fieldsHost);
      if (!b.fields.length) {
        fieldsHost.appendChild(el('div', { class: 'field-empty', text: 'まだ項目がありません。「自動作成」が手早いです。' }));
        return;
      }
      const opts = [{ value: '', label: '— 取得元を選択 —' }, { value: 'fixed', label: '固定値(データに依存しない)' }, ...sourceOptions(parsed)];
      const { values, meta } = resolveFields(b, parsed, recordIndex);
      const existingKeys = new Set(b.fields.map((f) => f.key));

      for (const f of b.fields) {
        const m = meta[f.key] || {};
        const preview = values[f.key];
        const sourceVal = f.source && f.source.type === 'fixed' ? 'fixed' : sourceToValue(f.source);
        const srcSelect = selectInput({
          value: sourceVal || '', options: opts, sm: true,
          onchange: (v) => {
            if (v === 'fixed') f.source = { type: 'fixed', value: f.source?.value || '' };
            else f.source = valueToSource(v);
            render2();
          },
        });
        const fixedInput = f.source?.type === 'fixed'
          ? textInput({ value: f.source.value || '', placeholder: '固定で入れる値', sm: true, oninput: (v) => { f.source.value = v; render2(); } })
          : null;

        const row = el('div', { class: 'card', style: { background: 'var(--surface-2)', borderRadius: 'var(--r)' } }, [
          el('div', { class: 'card__pad', style: { padding: 'var(--sp-3) var(--sp-4)' } }, [
            el('div', { class: 'row gap-3 row--wrap' }, [
              el('div', { class: 'field grow', style: { minWidth: '160px' } }, [
                el('label', { text: '項目名' }),
                textInput({
                  value: f.label, placeholder: '例: 品番 / 金額', sm: true,
                  oninput: (v) => { f.label = v; }, // keyは初回生成後は固定(参照名の安定性)
                }),
                el('div', { class: 'hint mono', text: `式での参照名: ${f.key}` }),
              ]),
              el('div', { class: 'field grow', style: { minWidth: '180px' } }, [
                el('label', { text: 'データの取得元' }), srcSelect, fixedInput,
              ]),
              el('div', { class: 'field', style: { minWidth: '160px', flex: '1' } }, [
                el('label', { text: 'プレビュー(正規化後)' }),
                el('div', { class: 'preview-value' + (preview === '' ? ' muted' : '') }, [preview === '' ? '(空)' : preview]),
                f.source && !m.matched && f.source.type !== 'fixed'
                  ? el('span', { class: 'badge badge--warn mt-2', text: '⚠ 取得元が見つかりません' })
                  : (preview !== '' ? el('span', { class: 'badge badge--ok mt-2', text: '✓ OK' }) : null),
              ]),
              el('button', { class: 'icon-btn icon-btn--danger', title: '削除', onClick: () => { b.fields = b.fields.filter((x) => x !== f); render2(); } }, [icon('trash', 18)]),
            ]),
            normalizeEditor(f, () => render2()),
          ]),
        ]);
        fieldsHost.appendChild(row);
      }
    }

    function addField() {
      const keys = new Set(b.fields.map((f) => f.key));
      const label = `項目${b.fields.length + 1}`;
      b.fields.push({ key: makeKey(label, keys), label, source: null, normalize: [] });
      render2();
    }
    function autofillFields() {
      reparse();
      const keys = new Set(b.fields.map((f) => f.key));
      let added = 0;
      const sources = parsed.mode === 'table' && parsed.headers ? parsed.headers.map((h) => ({ label: h, source: { type: 'header', name: h } }))
        : parsed.mode === 'keyvalue' ? parsed.kv.map((x) => ({ label: x.key, source: { type: 'key', name: x.key } }))
        : [];
      if (!sources.length) { toast('自動作成できる項目が見つかりません。データの形を確認してください。', 'warn'); return; }
      for (const s of sources) {
        if (b.fields.some((f) => f.label === s.label)) continue;
        b.fields.push({ key: makeKey(s.label, keys), label: s.label, source: s.source, normalize: [] });
        keys.add(b.fields[b.fields.length - 1].key);
        added++;
      }
      toast(`${added}件の項目を作成しました`, 'success');
      render2();
    }
    renderFields();

    // ③ 保存
    body.appendChild(el('div', { class: 'flow-actions' }, [
      el('div', { class: 'muted small', text: `${b.fields.length}項目` }),
      el('div', { class: 'spacer' }),
      el('button', { class: 'btn btn--ghost', onClick: () => app.closeBindingEditor() }, 'キャンセル'),
      el('button', { class: 'btn btn--primary btn--lg', onClick: save }, [icon('save'), 'プリセットとして保存']),
    ]));
  }

  function save() {
    if (!b.name.trim()) { toast('名前を入力してください', 'warn'); return; }
    if (!b.fields.length) { toast('項目を1つ以上作成してください', 'warn'); return; }
    if (Store.bindings.nameExists(b.name.trim(), b.id)) { toast('同じ名前のルールが既にあります', 'warn'); return; }
    b.name = b.name.trim();
    const saved = Store.bindings.upsert(b);
    app.editingBinding = saved;
    toast('保存しました', 'success');
    app.render();
  }

  render();
}

// ---- 小物 ----
function labelOfMode(m) { return m === 'table' ? '表' : m === 'keyvalue' ? '項目:値' : 'セル'; }

function gridPreview(parsed) {
  const wrap = el('div', { class: 'tablewrap' });
  const table = el('table', { class: 'grid' });
  const maxRows = Math.min(parsed.grid.length, 12);
  const tbody = el('tbody');
  for (let r = 0; r < maxRows; r++) {
    const tr = el('tr', parsed.mode === 'table' && r === 0 ? { style: { fontWeight: '700' } } : {});
    tr.appendChild(el('td', { class: 'rownum', text: String(r + 1) }));
    for (let cIdx = 0; cIdx < parsed.cols; cIdx++) {
      tr.appendChild(el('td', { text: parsed.grid[r][cIdx] ?? '' }));
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  if (parsed.grid.length > maxRows) wrap.appendChild(el('div', { class: 'xs muted', style: { padding: '6px 9px' }, text: `…ほか ${parsed.grid.length - maxRows} 行` }));
  return wrap;
}

/** 正規化操作の編集(段階的開示: 折りたたみ) */
function normalizeEditor(field, onChange) {
  const list = el('div', { class: 'col gap-2' });
  function renderList() {
    clear(list);
    field.normalize = field.normalize || [];
    field.normalize.forEach((step, idx) => {
      const def = NORMALIZE_OPS.find((o) => o.op === step.op);
      const argInputs = [];
      if (def?.args?.includes('find')) argInputs.push(textInput({ value: step.find || '', placeholder: '検索', sm: true, oninput: (v) => { step.find = v; onChange(); } }));
      if (def?.args?.includes('repl')) argInputs.push(textInput({ value: step.repl || '', placeholder: '置換後', sm: true, oninput: (v) => { step.repl = v; onChange(); } }));
      if (def?.args?.includes('regex')) {
        const cb = el('label', { class: 'row gap-2 small' }, [el('input', { type: 'checkbox', ...(step.regex ? { checked: true } : {}), onchange: (e) => { step.regex = e.target.checked; onChange(); } }), '正規表現']);
        argInputs.push(cb);
      }
      if (def?.args?.includes('text')) argInputs.push(textInput({ value: step.text || '', placeholder: '文字', sm: true, oninput: (v) => { step.text = v; onChange(); } }));
      if (def?.args?.includes('start')) argInputs.push(textInput({ value: step.start ?? '', placeholder: '開始', sm: true, oninput: (v) => { step.start = v === '' ? '' : parseInt(v, 10) || 0; onChange(); } }));
      if (def?.args?.includes('len')) argInputs.push(textInput({ value: step.len ?? '', placeholder: '長さ', sm: true, oninput: (v) => { step.len = v; onChange(); } }));

      list.appendChild(el('div', { class: 'row gap-2 row--wrap', style: { alignItems: 'center' } }, [
        el('span', { class: 'badge badge--muted', text: String(idx + 1) }),
        selectInput({ value: step.op, sm: true, options: NORMALIZE_OPS.map((o) => ({ value: o.op, label: o.label })), onchange: (v) => { step.op = v; onChange(); } }),
        ...argInputs,
        el('button', { class: 'icon-btn icon-btn--danger', title: '削除', onClick: () => { field.normalize.splice(idx, 1); onChange(); } }, [icon('trash', 16)]),
      ]));
    });
    list.appendChild(el('button', {
      class: 'btn btn--ghost btn--sm', style: { alignSelf: 'flex-start' },
      onClick: () => { field.normalize.push({ op: 'trim' }); onChange(); },
    }, [icon('plus', 16), '正規化ステップを追加']));
  }
  renderList();
  const count = (field.normalize || []).length;
  return el('div', { class: 'mt-2' }, [expander(`正規化(整える)${count ? ` ・${count}ステップ` : ''}`, list, false)]);
}
