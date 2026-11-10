import type { SketchItem } from '../types';
import { justFractions, textWidth, TEXT_JUSTS, type TextJust } from './cadText';

/** Design CAD → Notes (MTEXT, S6 of the 2D gap plan): a paragraph text in a box of a set width, its lines wrapped to
 * it. A note is anchored at pts[0], where its attachment (`just`, TL by default: the nine positions of a text's box)
 * sits on the box; `w` is the box's width (drawing units; none: as wide as its longest line), `h` the height of its
 * letters, `lsp` the line spacing (1: lines 5/3 of the height apart, as drawings space them). Its words are kept as
 * paragraphs of runs, each plain, bold or underlined (`note`), never as HTML. */

type Pt = [number, number];

/** A run of a note's words with one look: bold, underlined, and a height as a factor of the note's. */
export interface NoteRun { s: string; b?: true; u?: true; h?: number }
/** A paragraph: its runs, and whether it is a numbered or bulleted line. */
export interface NotePara { runs: NoteRun[]; list?: 'num' | 'bullet' }

/** Where a note's anchor sits on its box: the nine positions (a text's box positions without the baseline ones). */
export type NoteAttach = Exclude<TextJust, 'L' | 'C' | 'R'>;
export const NOTE_ATTACHES = TEXT_JUSTS.filter((x): x is { id: NoteAttach; label: string } => x.id.length === 2);
export const attachLabel = (j: NoteAttach | undefined) => NOTE_ATTACHES.find((x) => x.id === (j ?? 'TL'))?.label ?? 'Top left';
/** The attachment typed: its code (MC) or a label (Middle centre). */
export function parseAttach(s: string): NoteAttach | undefined {
  const t = s.trim().toUpperCase().replace('CENTER', 'CENTRE');
  return NOTE_ATTACHES.find((x) => x.id === t || x.label.toUpperCase() === t)?.id;
}
export const attachOf = (it: Pick<SketchItem, 'just'>): NoteAttach => (it.just && it.just.length === 2 ? it.just as NoteAttach : 'TL');

/** Lines are this many heights apart at a line spacing of 1. */
export const LINE_FACTOR = 5 / 3;

/** The width of a run on the drawing: a function of its words, height and weight (the sheets print Arial; the app
 * takes the same 0.6 × height per letter everywhere, so the canvas, the sheets and the DXF wrap alike). */
export type Measure = (s: string, h: number, bold: boolean) => number;
export const noteMeasure: Measure = (s, h) => textWidth(s, h);

/** The note's words as plain text, paragraphs on their own lines (FIND searches it; the Properties palette shows it). */
export const plainText = (it: Pick<SketchItem, 'note' | 'text'>): string => (it.note ? it.note.map((p) => p.runs.map((r) => r.s).join('')).join('\n') : it.text ?? '');
/** Paragraphs from plain text, one per line. */
export const noteFromText = (s: string): NotePara[] => s.split(/\r?\n/).map((l) => ({ runs: l ? [{ s: l }] : [] }));
/** What a list paragraph starts with: "1. " for the n-th numbered one, "• " for a bulleted one. */
export const listPrefix = (p: NotePara, n: number) => (p.list === 'num' ? `${n}. ` : p.list === 'bullet' ? '• ' : '');

/** One piece of a laid-out line (x from the line's left, in drawing units, before the column alignment). */
export interface NoteSeg { s: string; x: number; w: number; h: number; b?: boolean; u?: boolean }
/** A line of the note: its baseline below the box's top, its pieces (x from the box's left) and its width. */
export interface NoteLine { y: number; segs: NoteSeg[]; w: number }
export interface NoteLayout { lines: NoteLine[]; w: number; H: number; h: number; lineH: number }

/** The note's lines wrapped to its width: words that do not fit go to the next line (a word wider than the box has a
 * line of its own); each paragraph starts a line; a list paragraph starts with its number or bullet, its further
 * lines indented past it. The column (left, centre, right) of the attachment lines the lines up in the box. */
export function noteLayout(it: Pick<SketchItem, 'note' | 'text' | 'w' | 'h' | 'lsp' | 'just'>, measure: Measure = noteMeasure): NoteLayout {
  const h = it.h ?? 1, lineH = LINE_FACTOR * h * (it.lsp ?? 1), paras = it.note ?? noteFromText(it.text ?? '');
  const maxW = it.w && it.w > 0 ? it.w : Infinity;
  const raw: { segs: NoteSeg[]; w: number }[] = [];
  let num = 0;
  for (const p of paras) {
    num = p.list === 'num' ? num + 1 : 0;
    const prefix = listPrefix(p, num), indent = prefix ? measure(prefix, h, false) : 0;
    // The words and the spaces between them, each with its run's look.
    const tokens = p.runs.flatMap((r) => r.s.split(/(\s+)/).filter(Boolean).map((s) => ({ s, b: !!r.b, u: !!r.u, hf: r.h && r.h > 0 ? r.h : 1 })));
    let line: NoteSeg[] = prefix ? [{ s: prefix, x: 0, w: indent, h }] : [], x = indent, first = true;
    const flush = () => {
      // Spaces at the end of a line do not count in its width.
      const last = line[line.length - 1];
      if (last && /\s+$/.test(last.s)) { const t = last.s.replace(/\s+$/, ''); last.w -= measure(last.s.slice(t.length), last.h, !!last.b); last.s = t; if (!last.s) line.pop(); }
      raw.push({ segs: line, w: line.length ? line[line.length - 1].x + line[line.length - 1].w : 0 });
      line = []; x = indent; first = false;
    };
    for (const t of tokens) {
      const space = /^\s+$/.test(t.s);
      if (space && x <= indent + 1e-9 && !first) continue; // a line never starts with the space that broke the last
      const th = h * t.hf, w = measure(t.s, th, t.b);
      if (!space && x + w > maxW + 1e-9 && x > indent + 1e-9) flush();
      const prev = line[line.length - 1];
      if (prev && !!prev.b === t.b && !!prev.u === t.u && prev.h === th && !(prefix && line.length === 1 && first)) { prev.s += t.s; prev.w += w; }
      else line.push({ s: t.s, x, w, h: th, ...(t.b ? { b: true } : {}), ...(t.u ? { u: true } : {}) });
      x += w;
    }
    flush();
  }
  const w = maxW === Infinity ? raw.reduce((m, l) => Math.max(m, l.w), 0) : maxW;
  const col = attachOf(it).slice(1), shift = (lw: number) => (col === 'C' ? (w - lw) / 2 : col === 'R' ? w - lw : 0);
  const lines = raw.map((l, i) => ({ y: h + i * lineH, w: l.w, segs: l.segs.map((s) => ({ ...s, x: s.x + shift(l.w) })) }));
  return { lines, w, H: lines.length ? h + (lines.length - 1) * lineH : h, h, lineH };
}

const along = (it: Pick<SketchItem, 'rot'>): [Pt, Pt] => { const a = it.rot ?? 0; return [[Math.cos(a), Math.sin(a)], [-Math.sin(a), Math.cos(a)]]; };
const at = (o: Pt, u: Pt, v: Pt, x: number, y: number): Pt => [o[0] + x * u[0] + y * v[0], o[1] + x * u[1] + y * v[1]];

/** The note's box on the drawing: its top left corner, its axes (`u` along a line, `v` up), its width and height, with
 * its lines laid out. */
export function noteBox(it: SketchItem, measure?: Measure): NoteLayout & { tl: Pt; u: Pt; v: Pt } {
  const lay = noteLayout(it, measure), { fx, fy } = justFractions(attachOf(it)), [u, v] = along(it);
  return { ...lay, u, v, tl: at(it.pts[0], u, v, -fx * lay.w, (1 - fy) * lay.H) };
}
/** The box's four corners, from the top left clockwise. */
export function noteCorners(it: SketchItem, measure?: Measure): Pt[] {
  const b = noteBox(it, measure);
  return [b.tl, at(b.tl, b.u, b.v, b.w, 0), at(b.tl, b.u, b.v, b.w, -b.H), at(b.tl, b.u, b.v, 0, -b.H)];
}
/** Where a line's piece starts on the drawing (its baseline's left end). */
export const noteSegAt = (b: ReturnType<typeof noteBox>, line: NoteLine, seg: NoteSeg): Pt => at(b.tl, b.u, b.v, seg.x, -line.y);
/** The anchor of the same box for another attachment. */
export function noteAnchorFor(it: SketchItem, j: NoteAttach): Pt {
  const b = noteBox(it), { fx, fy } = justFractions(j);
  return at(b.tl, b.u, b.v, fx * b.w, -(1 - fy) * b.H);
}
/** The note attached another way without moving on the plan: its anchor moves to that place on its box. */
export function noteAttached(it: SketchItem, j: NoteAttach): SketchItem {
  const { just: _j, ...rest } = it;
  return { ...rest, pts: [noteAnchorFor(it, j)], ...(j === 'TL' ? {} : { just: j }) };
}
/** The note with its box another width (at least two letters wide): its left edge and top stay where they are, so
 * the lines wrap again from the same corner. */
export function noteWithWidth(it: SketchItem, w: number): SketchItem {
  const b = noteBox(it), next: SketchItem = { ...it, w: Math.max(2 * (it.h ?? 1), w) };
  const nb = noteLayout(next), { fx, fy } = justFractions(attachOf(it));
  return { ...next, pts: [at(b.tl, b.u, b.v, fx * nb.w, -(1 - fy) * nb.H)] };
}

/** Whether the point is in the note's box (within `tol`). */
export function noteHit(it: SketchItem, p: Pt, tol: number): boolean {
  const b = noteBox(it), dx = p[0] - b.tl[0], dy = p[1] - b.tl[1];
  const x = dx * b.u[0] + dy * b.u[1], y = dx * b.v[0] + dy * b.v[1];
  return x >= -tol && x <= b.w + tol && y <= tol && y >= -b.H - tol;
}

/** EXPLODE: one single-line text per line of the note, at its place, height and angle (bold and underline are lost). */
export function explodeNote(it: SketchItem): Omit<SketchItem, 'id'>[] {
  const b = noteBox(it), { id: _id, note: _n, w: _w, lsp: _l, just: _j, text: _t, ...rest } = it;
  return b.lines.filter((l) => l.segs.length).map((l) => ({ ...rest, kind: 'text' as const, pts: [noteSegAt(b, l, l.segs[0])], text: l.segs.map((s) => s.s).join(''), h: b.h }));
}

// ---- the DXF's MTEXT codes

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
/** The paragraphs as a DXF MTEXT value: \P between paragraphs, bold as {\fArial|b1|i0;…}, underline as \L…\l, a run's
 * height as {\H1.5x;…}; a list paragraph starts with its number or bullet. */
export function toDxfMtext(paras: NotePara[]): string {
  let num = 0;
  return paras.map((p) => {
    num = p.list === 'num' ? num + 1 : 0;
    return listPrefix(p, num) + p.runs.map((r) => {
      let s = esc(r.s);
      if (r.u) s = `\\L${s}\\l`;
      if (r.b) s = `{\\fArial|b1|i0;${s}}`;
      if (r.h && r.h > 0 && r.h !== 1) s = `{\\H${+r.h.toFixed(3)}x;${s}}`;
      return s;
    }).join('');
  }).join('\\P');
}

/** The paragraphs read from a DXF MTEXT value: \P (and \N) end a paragraph, {…} groups scope a look, \f…|b1…; bold,
 * \L…\l underline, \Hn x; a height factor (\Hn; absolute, as a factor of `baseH` when given), %%u underline,
 * %%d ° %%p ± %%c Ø; colours, widths, obliques, tracking and alignment codes are read past; a stacked fraction
 * \S a^b; reads as a/b. */
export function fromDxfMtext(s: string, baseH?: number): NotePara[] {
  type Look = { b: boolean; u: boolean; h?: number };
  const paras: NotePara[] = [{ runs: [] }], stack: Look[] = [], look: Look = { b: false, u: false };
  let runs = paras[0].runs, cur = '';
  const push = () => { if (cur) { runs.push({ s: cur, ...(look.b ? { b: true } : {}), ...(look.u ? { u: true } : {}), ...(look.h && look.h !== 1 ? { h: look.h } : {}) }); cur = ''; } };
  const set = (patch: Partial<Look>) => { push(); Object.assign(look, patch); };
  const newPara = () => { push(); paras.push({ runs: [] }); runs = paras[paras.length - 1].runs; };
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (c === '{') { push(); stack.push({ ...look }); continue; }
    if (c === '}') { const prev = stack.pop(); if (prev) set(prev); continue; }
    if (c === '%' && s[i + 1] === '%') {
      const k = s[i + 2]?.toLowerCase();
      if (k === 'u') set({ u: !look.u }); else if (k === 'd') cur += '°'; else if (k === 'p') cur += '±'; else if (k === 'c') cur += 'Ø'; else { cur += '%%'; i -= 1; }
      i += 2; continue;
    }
    if (c !== '\\') { cur += c; continue; }
    const k = s[i + 1];
    i += 1;
    if (k === undefined) break;
    if (k === '\\' || k === '{' || k === '}') { cur += k; continue; }
    if (k === '~') { cur += ' '; continue; }
    if (k === 'P' || k === 'N') { newPara(); continue; }
    if (k === 'L') { set({ u: true }); continue; }
    if (k === 'l') { set({ u: false }); continue; }
    if (k === 'O' || k === 'o' || k === 'K' || k === 'k') continue; // overline, strike-through: not kept
    // Codes with an argument up to ';'.
    const end = s.indexOf(';', i + 1), arg = end < 0 ? s.slice(i + 1) : s.slice(i + 1, end);
    i = end < 0 ? s.length : end;
    if (k === 'f' || k === 'F') set({ b: /\|b1\b/i.test(arg) });
    else if (k === 'H') { const n = parseFloat(arg); if (Number.isFinite(n) && n > 0) set({ h: /x$/i.test(arg.trim()) ? n : baseH ? n / baseH : undefined }); }
    else if (k === 'S') cur += arg.replace(/[\^/#]/, '/');
    // \A \C \c \T \Q \W \p: alignment, colours, tracking, oblique, width factor, paragraph set-up: read past.
  }
  push();
  return paras;
}
