import { describe, expect, it } from 'vitest';
import { blockNameFromFile, blockThumb, defFromGeometry, defFromPieces, filterBlocks, loadRecentBlocks, pushRecentBlock, RECENT_KEY, RECENT_MAX } from './cadBlockLibrary';
import type { CadBlockDef } from './cadBlocks';
import type { RefGeometry } from './cadRefs';

/** The Blocks palette's helpers (INSERT, S10 of the Design CAD 2D gap plan). */

const def = (name: string): CadBlockDef => ({ name, items: [{ id: 'l', kind: 'line', layer: '0', pts: [[0, 0], [100, 0]] }] });
const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m }; };

describe('Recent blocks', () => {
  it('keeps the blocks inserted lately, newest first, one per name, twelve at most, and survives a storage that fails', () => {
    const s = memory();
    expect(loadRecentBlocks(s)).toEqual([]);
    let list: CadBlockDef[] = [];
    for (let i = 1; i <= 14; i += 1) list = pushRecentBlock(def(`B${i}`), list, s);
    expect(list).toHaveLength(RECENT_MAX);
    expect(list.map((d) => d.name)).toEqual(['B14', 'B13', 'B12', 'B11', 'B10', 'B9', 'B8', 'B7', 'B6', 'B5', 'B4', 'B3']);
    expect(loadRecentBlocks(s).map((d) => d.name)).toEqual(list.map((d) => d.name));
    list = pushRecentBlock({ ...def('b9'), description: 'again' }, list, s);
    expect(list.map((d) => d.name).slice(0, 3)).toEqual(['b9', 'B14', 'B13']);
    expect(list.filter((d) => d.name.toLowerCase() === 'b9')).toHaveLength(1);
    s.m.set(RECENT_KEY, 'not json');
    expect(loadRecentBlocks(s)).toEqual([]);
    const broken = { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); } };
    expect(loadRecentBlocks(broken)).toEqual([]);
    expect(pushRecentBlock(def('X'), [], broken).map((d) => d.name)).toEqual(['X']);
    expect(loadRecentBlocks(undefined)).toEqual([]);
  });
});

describe('Blocks from elsewhere', () => {
  it('names a block after its drawing file and makes one of a drawing\'s lines, texts and fills', () => {
    expect(blockNameFromFile('/Library/Symbols/DB-TYPE-A.dwg')).toBe('DB-TYPE-A');
    expect(blockNameFromFile('socket.DXF')).toBe('socket');
    const g: RefGeometry = {
      file: 'sym.dwg', units: 4, segs: Float64Array.from([0, 0, 100, 0, 100, 0, 100, 50]), segLayers: Uint16Array.from([0, 1]), layers: [{ name: 'A', rgb: 0 }, { name: 'B', rgb: 0 }],
      stamp: 's', texts: [{ x: 10, y: 10, h: 25, rot: 0, s: 'DB', layer: 1 }], fills: [{ layer: 0, solid: true, loops: [[[0, 0], [10, 0], [10, 10]]], lines: [] }]
    };
    const d = defFromGeometry('SYM', g);
    expect(d.name).toBe('SYM');
    expect(d.units).toBe(4);
    expect(d.items.map((it) => [it.kind, it.layer])).toEqual([['line', 'A'], ['line', 'B'], ['text', 'B'], ['pline', 'A']]);
    expect(d.items[1].pts).toEqual([[100, 0], [100, 50]]);
    expect(d.items[3]).toMatchObject({ closed: true, hatch: { pattern: 'solid' } });
  });

  it('makes a block of the pieces an architect\'s block explodes into, about its lowest left corner or the base given', () => {
    const d = defFromPieces('CHAIR', [
      { layer: 'FURN', kind: 'line', a: [1000, 2000], b: [1500, 2000] }, { layer: 'FURN', kind: 'circle', c: [1250, 2250], r: 100, color: 0xff0000 },
      { layer: 'FURN', kind: 'text', at: [1010, 2010], h: 50, rot: 0, text: 'C1' }, { layer: 'FURN', kind: 'pline', pts: [[1000, 2000, 0], [1000, 2500, 0]], closed: false }
    ]);
    expect(d.items.map((it) => [it.kind, it.pts[0]])).toEqual([['line', [0, 0]], ['circle', [250, 250]], ['text', [10, 10]], ['pline', [0, 0]]]);
    expect(d.items[1].color).toBe('#ff0000');
    expect(defFromPieces('X', [{ layer: 'F', kind: 'line', a: [10, 10], b: [20, 10] }], [10, 0]).items[0].pts).toEqual([[0, 10], [10, 10]]);
  });

  it('draws a small picture of a block that fits its box, and finds blocks by the words typed', () => {
    const t = blockThumb({ name: 'T', items: [{ id: 'a', kind: 'line', layer: '0', pts: [[0, 0], [400, 0]] }, { id: 'b', kind: 'line', layer: '0', pts: [[0, 0], [0, 300]] }] });
    expect(t.lines).toHaveLength(2);
    const xs = t.lines.flat().map((q) => q[0]), ys = t.lines.flat().map((q) => q[1]);
    expect(Math.min(...xs)).toBeCloseTo((4 / 3 - 1.2) / 2); expect(Math.max(...xs)).toBeCloseTo((4 / 3 + 1.2) / 2);
    expect(Math.min(...ys)).toBeCloseTo(0.05); expect(Math.max(...ys)).toBeCloseTo(0.95);
    expect(blockThumb({ name: 'E', items: [] })).toEqual({ lines: [], texts: [] });
    const list = [def('DB-TYPE-A'), def('DB-TYPE-B'), def('Socket twin')];
    expect(filterBlocks(list, 'db').map((d) => d.name)).toEqual(['DB-TYPE-A', 'DB-TYPE-B']);
    expect(filterBlocks(list, 'twin sock').map((d) => d.name)).toEqual(['Socket twin']);
    expect(filterBlocks(list, '  ')).toBe(list);
  });
});

describe('drawing hatches with islands', () => {
  it('a solid fill with several loops is one hatch: the largest loop outlines it, the others are its islands', () => {
    const g: RefGeometry = {
      file: 'sym.dwg', units: 4, segs: new Float64Array(), segLayers: new Uint16Array(), layers: [{ name: 'A', rgb: 0 }], stamp: 's',
      fills: [{ layer: 0, solid: true, loops: [[[4, 4], [6, 4], [6, 6]], [[0, 0], [10, 0], [10, 10], [0, 10]]], lines: [] }]
    };
    const d = defFromGeometry('SYM', g);
    expect(d.items).toHaveLength(1);
    expect(d.items[0]).toMatchObject({ kind: 'pline', pts: [[0, 0], [10, 0], [10, 10], [0, 10]], holes: [[[4, 4], [6, 4], [6, 6]]], hatch: { pattern: 'solid' } });
    const p = defFromPieces('H', [{ layer: 'A', kind: 'hatch', solid: true, pattern: 'SOLID', loops: [[[4, 4, 0], [6, 4, 0], [6, 6, 0]], [[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0]]] }], [0, 0]);
    expect(p.items).toHaveLength(1);
    expect(p.items[0].holes).toHaveLength(1);
    // A patterned fill stays plain outlines, one per loop.
    expect(defFromPieces('H', [{ layer: 'A', kind: 'hatch', solid: false, pattern: 'ANSI31', loops: [[[4, 4, 0], [6, 4, 0], [6, 6, 0]], [[0, 0, 0], [10, 0, 0], [10, 10, 0]]] }], [0, 0]).items).toHaveLength(2);
  });
});
