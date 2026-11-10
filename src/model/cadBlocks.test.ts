import { describe, expect, it } from 'vitest';
import { blockable, blockDefsOf, blockNameError, defineBlock, expandAll, expandInsert, explodeInsert, insertedNames, withBlockDef, type CadBlockDef } from './cadBlocks';
import { sampleProject } from '../data/sampleProject';
import type { Project, SketchItem } from '../types';

/** Block definitions and inserts (BLOCK, S9 of the Design CAD 2D gap plan). */

const rect: SketchItem = { id: 'S1', kind: 'pline', layer: '0', closed: true, pts: [[1000, 1000], [1400, 1000], [1400, 1300], [1000, 1300]] };
const txt: SketchItem = { id: 'S2', kind: 'text', layer: 'LV-ANNO', pts: [[1050, 1100]], text: 'DB', h: 100, color: '#ff0000' };
const circ: SketchItem = { id: 'S3', kind: 'circle', layer: '0', pts: [[1200, 1150]], r: 50 };
const tray: SketchItem = { id: 'S4', kind: 'pline', layer: 'E-TRAY', pts: [[0, 0], [1, 0]], tray: { widthMm: 300 } };
const def = defineBlock('DB-A', [rect, txt, circ, tray], [1000, 1000], { units: 4, description: 'Board symbol' });
const rnd = (p: [number, number]) => p.map((v) => Math.round(v * 1000) / 1000);

describe('BLOCK', () => {
  it('defines a block from the objects relative to its base point, trays and cable routes left out', () => {
    expect(def.name).toBe('DB-A');
    expect(def.items.map((x) => x.id)).toEqual(['S1', 'S2', 'S3']);
    expect(def.items[0].pts).toEqual([[0, 0], [400, 0], [400, 300], [0, 300]]);
    expect(def.items[1].pts).toEqual([[50, 100]]);
    expect(def).toMatchObject({ units: 4, description: 'Board symbol', explodable: true });
    expect(blockable(tray)).toBe(false);
  });

  it('refuses blank names, forbidden characters and the architect\'s block names', () => {
    expect(blockNameError('')).toBe('Type a name for the block.');
    expect(blockNameError('DB/A')).toMatch(/cannot contain/);
    expect(blockNameError('DB A')).toBeUndefined();
    expect(blockNameError('chair', ['CHAIR'])).toMatch(/already has a block "chair" of its own/);
    expect(blockNameError('x'.repeat(256))).toMatch(/255/);
  });

  it('keeps blocks per drawing and redefines by name, case aside', () => {
    const p1 = withBlockDef(sampleProject as Project, 'gf.dwg', def);
    expect(blockDefsOf(p1, 'GF.DWG').map((d) => d.name)).toEqual(['DB-A']);
    const p2 = withBlockDef(p1, 'gf.dwg', { ...def, name: 'db-a', description: 'new' });
    expect(blockDefsOf(p2, 'gf.dwg').map((d) => [d.name, d.description])).toEqual([['db-a', 'new']]);
    expect(blockDefsOf(withBlockDef(p2, 'ff.dwg', { name: 'B2', items: [] }), 'gf.dwg')).toHaveLength(1);
  });

  it('an insert shows the block scaled, turned and moved, layer 0 and unset colours taking the insert\'s', () => {
    const ins: SketchItem = { id: 'S9', kind: 'insert', layer: 'E-POWER', pts: [[5000, 2000]], block: 'DB-A', sc: 2, rot: Math.PI / 2, color: '#00ff00' };
    const shown = expandInsert(ins, [def]);
    expect(shown.map((x) => [x.id, x.kind, x.layer, x.color])).toEqual([['S9:S1', 'pline', 'E-POWER', '#00ff00'], ['S9:S2', 'text', 'LV-ANNO', '#ff0000'], ['S9:S3', 'circle', 'E-POWER', '#00ff00']]);
    // The rectangle's corner (400, 0) scaled to (800, 0), turned to (0, 800), at (5000, 2800).
    expect(shown[0].pts.map(rnd)).toEqual([[5000, 2000], [5000, 2800], [4400, 2800], [4400, 2000]]);
    expect([shown[1].h, shown[1].rot]).toEqual([200, Math.PI / 2]);
    expect(shown[2].r).toBe(100);
    expect(rnd(shown[2].pts[0])).toEqual([4700, 2400]);
    // A block the drawing does not have shows nothing; the others pass through expandAll as they are.
    expect(expandInsert({ ...ins, block: 'NOPE' }, [def])).toEqual([]);
    expect(expandAll([txt, ins], [def]).map((x) => x.id)).toEqual(['S2', 'S9:S1', 'S9:S2', 'S9:S3']);
    expect(expandAll([txt, ins], [])).toEqual([txt, ins]);
    expect(insertedNames([txt, ins, { ...ins, id: 'S10' }])).toEqual(['DB-A']);
  });

  it('a block in a block expands in turn; EXPLODE gives the objects without ids', () => {
    const inner: CadBlockDef = { name: 'DOT', items: [{ id: 'c', kind: 'circle', layer: '0', pts: [[0, 0]], r: 10 }] };
    const outer: CadBlockDef = { name: 'PAIR', items: [{ id: 'i1', kind: 'insert', layer: '0', pts: [[-50, 0]], block: 'DOT' }, { id: 'i2', kind: 'insert', layer: '0', pts: [[50, 0]], block: 'DOT' }] };
    const ins: SketchItem = { id: 'S5', kind: 'insert', layer: 'LV-SKETCH', pts: [[1000, 1000]], block: 'PAIR', sc: 2 };
    const shown = expandInsert(ins, [inner, outer]);
    expect(shown.map((x) => [x.id, x.layer, x.r, ...x.pts[0]])).toEqual([['S5:i1:c', 'LV-SKETCH', 20, 900, 1000], ['S5:i2:c', 'LV-SKETCH', 20, 1100, 1000]]);
    const loop: CadBlockDef = { name: 'LOOP', items: [{ id: 'l', kind: 'insert', layer: '0', pts: [[0, 0]], block: 'LOOP' }] };
    expect(expandInsert({ ...ins, block: 'LOOP' }, [loop])).toEqual([]);
    expect(explodeInsert(ins, [inner, outer]).every((x) => !('id' in x))).toBe(true);
  });
});
