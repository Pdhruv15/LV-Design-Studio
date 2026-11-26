import { describe, expect, it } from 'vitest';
import { blockStandIn, drawnFromPieces, standInHandle, standInsFor, takeOverNote, takeOverSummary, type BlockInfo } from './cadTakeOver';
import { expandInsert } from './cadBlocks';
import { gripMoved, gripsOf } from './cadEdit';
import { placedLines } from './cadHatch';
import { linetypeIdOf, lineweightOf } from './cadLayerStyle';
import type { CadPiece } from './cadCrop';

type P2 = [number, number];
const S = { layer: 'E-LIGHT' };

describe('drawnFromPieces: an opened drawing\'s object as drawn objects', () => {
  it('a line keeps layer, colour, linetype and lineweight (lineweight snapped to a standard one)', () => {
    const [l] = drawnFromPieces([{ ...S, kind: 'line', a: [0, 0], b: [3, 4], color: 0xff8000, lt: 'DASHED', lw: 52 }]);
    expect(l).toEqual({ layer: 'E-LIGHT', kind: 'line', pts: [[0, 0], [3, 4]], color: '#ff8000', lt: 'dashed', ltName: 'DASHED', lw: 0.5 });
  });
  it('foreground colour, unknown linetype and no lineweight leave those out', () => {
    const [l] = drawnFromPieces([{ ...S, kind: 'line', a: [0, 0], b: [1, 0], color: 0xff000007, lt: 'ACAD_ISO02W100' }]);
    expect(l).toEqual({ layer: 'E-LIGHT', kind: 'line', pts: [[0, 0], [1, 0]], ltName: 'ACAD_ISO02W100' });
  });
  it('arc, circle, point', () => {
    const r = drawnFromPieces([{ ...S, kind: 'arc', c: [1, 2], r: 3, a0: 0.5, a1: 2 }, { ...S, kind: 'circle', c: [4, 5], r: 6, lt: 'CENTER2' }, { ...S, kind: 'point', at: [7, 8] }]);
    expect(r[0]).toMatchObject({ kind: 'arc', pts: [[1, 2]], r: 3, a0: 0.5, a1: 2 });
    expect(r[1]).toMatchObject({ kind: 'circle', pts: [[4, 5]], r: 6, lt: 'center', ltName: 'CENTER2' });
    expect(r[2]).toMatchObject({ kind: 'point', pts: [[7, 8]] });
  });
  it('a polyline keeps its bulges and closed; none when all are straight', () => {
    const [a, b, c] = drawnFromPieces([
      { ...S, kind: 'pline', pts: [[0, 0, 0], [10, 0, 1], [10, 4, 0], [0, 4, 1]], closed: true, lw: 35 },
      { ...S, kind: 'pline', pts: [[0, 0, 0], [1, 1, 0]], closed: false },
      { ...S, kind: 'pline', pts: [[0, 0, 0]], closed: false }
    ] as CadPiece[]);
    expect(a).toMatchObject({ kind: 'pline', closed: true, pts: [[0, 0], [10, 0], [10, 4], [0, 4]], bulges: [0, 1, 0, 1], lw: 0.35 });
    expect(b.bulges).toBeUndefined(); expect(b.closed).toBeUndefined();
    expect(c).toBeUndefined();
  });
  it('text keeps height, rotation and justification; an empty text is dropped', () => {
    const r = drawnFromPieces([{ ...S, kind: 'text', at: [1, 1], h: 2.5, rot: 0.5, text: 'DB-1', just: 'C' }, { ...S, kind: 'text', at: [1, 1], h: 2, rot: 0, text: ' ' }]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kind: 'text', pts: [[1, 1]], text: 'DB-1', h: 2.5, rot: 0.5, just: 'C' });
  });
  it('a 2D solid is a closed polyline with a solid hatch', () => {
    const [s] = drawnFromPieces([{ ...S, kind: 'solid', pts: [[0, 0], [1, 0], [1, 1], [0, 1]] }]);
    expect(s).toMatchObject({ kind: 'pline', closed: true, hatch: { pattern: 'solid' } });
  });
  it('a solid hatch is one hatch with islands; a patterned one becomes outlines', () => {
    const big: [number, number, number][] = [[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0]], hole: [number, number, number][] = [[2, 2, 0], [4, 2, 0], [4, 4, 0]];
    const solid = drawnFromPieces([{ ...S, kind: 'hatch', loops: [hole, big], solid: true, pattern: 'SOLID', color: 0xff0000 }]);
    expect(solid).toHaveLength(1);
    expect(solid[0]).toMatchObject({ pts: [[0, 0], [10, 0], [10, 10], [0, 10]], holes: [[[2, 2], [4, 2], [4, 4]]], color: '#ff0000', hatch: { pattern: 'solid' } });
    const pat = drawnFromPieces([{ ...S, kind: 'hatch', loops: [hole, big], solid: false, pattern: 'ANSI31' }]);
    expect(pat).toHaveLength(2);
    expect(pat.every((x) => x.kind === 'pline' && x.closed && !x.hatch)).toBe(true);
  });
  it('groups (dimensions, nested blocks) are flattened into their pieces', () => {
    const r = drawnFromPieces([{ ...S, kind: 'group', items: [{ ...S, kind: 'line', a: [0, 0] as P2, b: [1, 0] as P2 }, { ...S, kind: 'group', items: [{ ...S, kind: 'text', at: [0, 0] as P2, h: 1, rot: 0, text: '5' }] }] }]);
    expect(r.map((x) => x.kind)).toEqual(['line', 'text']);
  });
});

describe('drawnFromPieces: what is taken over whole', () => {
  it('a full ellipse stays an ellipse; a sampled one is a polyline and is counted', () => {
    const [e] = drawnFromPieces([{ ...S, kind: 'ellipse', c: [10, 5], axis: [0, 4], ratio: 0.5, color: 0xff0000 }]);
    expect(e).toEqual({ layer: 'E-LIGHT', kind: 'ellipse', pts: [[10, 5]], ax: [0, 4], ratio: 0.5, color: '#ff0000' });
    const pieces: CadPiece[] = [{ ...S, kind: 'pline', pts: [[0, 0, 0], [1, 1, 0]], closed: false, sampled: 'spline' }, { ...S, kind: 'pline', pts: [[0, 0, 0], [1, 1, 0]], closed: false, sampled: 'ellipse' },
      { ...S, kind: 'group', items: [{ ...S, kind: 'pline', pts: [[0, 0, 0], [1, 1, 0]], closed: false, sampled: 'spline' }] }];
    expect(drawnFromPieces(pieces).map((x) => x.kind)).toEqual(['pline', 'pline', 'pline']);
    const sum = takeOverSummary(pieces);
    expect(sum).toEqual({ splines: 2, ellipses: 1, hatches: 0 });
    expect(takeOverNote(sum)).toBe('2 splines as polylines · 1 partial ellipse as polylines');
    expect(takeOverNote({ splines: 1, ellipses: 0, hatches: 0 })).toBe('1 spline as polylines');
    expect(takeOverNote({ splines: 0, ellipses: 0, hatches: 0 })).toBe('');
  });
  it('a paragraph text is a note with its box, attachment and line spacing; codes become runs', () => {
    const [n] = drawnFromPieces([{ ...S, kind: 'mtext', at: [1, 2], h: 2.5, rot: 0.5, w: 40, attach: 9, lsp: 1.5, text: '{\\fArial|b1;Head}\\Pbody' }]);
    expect(n).toMatchObject({ kind: 'mtext', pts: [[1, 2]], h: 2.5, rot: 0.5, w: 40, just: 'BR', lsp: 1.5 });
    expect(n.note?.map((q) => q.runs.map((r) => [r.s, !!r.b]))).toEqual([[['Head', true]], [['body', false]]]);
    // Defaults left out: top left, no box, spacing 1; an empty text is dropped.
    const [d] = drawnFromPieces([{ ...S, kind: 'mtext', at: [0, 0], h: 2, rot: 0, w: 0, attach: 1, lsp: 1, text: 'x' }]);
    expect(d).not.toHaveProperty('just'); expect(d).not.toHaveProperty('w'); expect(d).not.toHaveProperty('lsp'); expect(d).not.toHaveProperty('rot');
    expect(drawnFromPieces([{ ...S, kind: 'mtext', at: [0, 0], h: 2, rot: 0, w: 0, attach: 1, lsp: 1, text: '' }])).toEqual([]);
  });
  it('a text keeps its justification (its anchor is the alignment point)', () => {
    expect(drawnFromPieces([{ ...S, kind: 'text', at: [5, 5], h: 2, rot: 0, text: 'A', just: 'MC' }])[0]).toMatchObject({ pts: [[5, 5]], just: 'MC' });
  });
  const sq: [number, number, number][] = [[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0]];
  it('a patterned hatch is one hatch with its built-in pattern, spacing, angle and origin', () => {
    // ANSI31 at 3 paper mm, 4 drawing units per paper mm, turned 30°: the drawing keeps 45° + 30° lines 12 apart.
    const a = Math.PI / 4 + Math.PI / 6, step = 12;
    const lines = [{ angle: a, base: [100, 50] as [number, number], offset: [-step * Math.sin(a), step * Math.cos(a)] as [number, number], dashes: [] }];
    const hole: [number, number, number][] = [[2, 2, 0], [4, 2, 0], [4, 4, 0]];
    const r = drawnFromPieces([{ ...S, kind: 'hatch', loops: [hole, sq], solid: false, pattern: 'ANSI31', scale: 1, angle: 0.5, origin: [0, 0], lines }], { unit: 4 });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kind: 'pline', closed: true, pts: [[0, 0], [10, 0], [10, 10], [0, 10]], holes: [[[2, 2], [4, 2], [4, 4]]] });
    expect(r[0].hatch?.pattern).toBe('ansi31');
    expect(r[0].hatch?.scale).toBeCloseTo(3, 6);
    expect(r[0].hatch?.angle).toBeCloseTo(30, 6);
    expect(r[0].hatch?.custom).toBeUndefined();
    expect(r[0].hatch?.origin).toEqual([100, 50]);
    // The app draws the same lines the drawing has.
    const mine = placedLines(r[0].hatch!, 4)[0];
    expect(mine.angle).toBeCloseTo(a, 9); expect(mine.offset[0]).toBeCloseTo(lines[0].offset[0], 9); expect(mine.offset[1]).toBeCloseTo(lines[0].offset[1], 9);
  });
  it('a pattern the app has no name for becomes a pattern of its own, with its dashes', () => {
    const lines = [{ angle: 0, base: [0, 0] as [number, number], offset: [0, 2] as [number, number], dashes: [1, -1] }, { angle: Math.PI / 2, base: [0, 0] as [number, number], offset: [-3, 0] as [number, number], dashes: [] }];
    const r = drawnFromPieces([{ ...S, kind: 'hatch', loops: [sq], solid: false, pattern: 'MY-FILL', scale: 1, angle: 0, origin: [0, 0], lines }], { unit: 1 });
    expect(r[0].hatch?.pattern).toBe('MY-FILL');
    expect(r[0].hatch?.custom?.lines).toHaveLength(2);
    expect(r[0].hatch?.scale).toBeCloseTo(2, 9);
    expect(r[0].hatch?.custom?.lines[0].dashes).toEqual([0.5, -0.5]);
    expect(takeOverSummary([{ ...S, kind: 'hatch', loops: [sq], solid: false, pattern: 'MY-FILL', scale: 1, angle: 0, lines }]).hatches).toBe(0);
  });
  it('lines the app cannot draw fall back to ANSI31 and are counted', () => {
    const p: CadPiece = { ...S, kind: 'hatch', loops: [sq], solid: false, pattern: 'WEIRD', scale: 1, angle: 0, origin: [0, 0], lines: [{ angle: 0, base: [0, 0], offset: [5, 0], dashes: [] }] };
    expect(drawnFromPieces([p])[0].hatch?.pattern).toBe('ansi31');
    expect(takeOverSummary([p]).hatches).toBe(1);
    expect(takeOverNote(takeOverSummary([p]))).toBe('1 hatch pattern not readable, ANSI31 used');
  });
  it('a hatch of a drawing read without its lines stays its outlines; a solid one is as before', () => {
    expect(drawnFromPieces([{ ...S, kind: 'hatch', loops: [sq], solid: false, pattern: 'ANSI31' }])[0].hatch).toBeUndefined();
    expect(drawnFromPieces([{ ...S, kind: 'hatch', loops: [sq], solid: true, pattern: 'SOLID', scale: undefined }])[0].hatch?.pattern).toBe('solid');
  });
  const look = { arrow: 'tick' as const, size: 2, off: 1, ext: 1.5, unit: 'mm' as const, decimals: 2 };
  it('a dimension with its definition is one drawn dimension in the style\'s look, with the drawing\'s sizes', () => {
    const base = { ...S, kind: 'group' as const, items: [{ ...S, kind: 'line' as const, a: [0, 0] as P2, b: [1, 0] as P2 }] };
    const [al] = drawnFromPieces([{ ...base, dim: { kind: 'aligned', pts: [[0, 0], [10, 0], [10, 3]], height: 3, arrow: 2.5, decimals: 1 } }], { dim: { look, textH: 2.5 } });
    expect(al).toMatchObject({ kind: 'dim', layer: 'E-LIGHT', pts: [[0, 0], [10, 0], [10, 3]], h: 3, look: { arrow: 'tick', size: 2.5, off: 1, ext: 1.5, decimals: 1 } });
    expect(al).not.toHaveProperty('dir'); expect(al).not.toHaveProperty('dimKind'); expect(al).not.toHaveProperty('text');
    const [li] = drawnFromPieces([{ ...base, dim: { kind: 'linear', pts: [[0, 0], [10, 6], [12, 3]], dir: Math.PI / 2, text: '6 m' } }], { dim: { look, textH: 2.5 } });
    expect(li).toMatchObject({ kind: 'dim', dir: Math.PI / 2, text: '6 m', h: 2.5, look: { size: 2 } });
    const kinds = (['radius', 'diameter'] as const).map((k) => drawnFromPieces([{ ...base, dim: { kind: k, pts: [[5, 5], [15, 5], [18, 5]] } }])[0].dimKind);
    expect(kinds).toEqual(['radius', 'diameter']);
    const [an] = drawnFromPieces([{ ...base, dim: { kind: 'angular', pts: [[0, 0], [8, 0], [0, 8], [5, 5]] } }]);
    expect(an).toMatchObject({ dimKind: 'angular', pts: [[0, 0], [8, 0], [0, 8], [5, 5]] });
    expect((an.look?.size ?? 0) > 0 && (an.h ?? 0) > 0).toBe(true); // a plain look without a style
  });
  it('a dimension without its definition is flattened into its pieces as before', () => {
    const r = drawnFromPieces([{ ...S, kind: 'group', items: [{ ...S, kind: 'line', a: [0, 0], b: [1, 0] }, { ...S, kind: 'text', at: [0, 0], h: 1, rot: 0, text: '5' }] }]);
    expect(r.map((x) => x.kind)).toEqual(['line', 'text']);
  });
});

describe('linetypeIdOf / lineweightOf', () => {
  it('matches by id or label, case aside, and the 2 / X2 variants', () => {
    expect(linetypeIdOf('Continuous')).toBe('continuous');
    expect(linetypeIdOf('DASHED')).toBe('dashed');
    expect(linetypeIdOf('hidden2')).toBe('hidden');
    expect(linetypeIdOf('HIDDENX2')).toBe('hidden');
    expect(linetypeIdOf('Center')).toBe('center');
    expect(linetypeIdOf('CENTER2')).toBe('center');
    expect(linetypeIdOf('DASHDOT')).toBe('dashdot');
    expect(linetypeIdOf('Dash dot')).toBe('dashdot');
    expect(linetypeIdOf('PHANTOMX2')).toBe('phantom');
    expect(linetypeIdOf('DOT2')).toBe('dot');
  });
  it('unknown names are undefined', () => {
    for (const n of ['ByLayer', 'ByBlock', 'ACAD_ISO02W100', 'GAS_LINE', '']) expect(linetypeIdOf(n)).toBeUndefined();
  });
  it('lineweight: hundredths of a mm to the nearest standard one; none for absent or default', () => {
    expect(lineweightOf(undefined)).toBeUndefined(); expect(lineweightOf(0)).toBeUndefined(); expect(lineweightOf(-1)).toBeUndefined();
    expect(lineweightOf(25)).toBe(0.25); expect(lineweightOf(30)).toBe(0.25); expect(lineweightOf(32)).toBe(0.35); expect(lineweightOf(211)).toBe(1);
  });
});

describe('standInsFor: the drawn objects an opened drawing\'s object stands in as', () => {
  it('ids dw:<handle>:<n>, with the piece\'s own look; the handle comes back from an id', () => {
    const r = standInsFor('2A', [{ ...S, kind: 'line', a: [0, 0], b: [1, 0], color: 0xff0000 }, { ...S, kind: 'circle', c: [4, 5], r: 6 }]);
    expect(r.map((x) => x.id)).toEqual(['dw:2A:0', 'dw:2A:1']);
    expect(r[0]).toMatchObject({ kind: 'line', color: '#ff0000' });
    expect(standInHandle('dw:2A:1')).toBe('2A');
    expect(standInHandle('S12')).toBeUndefined();
    expect(standInsFor('2A', [])).toEqual([]);
  });
});

describe('blockStandIn: a block of the opened drawing as one app block', () => {
  const box: CadPiece[] = [{ layer: '0', kind: 'line', a: [0, 0], b: [10, 0] }, { layer: 'E-SYM', kind: 'circle', c: [5, 5], r: 2, color: 0xff0000 }];
  const info = (over: Partial<BlockInfo> = {}): BlockInfo => ({ name: 'DB-SYM', at: [100, 50], sx: 1, sy: 1, rot: 0, flipped: false, rows: 1, cols: 1, base: [3, 4], s: { layer: 'E-LIGHT' }, items: box, attdefs: [], attribs: [], ...over });
  const def = { tag: 'CCT', prompt: 'Circuit?', text: 'L1', at: [1, 2] as [number, number], h: 2, rot: 0, invisible: false, constant: false, preset: false, verify: false, s: { layer: '0' } };
  const attrib = (at: [number, number], over = {}) => ({ tag: 'CCT', value: 'L1-07', at, h: 2, rot: 0, invisible: false, ...over });

  it('gives one insert at the insertion point and the definition in block coordinates', () => {
    const r = blockStandIn('3A', info({ sx: 2, sy: 2, rot: 0.5 }), [], 4)!;
    expect(r.insert).toEqual({ id: 'dw:3A:0', kind: 'insert', layer: 'E-LIGHT', pts: [[100, 50]], block: 'DB-SYM', sc: 2, rot: 0.5 });
    expect(r.def).toMatchObject({ name: 'DB-SYM', units: 4, explodable: true });
    expect(r.def.items.map((x) => [x.kind, x.layer, x.pts])).toEqual([['line', '0', [[0, 0], [10, 0]]], ['circle', 'E-SYM', [[5, 5]]]]);
    expect(r.def.items[1].color).toBe('#ff0000');
  });
  it('the insert has one grip, and dragging it moves the whole block', () => {
    const { insert } = blockStandIn('3A', info(), [])!;
    expect(gripsOf(insert)).toHaveLength(1);
    expect(gripMoved(insert, 0, [130, 70])).toMatchObject({ kind: 'insert', pts: [[130, 70]], block: 'DB-SYM' });
  });
  it('the insert shows the drawing\'s layer 0 and ByBlock children in its own layer and colour', () => {
    const r = blockStandIn('3A', info({ s: { layer: 'E-LIGHT', color: 0x00ff00 } }), [])!;
    expect(r.insert.color).toBe('#00ff00');
    const shown = expandInsert(r.insert, [r.def]);
    expect(shown[0]).toMatchObject({ layer: 'E-LIGHT', color: '#00ff00', pts: [[100, 50], [110, 50]] });
    expect(shown[1]).toMatchObject({ layer: 'E-SYM', color: '#ff0000' });
  });
  it('attributes become attribute definitions and values', () => {
    const r = blockStandIn('3A', info({ rot: Math.PI / 2, sx: 2, sy: 2, attdefs: [{ ...def, invisible: false }], attribs: [attrib([96, 52], { h: 4, rot: Math.PI / 2 })] }), [])!;
    expect(r.insert.attrs).toEqual({ CCT: 'L1-07' });
    expect(r.def.items.find((x) => x.kind === 'attdef')).toMatchObject({ tag: 'CCT', prompt: 'Circuit?', text: 'L1', pts: [[1, 2]], h: 2, layer: '0' });
    expect(blockStandIn('3A', info({ attdefs: [{ ...def, constant: true }] }), [])!.insert.attrs).toBeUndefined();
  });
  it('is none for the cases the app\'s insert cannot show', () => {
    const sa = (i: Partial<BlockInfo>) => blockStandIn('3A', info(i), []);
    expect(sa({ name: '*U12' })).toBeNull();
    expect(sa({ rows: 2, cols: 3 })).toBeNull();
    expect(sa({ sx: 2, sy: 1 })).toBeNull();
    expect(sa({ sx: -1, sy: 1 })).toBeNull();
    expect(sa({ flipped: true })).toBeNull();
    expect(sa({ items: [] })).toBeNull();
    expect(sa({ items: [{ layer: '0', kind: 'line', a: [0, 0], b: [1, 0], lt: 'DASHED' }] })).toBeNull();
    expect(sa({ attribs: [attrib([101, 52])] })).toBeNull();
    expect(sa({ attdefs: [def], attribs: [attrib([140, 90])] })).toBeNull();
    expect(sa({ attdefs: [def], attribs: [attrib([101, 52], { invisible: true })] })).toBeNull();
    expect(sa({ attdefs: [def], attribs: [] })).toBeNull();
    expect(sa({ attdefs: [def], attribs: [attrib([101, 52])] })).not.toBeNull();
  });
  it('another block of that name in the project gives none; an equal one is reused', () => {
    const mine = blockStandIn('3A', info(), [])!.def;
    expect(blockStandIn('3B', info(), [{ ...mine, name: 'db-sym', items: mine.items.map((x, i) => ({ ...x, id: `p${i}`, pts: x.pts.map(([a, b]) => [a + 1e-9, b] as [number, number]) })) }])!.def.name).toBe('db-sym');
    expect(blockStandIn('3B', info(), [{ ...mine, items: mine.items.slice(1) }])).toBeNull();
  });
});
