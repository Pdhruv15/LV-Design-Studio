/** Formulas for the built-in sheets (Sheets page): a small, own evaluator for the functions an electrical
 * schedule uses — not a copy of Excel. A cell holds a number, a text or a formula starting with "=". Cells are
 * named as in Excel (A1, $B$2) and ranges as A1:B9.
 *
 * Operators: + − * / ^, unary −, %, &, and = <> < > <= >=. Functions: see SHEET_FUNCTIONS. A formula with a
 * function this evaluator does not have gives #NAME? — or, when the file it came from carried a last value for
 * that cell, keeps that value and is marked `unsupported`, so nothing from the engineer's file is dropped. */

export type CellValue = number | string | boolean | null;
export type SheetError = '#DIV/0!' | '#NAME?' | '#VALUE!' | '#REF!' | '#N/A' | '#CYCLE!' | '#ERROR!';
export interface CellResult {
  value: CellValue;
  error?: SheetError;
  /** The formula uses something this evaluator does not have; `value` is the last value from the file, if any. */
  unsupported?: boolean;
}
export type SheetCells = Record<string, string | number | boolean | null | undefined>;

// ---- cell names

const REF = /^\$?([A-Z]{1,3})\$?([1-9][0-9]{0,6})$/;
export const colIndex = (letters: string): number => [...letters].reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0);
export function colName(index: number): string {
  let s = '';
  for (let n = index; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
/** "B7" or "$B$7" → column 2, row 7 (both from 1); undefined when it is not a cell name. */
export function cellAt(name: string): { col: number; row: number } | undefined {
  const m = REF.exec(name.toUpperCase());
  return m ? { col: colIndex(m[1]), row: Number(m[2]) } : undefined;
}
export const cellName = (col: number, row: number) => `${colName(col)}${row}`;

// ---- reading a formula

type Node =
  | { t: 'num'; v: number } | { t: 'str'; v: string } | { t: 'bool'; v: boolean }
  | { t: 'ref'; name: string } | { t: 'range'; a: string; b: string }
  | { t: 'neg'; x: Node } | { t: 'pct'; x: Node }
  | { t: 'op'; op: string; l: Node; r: Node }
  | { t: 'fn'; name: string; args: Node[] };

type Tok = { k: 'num'; v: number } | { k: 'str'; v: string } | { k: 'id'; v: string } | { k: 'op'; v: string };

class FormulaError extends Error {
  constructor(public code: SheetError) { super(code); }
}

function tokens(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n') { i++; continue; }
    if (c === '"') {
      let s = '';
      for (i++; ; i++) {
        if (i >= src.length) throw new FormulaError('#ERROR!');
        if (src[i] === '"') { if (src[i + 1] === '"') { s += '"'; i++; } else break; } else s += src[i];
      }
      i++;
      out.push({ k: 'str', v: s });
      continue;
    }
    const num = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
    if (num) { out.push({ k: 'num', v: Number(num[0]) }); i += num[0].length; continue; }
    const id = /^[$A-Za-z_][$A-Za-z0-9_.]*/.exec(src.slice(i));
    if (id) { out.push({ k: 'id', v: id[0].toUpperCase() }); i += id[0].length; continue; }
    const two = src.slice(i, i + 2);
    if (two === '<>' || two === '<=' || two === '>=') { out.push({ k: 'op', v: two }); i += 2; continue; }
    if ('+-*/^&=<>(),:%'.includes(c)) { out.push({ k: 'op', v: c }); i++; continue; }
    throw new FormulaError('#ERROR!');
  }
  return out;
}

/** The formula as a tree (the text after "="). Throws on a formula that cannot be read. */
function parse(src: string): Node {
  const ts = tokens(src);
  let p = 0;
  const peek = (v?: string) => { const t = ts[p]; return t && t.k === 'op' && (v === undefined || t.v === v) ? t.v : undefined; };
  const take = (v: string) => { if (peek(v) === undefined) throw new FormulaError('#ERROR!'); p++; };
  const binary = (next: () => Node, ops: string[]) => () => {
    let l = next();
    for (let o = peek(); o !== undefined && ops.includes(o); o = peek()) { p++; l = { t: 'op', op: o, l, r: next() }; }
    return l;
  };
  const primary = (): Node => {
    const t = ts[p++];
    if (!t) throw new FormulaError('#ERROR!');
    if (t.k === 'num') return { t: 'num', v: t.v };
    if (t.k === 'str') return { t: 'str', v: t.v };
    if (t.k === 'op' && t.v === '(') { const x = compare(); take(')'); return x; }
    if (t.k === 'id') {
      if (peek('(')) {
        p++;
        const args: Node[] = [];
        if (!peek(')')) {
          args.push(compare());
          while (peek(',')) { p++; args.push(compare()); }
        }
        take(')');
        return { t: 'fn', name: t.v, args };
      }
      if (t.v === 'TRUE' || t.v === 'FALSE') return { t: 'bool', v: t.v === 'TRUE' };
      if (!REF.test(t.v)) throw new FormulaError('#NAME?');
      const a = t.v.replace(/\$/g, '');
      if (peek(':')) {
        p++;
        const b = ts[p++];
        if (!b || b.k !== 'id' || !REF.test(b.v)) throw new FormulaError('#ERROR!');
        return { t: 'range', a, b: b.v.replace(/\$/g, '') };
      }
      return { t: 'ref', name: a };
    }
    throw new FormulaError('#ERROR!');
  };
  const postfix = (): Node => { let x = primary(); while (peek('%')) { p++; x = { t: 'pct', x }; } return x; };
  // As in Excel, −2^2 is 4: the sign binds tighter than the power.
  const unary = (): Node => {
    if (peek('-')) { p++; return { t: 'neg', x: unary() }; }
    if (peek('+')) { p++; return unary(); }
    return postfix();
  };
  const power = binary(unary, ['^']);
  const product = binary(power, ['*', '/']);
  const sum = binary(product, ['+', '-']);
  const concat = binary(sum, ['&']);
  const compare: () => Node = binary(concat, ['=', '<>', '<', '>', '<=', '>=']);
  const tree = compare();
  if (p < ts.length) throw new FormulaError('#ERROR!');
  return tree;
}

// ---- working it out

type Arg = CellValue | CellValue[][];
const isRange = (a: Arg): a is CellValue[][] => Array.isArray(a);
/** Excel shows 15 significant digits: 0.1 + 0.2 is 0.3. */
const tidy = (v: number) => (Number.isFinite(v) ? Number(v.toPrecision(15)) : v);

function num(v: Arg): number {
  if (isRange(v)) throw new FormulaError('#VALUE!');
  if (typeof v === 'number') return v;
  if (v === null || v === '') return 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const n = Number(v.trim());
  if (v.trim() === '' || !Number.isFinite(n)) throw new FormulaError('#VALUE!');
  return n;
}
const text = (v: Arg): string => {
  if (isRange(v)) throw new FormulaError('#VALUE!');
  return v === null ? '' : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : String(v);
};
function truth(v: Arg): boolean {
  if (isRange(v)) throw new FormulaError('#VALUE!');
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') { if (/^true$/i.test(v)) return true; if (/^false$/i.test(v)) return false; throw new FormulaError('#VALUE!'); }
  return num(v) !== 0;
}
/** Numbers of the arguments: every number in a range (texts, blanks and TRUE/FALSE there are skipped, as in Excel);
 * a value given directly must be a number. */
function numbers(args: Arg[]): number[] {
  const out: number[] = [];
  for (const a of args) {
    if (isRange(a)) { for (const row of a) for (const v of row) if (typeof v === 'number') out.push(v); } else out.push(num(a));
  }
  return out;
}
function compareValues(a: CellValue, b: CellValue): number {
  const rank = (v: CellValue) => (typeof v === 'number' || v === null ? 0 : typeof v === 'string' ? 1 : 2);
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  if (typeof a === 'string' && typeof b === 'string') return a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0;
  return Number(a ?? 0) - Number(b ?? 0);
}
/** Half away from zero, at `digits` decimals; dir −1 always towards zero, +1 always away. */
function rounded(v: number, digits: number, dir: -1 | 0 | 1): number {
  const k = 10 ** Math.trunc(digits), x = tidy(Math.abs(v) * k);
  const r = dir === 0 ? Math.round(x) : dir > 0 ? Math.ceil(x - 1e-9) : Math.floor(x + 1e-9);
  return (Math.sign(v) * r) / k;
}

type Fn = (args: Arg[]) => CellValue;
const scalar = (args: Arg[], n: number, max = n) => { if (args.length < n || args.length > max) throw new FormulaError('#VALUE!'); return args; };
const FUNCTIONS: Record<string, Fn> = {
  SUM: (a) => numbers(a).reduce((s, v) => s + v, 0),
  AVERAGE: (a) => { const n = numbers(a); if (!n.length) throw new FormulaError('#DIV/0!'); return n.reduce((s, v) => s + v, 0) / n.length; },
  MIN: (a) => { const n = numbers(a); return n.length ? Math.min(...n) : 0; },
  MAX: (a) => { const n = numbers(a); return n.length ? Math.max(...n) : 0; },
  COUNT: (a) => a.reduce<number>((s, x) => s + (isRange(x) ? x.flat().filter((v) => typeof v === 'number').length : typeof x === 'number' ? 1 : 0), 0),
  COUNTA: (a) => a.reduce<number>((s, x) => s + (isRange(x) ? x.flat().filter((v) => v !== null && v !== '').length : x !== null && x !== '' ? 1 : 0), 0),
  ROUND: (a) => rounded(num(scalar(a, 2)[0]), num(a[1]), 0),
  ROUNDUP: (a) => rounded(num(scalar(a, 2)[0]), num(a[1]), 1),
  ROUNDDOWN: (a) => rounded(num(scalar(a, 2)[0]), num(a[1]), -1),
  ABS: (a) => Math.abs(num(scalar(a, 1)[0])),
  SQRT: (a) => { const v = num(scalar(a, 1)[0]); if (v < 0) throw new FormulaError('#VALUE!'); return Math.sqrt(v); },
  AND: (a) => { if (!a.length) throw new FormulaError('#VALUE!'); return a.flatMap((x) => (isRange(x) ? x.flat().filter((v) => v !== null && typeof v !== 'string') : [x])).every(truth); },
  OR: (a) => { if (!a.length) throw new FormulaError('#VALUE!'); return a.flatMap((x) => (isRange(x) ? x.flat().filter((v) => v !== null && typeof v !== 'string') : [x])).some(truth); },
  NOT: (a) => !truth(scalar(a, 1)[0]),
  VLOOKUP: (a) => {
    const [want, table, colArg, approxArg] = scalar(a, 3, 4);
    if (isRange(want) || !isRange(table)) throw new FormulaError('#VALUE!');
    const col = Math.trunc(num(colArg));
    if (col < 1) throw new FormulaError('#VALUE!');
    if (col > (table[0]?.length ?? 0)) throw new FormulaError('#REF!');
    const approx = approxArg === undefined ? true : truth(approxArg);
    let hit: CellValue[] | undefined;
    for (const row of table) {
      if (row[0] === null) continue;
      const c = compareValues(row[0], want);
      if (c === 0) { hit = row; if (!approx) break; }
      // Approximate: the last row not above the value, the first column sorted upwards.
      else if (approx && c < 0 && typeof row[0] === typeof want) hit = row;
      else if (approx && c > 0) break;
    }
    if (!hit) throw new FormulaError('#N/A');
    return hit[col - 1];
  }
};
/** The functions a sheet formula can use (IF is worked out apart: only the branch taken is evaluated). */
export const SHEET_FUNCTIONS: string[] = [...Object.keys(FUNCTIONS), 'IF'].sort();

/** Every function a formula calls, upper case — to tell an engineer which of a file's formulas the sheet cannot work out. */
export function formulaFunctions(formula: string): string[] {
  try {
    const out = new Set<string>();
    const walk = (n: Node): void => {
      if (n.t === 'fn') { out.add(n.name); n.args.forEach(walk); } else if (n.t === 'op') { walk(n.l); walk(n.r); } else if (n.t === 'neg' || n.t === 'pct') walk(n.x);
    };
    walk(parse(formula.replace(/^=/, '')));
    return [...out];
  } catch { return []; }
}

const isFormula = (v: unknown): v is string => typeof v === 'string' && v.startsWith('=') && v.length > 1;
/** What a typed cell holds when it is not a formula: a number when it reads as one, else the text. */
function literal(v: string | number | boolean | null | undefined): CellValue {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string') return v;
  const t = v.trim();
  if (t !== '' && Number.isFinite(Number(t)) && /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return Number(t);
  return v;
}

/** Every cell's value. `cached`: last values from the file a sheet was opened from, used for a formula the
 * evaluator cannot work out (a function it does not have), which is then marked `unsupported`. */
export function evaluateSheet(cells: SheetCells, cached: Record<string, CellValue> = {}): Record<string, CellResult> {
  const input = new Map<string, string | number | boolean | null | undefined>();
  for (const [k, v] of Object.entries(cells)) input.set(k.toUpperCase().replace(/\$/g, ''), v);
  const done = new Map<string, CellResult>();
  const busy = new Set<string>();

  const valueOf = (name: string): CellValue => {
    const r = cell(name);
    if (r.error) throw new FormulaError(r.error);
    return r.value;
  };
  const range = (a: string, b: string): CellValue[][] => {
    const p = cellAt(a)!, q = cellAt(b)!;
    const [c0, c1] = [Math.min(p.col, q.col), Math.max(p.col, q.col)], [r0, r1] = [Math.min(p.row, q.row), Math.max(p.row, q.row)];
    if ((c1 - c0 + 1) * (r1 - r0 + 1) > 200000) throw new FormulaError('#REF!');
    const out: CellValue[][] = [];
    for (let r = r0; r <= r1; r++) { const row: CellValue[] = []; for (let c = c0; c <= c1; c++) row.push(valueOf(cellName(c, r))); out.push(row); }
    return out;
  };
  const ev = (n: Node): Arg => {
    switch (n.t) {
      case 'num': case 'str': case 'bool': return n.v;
      case 'ref': return valueOf(n.name);
      case 'range': return range(n.a, n.b);
      case 'neg': return -num(ev(n.x));
      case 'pct': return num(ev(n.x)) / 100;
      case 'fn': {
        if (n.name === 'IF') {
          if (n.args.length < 2 || n.args.length > 3) throw new FormulaError('#VALUE!');
          const out = truth(ev(n.args[0])) ? ev(n.args[1]) : n.args[2] ? ev(n.args[2]) : false;
          if (isRange(out)) throw new FormulaError('#VALUE!');
          return out;
        }
        const f = FUNCTIONS[n.name];
        if (!f) throw new FormulaError('#NAME?');
        return f(n.args.map(ev));
      }
      case 'op': {
        const l = ev(n.l), r = ev(n.r);
        if (isRange(l) || isRange(r)) throw new FormulaError('#VALUE!');
        switch (n.op) {
          case '+': return num(l) + num(r);
          case '-': return num(l) - num(r);
          case '*': return num(l) * num(r);
          case '/': { const d = num(r); if (d === 0) throw new FormulaError('#DIV/0!'); return num(l) / d; }
          case '^': return num(l) ** num(r);
          case '&': return text(l) + text(r);
          case '=': return compareValues(l, r) === 0;
          case '<>': return compareValues(l, r) !== 0;
          case '<': return compareValues(l, r) < 0;
          case '>': return compareValues(l, r) > 0;
          case '<=': return compareValues(l, r) <= 0;
          default: return compareValues(l, r) >= 0;
        }
      }
    }
  };
  function cell(name: string): CellResult {
    const got = done.get(name);
    if (got) return got;
    const raw = input.get(name);
    let out: CellResult;
    if (!isFormula(raw)) out = { value: literal(raw) };
    else if (busy.has(name)) return { value: null, error: '#CYCLE!' };
    else {
      busy.add(name);
      try {
        if (raw.includes('#REF!')) throw new FormulaError('#REF!');
        const v = ev(parse(raw.slice(1)));
        if (isRange(v)) throw new FormulaError('#VALUE!');
        if (typeof v === 'number' && !Number.isFinite(v)) throw new FormulaError('#VALUE!');
        out = { value: typeof v === 'number' ? tidy(v) : v };
      } catch (e) {
        const error: SheetError = e instanceof FormulaError ? e.code : '#ERROR!';
        const unknown = error === '#NAME?' && formulaFunctions(raw).some((f) => !SHEET_FUNCTIONS.includes(f));
        out = unknown && name in cached ? { value: cached[name], unsupported: true } : { value: null, error, ...(unknown ? { unsupported: true } : {}) };
      }
      busy.delete(name);
    }
    done.set(name, out);
    return out;
  }
  const result: Record<string, CellResult> = {};
  for (const k of input.keys()) result[k] = cell(k);
  return result;
}

/** A formula moved by rows and columns, as fill down and paste do: A1 follows, $A$1 stays, $A1 and A$1 follow one
 * way. A reference pushed off the sheet becomes #REF!. Text in quotes is left alone. */
export function shiftFormula(formula: string, dRow: number, dCol: number): string {
  if (!isFormula(formula)) return formula;
  return formula.replace(/"(?:[^"]|"")*"|(\$?)([A-Za-z]{1,3})(\$?)([1-9][0-9]{0,6})(?![A-Za-z0-9_(.])/g, (m, ac: string | undefined, col: string | undefined, ar: string, row: string, at: number) => {
    if (col === undefined) return m;
    // Part of a longer name (a function such as LOG10, or a name): not a cell.
    if (at > 0 && /[A-Za-z0-9_.]/.test(formula[at - 1])) return m;
    const c = ac ? colIndex(col.toUpperCase()) : colIndex(col.toUpperCase()) + dCol, r = ar ? Number(row) : Number(row) + dRow;
    return c < 1 || r < 1 ? '#REF!' : `${ac ?? ''}${colName(c)}${ar}${r}`;
  });
}
