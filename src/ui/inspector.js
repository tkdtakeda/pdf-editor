// 選択要素のインスペクタ(右パネル)。要素を直接編集し、onChange でプレビュー更新。
// 段階的開示: 基本(位置/データ/見た目)は常時、計算・桁などの詳細はアコーディオン。
import { el, clear, icon } from '../util/dom.js';
import { numberInput, selectInput, colorInput, checkbox, segmented, expander, textInput, labeledField } from './components.js';
import { ROUNDING_MODES, applyFormat } from '../util/format.js';
import { validateExpr } from '../util/expr.js';
import { resolveElementText, FONT_FAMILIES } from '../label/model.js';
import { numericScope } from '../data/binding.js';

function miniField(label, control, unit) {
  return el('div', { class: 'mini-field' }, [
    el('label', { text: label }),
    unit ? el('div', { class: 'with-unit' }, [control, el('span', { class: 'unit', text: unit })]) : control,
  ]);
}

export function renderElementInspector(host, { element: elm, binding, getValues, onChange }) {
  clear(host);
  const refresh = () => onChange();

  // ---- 位置・サイズ・回転(絶対座標 mm) ----
  host.appendChild(el('div', { class: 'panel' }, [
    el('h4', { text: '位置とサイズ(mm)' }),
    el('div', { class: 'coord-grid' }, [
      miniField('X', numberInput({ value: elm.x, step: 0.5, oninput: (v) => { elm.x = +v || 0; refresh(); } })),
      miniField('Y', numberInput({ value: elm.y, step: 0.5, oninput: (v) => { elm.y = +v || 0; refresh(); } })),
      miniField('幅 W', numberInput({ value: elm.w, step: 0.5, min: 0, oninput: (v) => { elm.w = +v || 0; refresh(); } })),
      miniField('高さ H', numberInput({ value: elm.h, step: 0.5, min: 0, oninput: (v) => { elm.h = +v || 0; refresh(); } })),
      miniField('回転', numberInput({ value: elm.rotation, step: 1, oninput: (v) => { elm.rotation = +v || 0; refresh(); } }), '°'),
    ]),
  ]));

  // ---- データ(項目連動 / 固定) ----
  if (elm.type === 'text' || elm.type === 'barcode' || elm.type === 'qrcode') {
    const dataPanel = el('div', { class: 'panel' });
    const renderData = () => {
      clear(dataPanel);
      const mode = elm.fieldKey != null ? 'field' : 'static';
      dataPanel.appendChild(el('h4', { text: '内容' }));
      dataPanel.appendChild(segmented({
        value: mode,
        options: [{ value: 'field', label: '項目に連動' }, { value: 'static', label: '固定テキスト' }],
        onchange: (v) => {
          if (v === 'field') elm.fieldKey = (binding?.fields?.[0]?.key) ?? '';
          else elm.fieldKey = null;
          renderData(); refresh();
        },
      }));
      if (mode === 'field') {
        const fields = binding?.fields || [];
        if (!fields.length) {
          dataPanel.appendChild(el('p', { class: 'hint mt-2', text: '紐づけプリセットに項目がありません。左下「ラベル設定」で紐づけプリセットを選んでください。' }));
        } else {
          dataPanel.appendChild(el('div', { class: 'mt-2' }, [labeledField('連動する項目', selectInput({
            value: elm.fieldKey || '',
            options: fields.map((f) => ({ value: f.key, label: f.label })),
            onchange: (v) => { elm.fieldKey = v; refresh(); },
          }), 'C(作成)で貼り付けたデータがここに入ります。')]));
        }
      } else {
        const ta = el('textarea', { class: 'input', rows: elm.type === 'text' ? 3 : 1, style: { fontFamily: 'inherit' }, oninput: (e) => { elm.staticText = e.target.value; refresh(); } });
        ta.value = elm.staticText || '';
        dataPanel.appendChild(el('div', { class: 'mt-2' }, [labeledField('固定テキスト', ta)]));
      }
    };
    renderData();
    host.appendChild(dataPanel);
  }

  // ---- 見た目 ----
  if (elm.type === 'text') host.appendChild(textStylePanel(elm, refresh));
  if (elm.type === 'rect') host.appendChild(rectStylePanel(elm, refresh));
  if (elm.type === 'line') host.appendChild(lineStylePanel(elm, refresh));
  if (elm.type === 'barcode') host.appendChild(barcodeStylePanel(elm, refresh, false));
  if (elm.type === 'qrcode') host.appendChild(barcodeStylePanel(elm, refresh, true));

  // ---- 計算・桁(format) ----
  if (elm.type === 'text' || elm.type === 'barcode' || elm.type === 'qrcode') {
    host.appendChild(el('div', { class: 'panel' }, [formatPanel(elm, binding, getValues, refresh)]));
  }
}

function textStylePanel(elm, refresh) {
  const f = elm.font;
  return el('div', { class: 'panel' }, [
    el('h4', { text: '文字スタイル' }),
    el('div', { class: 'coord-grid' }, [
      miniField('サイズ', numberInput({ value: f.size, min: 1, step: 0.5, oninput: (v) => { f.size = +v || 1; refresh(); } }), 'pt'),
      miniField('行間', numberInput({ value: f.lineHeight, min: 0.8, step: 0.05, oninput: (v) => { f.lineHeight = +v || 1; refresh(); } }), '倍'),
    ]),
    el('div', { class: 'mt-2' }, [labeledField('フォント', selectInput({ value: f.family, options: FONT_FAMILIES, onchange: (v) => { f.family = v; refresh(); } }))]),
    el('div', { class: 'row gap-2 mt-2' }, [
      el('div', { class: 'swatch-row' }, [colorInput({ value: f.color, oninput: (v) => { f.color = v; refresh(); } }), el('span', { class: 'small text-2', text: '色' })]),
      el('div', { class: 'segmented', style: { marginLeft: 'auto' } }, [
        toggleBtn('B', f.bold, () => { f.bold = !f.bold; refresh(); }, { fontWeight: '800' }),
        toggleBtn('I', f.italic, () => { f.italic = !f.italic; refresh(); }, { fontStyle: 'italic' }),
      ]),
    ]),
    el('div', { class: 'mt-2' }, [
      el('label', { class: 'field-label', text: '配置' }),
      el('div', { class: 'row gap-2 mt-2' }, [
        segmented({ value: f.align, options: [{ value: 'left', label: '左' }, { value: 'center', label: '中' }, { value: 'right', label: '右' }], onchange: (v) => { f.align = v; refresh(); } }),
        segmented({ value: f.valign, options: [{ value: 'top', label: '上' }, { value: 'middle', label: '中' }, { value: 'bottom', label: '下' }], onchange: (v) => { f.valign = v; refresh(); } }),
      ]),
    ]),
    el('div', { class: 'mt-3' }, [checkbox({ label: '枠に合わせて自動縮小(はみ出し防止)', checked: elm.autoFit, onchange: (v) => { elm.autoFit = v; refresh(); } })]),
  ]);
}

function rectStylePanel(elm, refresh) {
  const s = elm.shape;
  return el('div', { class: 'panel' }, [
    el('h4', { text: '矩形スタイル' }),
    el('div', { class: 'row gap-3 mt-2' }, [
      checkbox({ label: '塗り', checked: s.fillOn, onchange: (v) => { s.fillOn = v; refresh(); } }),
      colorInput({ value: s.fill, oninput: (v) => { s.fill = v; refresh(); } }),
    ]),
    el('div', { class: 'row gap-3 mt-2' }, [
      checkbox({ label: '枠線', checked: s.strokeOn, onchange: (v) => { s.strokeOn = v; refresh(); } }),
      colorInput({ value: s.stroke, oninput: (v) => { s.stroke = v; refresh(); } }),
    ]),
    el('div', { class: 'coord-grid mt-2' }, [
      miniField('枠線の太さ', numberInput({ value: s.strokeWidth, min: 0, step: 0.1, oninput: (v) => { s.strokeWidth = +v || 0; refresh(); } }), 'mm'),
      miniField('角丸', numberInput({ value: s.radius, min: 0, step: 0.5, oninput: (v) => { s.radius = +v || 0; refresh(); } }), 'mm'),
      miniField('不透明度', numberInput({ value: s.opacity, min: 0, max: 1, step: 0.1, oninput: (v) => { s.opacity = v === '' ? 1 : +v; refresh(); } })),
    ]),
  ]);
}

function lineStylePanel(elm, refresh) {
  const s = elm.shape;
  return el('div', { class: 'panel' }, [
    el('h4', { text: '線スタイル' }),
    el('div', { class: 'row gap-3 mt-2' }, [colorInput({ value: s.stroke, oninput: (v) => { s.stroke = v; refresh(); } }), el('span', { class: 'small text-2', text: '色' })]),
    el('div', { class: 'coord-grid mt-2' }, [
      miniField('太さ', numberInput({ value: s.strokeWidth, min: 0.1, step: 0.1, oninput: (v) => { s.strokeWidth = +v || 0.1; refresh(); } }), 'mm'),
    ]),
    el('p', { class: 'hint mt-2', text: '線はボックスの左上→右下に引かれます。高さHを0にすると水平線、幅Wを0にすると垂直線です。' }),
  ]);
}

function barcodeStylePanel(elm, refresh, isQR) {
  const c = elm.code;
  const children = [
    el('h4', { text: isQR ? 'QRスタイル' : 'バーコードスタイル' }),
    el('div', { class: 'row gap-3 mt-2' }, [colorInput({ value: c.moduleColor, oninput: (v) => { c.moduleColor = v; refresh(); } }), el('span', { class: 'small text-2', text: 'バー/モジュール色' })]),
    el('div', { class: 'row gap-3 mt-2' }, [
      checkbox({ label: '背景塗り', checked: c.bgOn, onchange: (v) => { c.bgOn = v; refresh(); } }),
      colorInput({ value: c.bgColor, oninput: (v) => { c.bgColor = v; refresh(); } }),
    ]),
  ];
  if (isQR) {
    children.push(el('div', { class: 'coord-grid mt-2' }, [
      miniField('誤り訂正', selectInput({ value: c.ecLevel, options: [{ value: 'L', label: 'L (7%)' }, { value: 'M', label: 'M (15%)' }, { value: 'Q', label: 'Q (25%)' }, { value: 'H', label: 'H (30%)' }], onchange: (v) => { c.ecLevel = v; refresh(); } })),
      miniField('余白(モジュール)', numberInput({ value: c.quietZone, min: 0, step: 1, oninput: (v) => { c.quietZone = +v || 0; refresh(); } })),
    ]));
    children.push(el('p', { class: 'hint mt-2', text: '日本語などのUTF-8文字も格納できます。' }));
  } else {
    children.push(el('div', { class: 'mt-2' }, [checkbox({ label: '値を下に表示', checked: c.showText, onchange: (v) => { c.showText = v; refresh(); } })]));
    children.push(el('p', { class: 'hint mt-2', text: 'Code128。半角英数記号が対象です(日本語は不可)。' }));
  }
  return el('div', { class: 'panel' }, children);
}

function formatPanel(elm, binding, getValues, refresh) {
  const fmt = elm.format;
  const body = el('div', { class: 'col gap-3' });
  const fieldKeys = (binding?.fields || []).map((f) => f.key);

  const previewLine = el('div', { class: 'preview-value' });
  function updatePreview() {
    const values = getValues();
    const out = resolveElementText(elm, values);
    previewLine.textContent = out === '' ? '(空)' : out;
    previewLine.classList.toggle('muted', out === '');
  }

  const exprInput = textInput({
    value: fmt.calcExpr, placeholder: '例: value * 1.1   /   qty * unit_price', sm: true,
    oninput: (v) => {
      fmt.calcExpr = v;
      const res = validateExpr(v, ['value', ...fieldKeys]);
      exprInput.classList.toggle('is-invalid', v.trim() !== '' && !res.ok);
      refresh(); updatePreview();
    },
  });

  body.appendChild(checkbox({ label: '計算・桁の整形を有効にする', checked: fmt.enabled, onchange: (v) => { fmt.enabled = v; renderRest(); refresh(); updatePreview(); } }));

  const rest = el('div', { class: 'col gap-3' });
  function renderRest() {
    clear(rest);
    if (!fmt.enabled) return;
    rest.appendChild(labeledField('計算式(任意)', exprInput, `この要素の値は value、他項目は参照名(${fieldKeys.slice(0, 4).join(', ') || 'なし'}…)で参照できます。`));
    rest.appendChild(el('div', { class: 'coord-grid' }, [
      miniField('小数桁', numberInput({ value: fmt.decimals, min: 0, max: 8, step: 1, oninput: (v) => { fmt.decimals = +v || 0; refresh(); updatePreview(); } })),
      miniField('丸め方', selectInput({ value: fmt.rounding, options: ROUNDING_MODES, onchange: (v) => { fmt.rounding = v; refresh(); updatePreview(); } })),
    ]));
    rest.appendChild(el('div', { class: 'coord-grid' }, [
      miniField('ゼロ埋め桁', numberInput({ value: fmt.padLen, min: 0, step: 1, oninput: (v) => { fmt.padLen = +v || 0; refresh(); updatePreview(); } })),
      miniField('埋め文字', textInput({ value: fmt.padChar, sm: true, oninput: (v) => { fmt.padChar = v || '0'; refresh(); updatePreview(); } })),
    ]));
    rest.appendChild(el('div', { class: 'coord-grid' }, [
      miniField('接頭', textInput({ value: fmt.prefix, sm: true, oninput: (v) => { fmt.prefix = v; refresh(); updatePreview(); } })),
      miniField('接尾', textInput({ value: fmt.suffix, sm: true, oninput: (v) => { fmt.suffix = v; refresh(); updatePreview(); } })),
    ]));
    rest.appendChild(el('div', { class: 'row gap-4' }, [
      checkbox({ label: '3桁区切り', checked: fmt.useThousands, onchange: (v) => { fmt.useThousands = v; refresh(); updatePreview(); } }),
      checkbox({ label: '末尾0を消す', checked: fmt.trimZeros, onchange: (v) => { fmt.trimZeros = v; refresh(); updatePreview(); } }),
    ]));
    rest.appendChild(labeledField('プレビュー', previewLine));
    updatePreview();
  }
  renderRest();
  body.appendChild(rest);

  return el('div', {}, [el('h4', { text: '計算・桁あわせ' }), body]);
}

function toggleBtn(label, active, onClick, style) {
  return el('button', { class: active ? 'is-active' : '', style, onClick }, label);
}
