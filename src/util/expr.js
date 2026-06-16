// 安全な算術式評価器(eval不使用)。
// 用途: ラベル要素の「入力内容をもとにした簡単な計算」。
//   例:  value * 1.1            (税込)
//        qty * unit_price       (他フィールドの数値を参照)
//        (a + b) / 2
// 対応: + - * / % ^、括弧、単項マイナス、関数 abs/round/floor/ceil/min/max/sqrt。
// 変数: 識別子は scope[name] (数値) を参照。未定義や非数値は NaN。
//
// 再帰下降パーサ。トークナイズ→構文解析→即時評価。

const FUNCS = {
  abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil,
  sqrt: Math.sqrt, min: Math.min, max: Math.max, pow: Math.pow,
};

function tokenize(src) {
  const tokens = [];
  let i = 0;
  const isDigit = (c) => c >= '0' && c <= '9';
  const isIdStart = (c) => /[A-Za-z_ぁ-鿿]/.test(c);
  const isIdPart = (c) => /[A-Za-z0-9_ぁ-鿿]/.test(c);
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t') { i++; continue; }
    if (isDigit(c) || (c === '.' && isDigit(src[i + 1]))) {
      let j = i + 1;
      while (j < src.length && (isDigit(src[j]) || src[j] === '.')) j++;
      tokens.push({ t: 'num', v: parseFloat(src.slice(i, j)) });
      i = j; continue;
    }
    if (isIdStart(c)) {
      let j = i + 1;
      while (j < src.length && isIdPart(src[j])) j++;
      tokens.push({ t: 'id', v: src.slice(i, j) });
      i = j; continue;
    }
    if ('+-*/%^(),'.includes(c)) { tokens.push({ t: c }); i++; continue; }
    throw new Error('不正な文字: ' + c);
  }
  tokens.push({ t: 'eof' });
  return tokens;
}

function parse(tokens, scope) {
  let p = 0;
  const peek = () => tokens[p];
  const next = () => tokens[p++];
  const expect = (t) => { if (peek().t !== t) throw new Error('構文エラー'); return next(); };

  function parseExpr() {
    let v = parseTerm();
    while (peek().t === '+' || peek().t === '-') {
      const op = next().t; const r = parseTerm();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  function parseTerm() {
    let v = parseUnary();
    while (peek().t === '*' || peek().t === '/' || peek().t === '%') {
      const op = next().t; const r = parseUnary();
      v = op === '*' ? v * r : op === '/' ? v / r : v % r;
    }
    return v;
  }
  function parseUnary() {
    if (peek().t === '+') { next(); return parseUnary(); }
    if (peek().t === '-') { next(); return -parseUnary(); }
    return parsePower();
  }
  function parsePower() {
    const base = parsePrimary();
    if (peek().t === '^') { next(); return Math.pow(base, parseUnary()); }
    return base;
  }
  function parsePrimary() {
    const tk = peek();
    if (tk.t === 'num') { next(); return tk.v; }
    if (tk.t === '(') { next(); const v = parseExpr(); expect(')'); return v; }
    if (tk.t === 'id') {
      next();
      if (peek().t === '(') {
        next();
        const args = [];
        if (peek().t !== ')') { args.push(parseExpr()); while (peek().t === ',') { next(); args.push(parseExpr()); } }
        expect(')');
        const fn = FUNCS[tk.v];
        if (!fn) throw new Error('未対応の関数: ' + tk.v);
        return fn(...args);
      }
      const val = scope[tk.v];
      return typeof val === 'number' ? val : NaN;
    }
    throw new Error('構文エラー');
  }

  const result = parseExpr();
  if (peek().t !== 'eof') throw new Error('構文エラー');
  return result;
}

/** 式を評価。失敗時は NaN。 */
export function evalExpr(src, scope = {}) {
  try {
    return parse(tokenize(String(src)), scope);
  } catch {
    return NaN;
  }
}

/** 式が構文的に妥当か(UIバリデーション用)。変数は0として検査。 */
export function validateExpr(src, varNames = []) {
  const scope = {};
  for (const n of varNames) scope[n] = 1;
  try { parse(tokenize(String(src)), scope); return { ok: true }; }
  catch (e) { return { ok: false, error: e.message }; }
}
