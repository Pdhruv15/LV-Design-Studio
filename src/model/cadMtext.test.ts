import { describe, expect, it } from 'vitest';
import { explodeNote, fromDxfMtext, noteAttached, noteBox, noteCorners, noteHit, noteLayout, noteWithWidth, plainText, toDxfMtext, type NotePara } from './cadMtext';
import type { SketchItem } from '../types';

/** Notes (MTEXT, S6 of the Design CAD 2D gap plan): wrapping to the box, the attachment, the DXF codes. */

// Letters are 0.6 h wide, so at h 100 a 20-letter line is 1200 wide.
const paras: NotePara[] = [
  { runs: [{ s: 'GENERAL ', b: true }, { s: 'NOTES' }] },
  { runs: [{ s: 'All cables to be ' }, { s: 'LSZH', u: true }, { s: ' unless noted otherwise' }] },
  { runs: [] },
  { runs: [{ s: 'Refer to the load schedule' }], list: 'num' },
  { runs: [{ s: 'Check on site' }], list: 'num' }
];
const note: SketchItem = { id: 'N1', kind: 'mtext', layer: 'LV-ANNO', pts: [[1000, 5000]], note: paras, h: 100, w: 1500 };

describe('Notes: wrapping and layout', () => {
  it('wraps words to the width, a paragraph on each new line, lists numbered and indented', () => {
    const lay = noteLayout(note);
    const lines = lay.lines.map((l) => l.segs.map((s) => s.s).join(''));
    // 1500 wide = 25 letters: "All cables to be LSZH" (21) fits, " unless" would not.
    expect(lines).toEqual(['GENERAL NOTES', 'All cables to be LSZH', 'unless noted otherwise', '', '1. Refer to the load', 'schedule', '2. Check on site']);
    // The runs keep their look; a line's pieces follow each other.
    expect(lay.lines[0].segs.map((s) => [s.s, !!s.b, s.x])).toEqual([['GENERAL ', true, 0], ['NOTES', false, 480]]);
    expect(lay.lines[1].segs.map((s) => [s.s, !!s.u])).toEqual([['All cables to be ', false], ['LSZH', true]]);
    // A list's further lines start past its number.
    expect(lay.lines[5].segs[0].x).toBeCloseTo(180);
    // Lines 5/3 of the height apart, the first baseline a height below the top.
    lay.lines.forEach((l, i) => expect(l.y).toBeCloseTo(100 + (i * 500) / 3));
    expect(lay.H).toBeCloseTo(100 + (6 * 500) / 3);
    expect(lay.w).toBe(1500);
    // Without a width: as wide as the longest line, nothing wrapped.
    const free = noteLayout({ ...note, w: undefined });
    expect(free.lines.length).toBe(5);
    expect(free.w).toBeCloseTo(0.6 * 100 * 'All cables to be LSZH unless noted otherwise'.length);
  });

  it('centres and right-aligns the lines for a centre or right attachment, and a word wider than the box has its own line', () => {
    const c = noteLayout({ ...note, just: 'TC', note: [{ runs: [{ s: 'AB' }] }, { runs: [{ s: 'ABCD' }] }] });
    expect(c.lines.map((l) => l.segs[0].x)).toEqual([(1500 - 120) / 2, (1500 - 240) / 2]);
    const r = noteLayout({ ...note, just: 'BR', note: [{ runs: [{ s: 'AB' }] }] });
    expect(r.lines[0].segs[0].x).toBe(1500 - 120);
    const long = noteLayout({ ...note, w: 300, note: [{ runs: [{ s: 'A SUPERCALIFRAGILISTIC B' }] }] });
    expect(long.lines.map((l) => l.segs.map((s) => s.s).join(''))).toEqual(['A', 'SUPERCALIFRAGILISTIC', 'B']);
  });

  it('places the box by the attachment: the anchor at that corner, the lines read from the top left', () => {
    const tl = noteBox(note);
    expect(tl.tl).toEqual([1000, 5000]);
    expect(noteCorners(note)[2]).toEqual([2500, 5000 - tl.H]);
    // Middle centre: the same box, its anchor at its centre; the words do not move.
    const mc = noteAttached(note, 'MC');
    expect(mc.just).toBe('MC');
    expect(mc.pts[0]).toEqual([1750, 5000 - tl.H / 2]);
    expect(noteBox(mc).tl).toEqual([1000, 5000]);
    expect(noteAttached(mc, 'TL')).toEqual(note);
    // Bottom right, turned up the page: the box lies to the left of the anchor and above it, its lines along the angle.
    const br = noteBox({ ...note, just: 'BR', rot: Math.PI / 2, note: [{ runs: [{ s: 'AB' }] }] });
    expect(br.tl[0]).toBeCloseTo(900); // up the page, the box's top is to the left of its baseline
    expect(br.tl[1]).toBeCloseTo(3500);
    // Picking: inside the box, with a tolerance.
    expect(noteHit(note, [2000, 4500], 0)).toBe(true);
    expect(noteHit(note, [2600, 4500], 50)).toBe(false);
    expect(noteHit(note, [2540, 4500], 50)).toBe(true);
  });

  it('a wider box keeps its top left corner and wraps again; EXPLODE gives one text per line', () => {
    const wide = noteWithWidth(noteAttached(note, 'TR'), 3000);
    expect(wide.w).toBe(3000);
    expect(noteBox(wide).tl).toEqual([1000, 5000]);
    expect(noteLayout(wide).lines.length).toBe(5);
    expect(noteWithWidth(note, 10).w).toBe(200); // at least two letters wide
    const texts = explodeNote(note);
    expect(texts.map((t) => t.text)).toEqual(['GENERAL NOTES', 'All cables to be LSZH', 'unless noted otherwise', '1. Refer to the load', 'schedule', '2. Check on site']);
    expect(texts[0]).toEqual({ kind: 'text', layer: 'LV-ANNO', pts: [[1000, 4900]], text: 'GENERAL NOTES', h: 100 });
    expect(texts[2].pts[0][1]).toBeCloseTo(4900 - 1000 / 3);
    expect(plainText(note)).toBe('GENERAL NOTES\nAll cables to be LSZH unless noted otherwise\n\nRefer to the load schedule\nCheck on site');
  });
});

describe('Notes: the DXF MTEXT codes', () => {
  it('writes paragraphs, bold, underline and heights as codes and reads them back', () => {
    const s = toDxfMtext(paras);
    expect(s).toBe('{\\fArial|b1|i0;GENERAL }NOTES\\PAll cables to be \\LLSZH\\l unless noted otherwise\\P\\P1. Refer to the load schedule\\P2. Check on site');
    const back = fromDxfMtext(s);
    expect(back.map((p) => p.runs)).toEqual([paras[0].runs, paras[1].runs, [], [{ s: '1. Refer to the load schedule' }], [{ s: '2. Check on site' }]]);
    // Braces and backslashes in the words survive; a run's height goes as a factor.
    const odd: NotePara[] = [{ runs: [{ s: 'a{b}\\c', h: 1.5 }] }];
    expect(toDxfMtext(odd)).toBe('{\\H1.5x;a\\{b\\}\\\\c}');
    expect(fromDxfMtext(toDxfMtext(odd))).toEqual(odd);
  });

  it('reads what other programs write: fonts, colours, stacked fractions, %% codes, an absolute height', () => {
    const s = '\\A1;{\\fArial|b0|i0|c0|p34;\\C1;Size }\\H250;{\\fArial|b1|i0|c0|p34;\\Lbig\\l}\\P\\S1^2; %%d %%c %%p \\~x\\Nnext';
    const p = fromDxfMtext(s, 100);
    expect(p[0].runs).toEqual([{ s: 'Size ' }, { s: 'big', b: true, u: true, h: 2.5 }]);
    expect(p[1].runs).toEqual([{ s: '1/2 ° Ø ±  x', h: 2.5 }]);
    expect(p[2].runs).toEqual([{ s: 'next', h: 2.5 }]);
  });
});
