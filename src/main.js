// アプリ本体: 画面遷移(A→B→C)とナビゲーション、共有状態。
// 認知設計: ユーザー自身の心的モデル(A データ紐づけ → B ラベル設計 → C ラベル作成)を
// そのままステッパーUIに反映し、迷いを減らす(match between system and the real world)。
import { el, clear, qs, icon, toast } from './util/dom.js';
import { Store } from './store.js';
import { renderStepA } from './ui/stepA.js';
import { renderStepB } from './ui/stepB.js';
import { renderStepC } from './ui/stepC.js';
import { renderManage } from './ui/presets.js';
import { renderHelp } from './ui/help.js';

const view = qs('#view');
const nav = qs('#nav');
const actions = qs('#appbarActions');

const STEPS = [
  { key: 'A', label: 'データ紐づけ', sub: '①データを項目に', icon: 'data' },
  { key: 'B', label: 'ラベル設計', sub: '②ひな形を作る', icon: 'design' },
  { key: 'C', label: 'ラベル作成', sub: '③出力する', icon: 'run' },
];

export const App = {
  route: 'C',
  editingBinding: null, // Aの作業中ドラフト
  editingLabel: null,   // Bの作業中ドラフト
  runLabelId: null,     // Cで選択中のラベル

  go(route) {
    this.route = route;
    Store.setSetting('lastRoute', route);
    this.render();
    window.scrollTo(0, 0);
  },

  openBindingEditor(binding) { this.editingBinding = binding; this.go('A'); },
  closeBindingEditor() { this.editingBinding = null; this.go('A'); },
  openLabelDesigner(label) { this.editingLabel = label; this.go('B'); },
  closeLabelDesigner() { this.editingLabel = null; this.go('B'); },
  openRun(labelId) { this.runLabelId = labelId; this.go('C'); },

  render() {
    renderNav();
    clear(view);
    const ctx = this;
    try {
      if (this.route === 'A') renderStepA(view, ctx);
      else if (this.route === 'B') renderStepB(view, ctx);
      else if (this.route === 'C') renderStepC(view, ctx);
      else if (this.route === 'manage') renderManage(view, ctx);
      else if (this.route === 'help') renderHelp(view, ctx);
      else renderStepC(view, ctx);
    } catch (e) {
      console.error(e);
      view.appendChild(el('div', { class: 'container' }, [
        el('div', { class: 'card card__pad' }, [
          el('h2', { text: '表示中にエラーが発生しました' }),
          el('pre', { class: 'mono small', text: String(e && e.stack || e) }),
        ]),
      ]));
    }
  },
};

function renderNav() {
  clear(nav);
  const counts = { A: Store.bindings.list().length, B: Store.labels.list().length };
  STEPS.forEach((s, i) => {
    if (i > 0) nav.appendChild(el('span', { class: 'step-divider' }));
    const active = App.route === s.key;
    const done = (s.key === 'A' && counts.A > 0) || (s.key === 'B' && counts.B > 0);
    nav.appendChild(el('button', {
      class: 'step' + (active ? ' is-active' : '') + (done && !active ? ' is-done' : ''),
      onClick: () => {
        // 編集中ドラフトはクリアして一覧へ戻る
        if (s.key === 'A') App.editingBinding = null;
        if (s.key === 'B') App.editingLabel = null;
        if (s.key === 'C') App.runLabelId = null;
        App.go(s.key);
      },
    }, [
      el('span', { class: 'step__badge', text: done && !active ? '✓' : String(i + 1) }),
      el('span', { class: 'col', style: { gap: '0', alignItems: 'flex-start' } }, [
        el('span', { text: s.label }),
        el('span', { class: 'step__sub', text: s.sub }),
      ]),
    ]));
  });

  clear(actions);
  actions.appendChild(el('button', {
    class: 'step' + (App.route === 'manage' ? ' is-active' : ''),
    onClick: () => App.go('manage'),
  }, [icon('manage', 18), el('span', { class: 'step__sub', text: '管理' })]));
  actions.appendChild(el('button', {
    class: 'icon-btn', title: '使い方・設計思想', 'aria-label': 'ヘルプ',
    onClick: () => App.go('help'),
  }, [icon('help', 20)]));
}

// 初期ルート: 前回の画面、無ければラベルがあればC、なければA(オンボーディング)
const last = Store.getSettings().lastRoute;
App.route = last || (Store.labels.list().length ? 'C' : (Store.bindings.list().length ? 'B' : 'A'));
App.render();

// 動作確認用に公開
window.__app = App;
