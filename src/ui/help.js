// ヘルプ: 使い方 と 認知心理学に基づく設計思想。
import { el } from '../util/dom.js';

export function renderHelp(root, app) {
  const c = el('div', { class: 'container' });
  c.appendChild(el('div', { class: 'page-head' }, [
    el('h1', { text: '使い方と設計思想' }),
    el('p', { text: '「誰でも簡単に、必要なデータの載ったラベルを作れる」ことを目標に、認知心理学の知見をUIへ反映しています。' }),
  ]));

  c.appendChild(card('3ステップの流れ', [
    flow('A', 'データ紐づけ', '社内データをコピー&貼り付け。Excelライクな表で各項目に対応するセルをクリックして紐づけます(列/行の区切り文字も変更可)。位置で取得するので、不定形の配置でも、中身が変わっても同じルールで使えます。'),
    flow('B', 'ラベル設計', 'テンプレPDFを読み込み、項目をドラッグで絶対座標(mm)に配置。文字・図形・Code128・QR、計算や桁丸め(四捨五入/切り捨て/切り上げ/銀行丸め)を設定し、出力形式(PNG/PDF)を選んで名前を付けて保存します。'),
    flow('C', 'ラベル作成', '使うラベルを選び、データを貼り付けるだけ。項目名に応じて値が自動で上書きされ、ボタン1つで出力します。日常作業はこの画面で完結します。'),
  ]));

  c.appendChild(card('認知心理学に基づく工夫', [
    el('div', { class: 'grid-2' }, principles.map((p) => el('div', { class: 'col', style: { gap: '2px' } }, [
      el('div', { class: 'strong', text: p.t }),
      el('div', { class: 'small muted', text: p.d }),
    ]))),
  ]));

  c.appendChild(card('プライバシーと動作環境', [
    el('ul', { class: 'small', style: { margin: 0, paddingLeft: '18px', lineHeight: '1.9' } }, [
      el('li', { html: '<b>外部送信なし</b>: 貼り付けたデータ・テンプレPDF・プリセットはすべてこのブラウザ内(localStorage)にのみ保存されます。' }),
      el('li', { html: '<b>オフライン動作</b>: 必要なライブラリはすべて同梱。インターネット接続は不要です。' }),
      el('li', { html: '<b>配布・起動</b>: 配布用の単一ファイル <code class="mono">dist/label-maker.html</code> を<b>ダブルクリック</b>するだけで開けます(サーバ不要)。開発時は <code class="mono">npm start</code> で簡易サーバ経由。' }),
      el('li', { html: '<b>バックアップ</b>: 「管理」からJSONでエクスポートでき、他PCへ配布・復元できます。' }),
    ]),
  ]));

  c.appendChild(el('div', { class: 'flow-actions' }, [
    el('div', { class: 'spacer' }),
    el('button', { class: 'btn btn--primary', onClick: () => app.go('A') }, 'はじめる(A データ紐づけ)'),
  ]));
  root.appendChild(c);
}

function card(title, children) {
  return el('div', { class: 'card card__pad col gap-4 mb-4' }, [el('h3', { class: 'card__title', text: title }), ...children]);
}
function flow(badge, title, desc) {
  return el('div', { class: 'step-block' }, [
    el('div', { class: 'step-block__num', text: badge }),
    el('div', { class: 'step-block__body' }, [el('h3', { text: title }), el('p', { class: 'small muted', text: desc })]),
  ]);
}

const principles = [
  { t: '心的モデルの一致', d: 'あなたが想定したA→B→Cの手順をそのままステッパーにし、画面と頭の中の流れを一致させています。' },
  { t: '段階的開示', d: '正規化や計算など高度な設定は折りたたみ、普段は必要な操作だけを見せて認知負荷を抑えます。' },
  { t: '認識 > 記憶', d: '項目はチップやドロップダウンから選択。コードや座標を覚える必要をなくしています。' },
  { t: 'システム状態の可視化', d: '貼り付け結果・上書き内容・最終見た目を常にライブプレビュー。結果が即座に分かります。' },
  { t: 'エラー予防', d: '削除前の確認、未保存の警告、計算式の妥当性チェック、取得できない項目の警告を行います。' },
  { t: 'Fittsの法則', d: '「出力」など主要操作は大きく押しやすい配置に。迷わず到達できます。' },
  { t: 'Hickの法則', d: '出力形式や丸め方などに既定値を用意し、選択肢を絞って判断を速くします。' },
  { t: 'ゲシュタルト/整列', d: 'ドラッグ時に整列ガイドとスナップが働き、きれいな配置を自動で支援します。' },
  { t: '一貫性', d: '「紐づけ(可変データ)」を表す色を全画面で統一し、ひと目で意味が分かるようにしています。' },
  { t: '直接操作', d: '実寸キャンバス上でドラッグ・リサイズ。さらに数値で絶対座標を厳密に指定できます。' },
];
