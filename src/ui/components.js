// 共有フォーム部品。一貫した見た目・挙動で「一度学べば各所で使える」状態にする(consistency)。
import { el } from '../util/dom.js';

export function labeledField(labelText, control, hint) {
  return el('div', { class: 'field' }, [
    labelText ? el('label', { text: labelText }) : null,
    control,
    hint ? el('div', { class: 'hint', text: hint }) : null,
  ]);
}

export function textInput({ value = '', placeholder = '', oninput, onchange, sm = false, attrs = {} } = {}) {
  return el('input', {
    class: 'input' + (sm ? ' input--sm' : ''), type: 'text', value, placeholder,
    ...attrs,
    oninput: oninput ? (e) => oninput(e.target.value, e) : null,
    onchange: onchange ? (e) => onchange(e.target.value, e) : null,
  });
}

export function numberInput({ value = 0, min, max, step = 1, oninput, onchange, unit, sm = true, align = true } = {}) {
  const input = el('input', {
    class: 'input' + (sm ? ' input--sm' : '') + (align ? ' input--num' : ''),
    type: 'number', value, step,
    ...(min != null ? { min } : {}), ...(max != null ? { max } : {}),
    oninput: oninput ? (e) => oninput(e.target.value === '' ? '' : parseFloat(e.target.value), e) : null,
    onchange: onchange ? (e) => onchange(e.target.value === '' ? '' : parseFloat(e.target.value), e) : null,
  });
  if (!unit) return input;
  return el('div', { class: 'with-unit' }, [input, el('span', { class: 'unit', text: unit })]);
}

export function selectInput({ value, options = [], onchange, sm = false } = {}) {
  const sel = el('select', {
    class: 'select' + (sm ? ' input--sm' : ''),
    onchange: onchange ? (e) => onchange(e.target.value, e) : null,
  }, options.map((o) => el('option', { value: o.value, ...(o.value === value ? { selected: true } : {}) }, o.label)));
  sel.value = value;
  return sel;
}

export function checkbox({ label, checked = false, onchange } = {}) {
  const input = el('input', { type: 'checkbox', ...(checked ? { checked: true } : {}), onchange: (e) => onchange?.(e.target.checked, e) });
  return el('label', { class: 'row gap-2', style: { cursor: 'pointer', fontWeight: 600, fontSize: 'var(--fs-sm)' } }, [input, el('span', { text: label })]);
}

export function colorInput({ value = '#000000', oninput } = {}) {
  return el('input', { type: 'color', class: 'inline-color', value, oninput: (e) => oninput?.(e.target.value, e) });
}

export function segmented({ value, options = [], onchange } = {}) {
  const wrap = el('div', { class: 'segmented', role: 'tablist' });
  for (const o of options) {
    wrap.appendChild(el('button', {
      class: o.value === value ? 'is-active' : '',
      role: 'tab', 'aria-selected': o.value === value,
      onClick: () => onchange?.(o.value),
    }, o.label));
  }
  return wrap;
}

/** 段階的開示: 詳細設定は折りたたんでおく */
export function expander(title, bodyNode, open = false) {
  const body = el('div', { class: 'expander__body' }, [bodyNode]);
  const head = el('div', { class: 'expander__head' }, [el('span', { text: title }), el('span', { class: 'caret', text: '▸' })]);
  const root = el('div', { class: 'expander' + (open ? ' is-open' : '') }, [head, body]);
  head.addEventListener('click', () => root.classList.toggle('is-open'));
  return root;
}

/**
 * 貼り付け領域。社内Webを Ctrl+A → コピー → ここに Ctrl+V する想定。
 * onData(text) は貼り付け/入力のたびに呼ばれる。
 */
export function pasteArea({ value = '', onData, placeholder } = {}) {
  const ta = el('textarea', {
    class: 'textarea', placeholder: placeholder || 'ここをクリックして Ctrl+V で貼り付け\n(社内Web上で Ctrl+A → Ctrl+C でコピーしてから)',
    oninput: (e) => onData?.(e.target.value),
  });
  ta.value = value;
  return ta;
}

export function emptyState({ icon = '📄', title, desc, action } = {}) {
  return el('div', { class: 'empty' }, [
    el('div', { class: 'empty__icon', text: icon }),
    el('h3', { text: title }),
    desc ? el('p', { class: 'muted', text: desc }) : null,
    action ? el('div', { class: 'mt-4', style: { display: 'flex', justifyContent: 'center' } }, [action]) : null,
  ]);
}

/** 番号付きの手順ブロック(A①②③のような) */
export function stepBlock(num, title, bodyNode) {
  return el('div', { class: 'step-block' }, [
    el('div', { class: 'step-block__num', text: String(num) }),
    el('div', { class: 'step-block__body' }, [el('h3', { text: title }), bodyNode]),
  ]);
}
