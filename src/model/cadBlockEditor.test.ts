import { describe, expect, it } from 'vitest';
import { BE_LAYER, blockEditorChanged, blockEditorDxf, blockEditorFile, blockEditorOf, closeBlockEditor, isBlockEditorFile, openBlockEditor, saveBlockEditor } from './cadBlockEditor';
import { blockDefOf, blockDefsOf, type CadBlockDef } from './cadBlocks';
import { sketchOf, withSketchItems } from './cadSketch';
import { currentLayerOf } from './cadLayerState';
import { sampleProject } from '../data/sampleProject';
import type { Project, SketchItem } from '../types';

const HOST = 'plan = GF.dwg';
const line = (id: string, a: [number, number], b: [number, number]): SketchItem => ({ id, kind: 'line', layer: '0', pts: [a, b] });
const LAMP: CadBlockDef = { name: 'LAMP 1', units: 4, description: 'Ceiling lamp', explodable: true, items: [line('b1', [-100, 0], [100, 0]), { id: 'b2', kind: 'circle', layer: '0', pts: [[0, 0]], r: 80 }] };
const TAG: CadBlockDef = { name: 'TAG', items: [{ id: 'b1', kind: 'text', layer: '0', pts: [[0, 0]], text: 'X', h: 50 }] };
const base: Project = {
  ...sampleProject,
  cadBlockDefs: [{ file: HOST, defs: [LAMP, TAG] }],
  cadSketch: [{ file: HOST, items: [
    { id: 'S1', kind: 'insert', layer: 'E-LTG', pts: [[1000, 1000]], block: 'LAMP 1' },
    { id: 'S2', kind: 'insert', layer: 'E-LTG', pts: [[3000, 1000]], block: 'lamp 1' },
    { id: 'S3', kind: 'insert', layer: 'E-LTG', pts: [[5000, 1000]], block: 'TAG' }
  ] }]
};

describe('block editor (BEDIT, BSAVE, BCLOSE)', () => {
  it('names its drawing after the block and the drawing it is in, and reads them back (a block name has no "=")', () => {
    const f = blockEditorFile('LAMP 1', HOST);
    expect(f).toBe('Block LAMP 1 = plan = GF.dwg.dxf');
    expect(blockEditorOf(f)).toEqual({ name: 'LAMP 1', host: HOST });
    expect([isBlockEditorFile(f), isBlockEditorFile(HOST), blockEditorOf(undefined)]).toEqual([true, false, undefined]);
  });

  it('opens a block: its objects as the drawing\'s own (ids from S1), the other blocks copied in; none for a block it does not have', () => {
    const r = openBlockEditor(base, HOST, 'lamp 1', 4)!;
    expect(r.file).toBe(blockEditorFile('LAMP 1', HOST));
    expect(sketchOf(r.project, r.file).map((it) => [it.id, it.kind])).toEqual([['S1', 'line'], ['S2', 'circle']]);
    expect(blockDefsOf(r.project, r.file).map((d) => d.name)).toEqual(['TAG']);
    expect(blockEditorChanged(r.project, r.file)).toBe(false);
    expect(currentLayerOf(r.project, r.file)).toBe('0'); // new objects take the insert's layer
    expect(openBlockEditor(base, HOST, 'NOPE')).toBeUndefined();
  });

  it('its own drawing: the base point and the block\'s extents on BE-REF, in the block\'s units', () => {
    const dxf = blockEditorDxf(LAMP, [TAG], 6);
    expect(dxf).toContain(BE_LAYER);
    expect(dxf).toContain('BASE POINT OF LAMP 1');
    expect(dxf).toMatch(/\$INSUNITS\s+70\s+4\b/);
    expect(blockEditorDxf({ ...LAMP, units: undefined }, [], 6)).toMatch(/\$INSUNITS\s+70\s+6\b/);
  });

  it('BSAVE: the objects into the block (its other fields kept), the inserts counted, a new block carried back; nothing when unchanged', () => {
    const r = openBlockEditor(base, HOST, 'LAMP 1')!;
    expect(saveBlockEditor(r.project, r.file)).toMatchObject({ changed: false, message: 'BSAVE  "LAMP 1" has no changes to save.' });
    const NEW: CadBlockDef = { name: 'ARROW', items: [line('b1', [0, 0], [10, 0])] };
    let p = withSketchItems(r.project, r.file, [...sketchOf(r.project, r.file), line('S3', [0, -50], [0, 50]), { id: 'S4', kind: 'insert', layer: '0', pts: [[0, 0]], block: 'ARROW' }]);
    p = { ...p, cadBlockDefs: p.cadBlockDefs!.map((t) => (t.file === r.file ? { ...t, defs: [...t.defs, NEW] } : t)) };
    expect(blockEditorChanged(p, r.file)).toBe(true);
    const s = saveBlockEditor(p, r.file);
    expect(s.changed).toBe(true);
    expect(s.message).toBe('BSAVE  "LAMP 1" saved: 4 objects · 2 inserts in plan = GF.dwg updated · block "ARROW" added to plan = GF.dwg');
    const def = blockDefOf(blockDefsOf(s.project, HOST), 'LAMP 1')!;
    expect(def).toMatchObject({ units: 4, description: 'Ceiling lamp', explodable: true });
    expect(def.items.map((it) => it.id)).toEqual(['b1', 'b2', 'b3', 'b4']);
    expect(blockDefsOf(s.project, HOST).map((d) => d.name).sort()).toEqual(['ARROW', 'LAMP 1', 'TAG']);
    expect(blockEditorChanged(s.project, r.file)).toBe(false);
  });

  it('BSAVE refuses a block holding an insert of itself, and a drawing that is not the block editor', () => {
    const r = openBlockEditor(base, HOST, 'LAMP 1')!;
    const p = withSketchItems(r.project, r.file, [...sketchOf(r.project, r.file), { id: 'S9', kind: 'insert', layer: '0', pts: [[0, 0]], block: 'Lamp 1' }]);
    expect(saveBlockEditor(p, r.file)).toMatchObject({ changed: false, message: 'BSAVE  "LAMP 1" cannot hold an insert of itself: erase it first.' });
    expect(saveBlockEditor(base, HOST).message).toBe('BSAVE  Not a block editor drawing: open a block with BEDIT.');
  });

  it('BCLOSE takes the editor\'s objects and its copied blocks out of the project; the drawing\'s own stay', () => {
    const r = openBlockEditor(base, HOST, 'LAMP 1')!;
    const c = closeBlockEditor(r.project, r.file);
    expect(sketchOf(c, r.file)).toEqual([]);
    expect(blockDefsOf(c, r.file)).toEqual([]);
    expect(c.cadLayerFile?.[r.file.toLowerCase()]).toBeUndefined();
    expect(blockDefsOf(c, HOST)).toHaveLength(2);
    expect(sketchOf(c, HOST)).toHaveLength(3);
  });
});
