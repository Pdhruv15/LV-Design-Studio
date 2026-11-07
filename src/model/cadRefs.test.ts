import { afterEach, describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { boundLayerName, clipToOutline, dropRefGeometry, insideOutline, keepRefGeometry, newRef, placeRef, placeRefExtras, printedRefs, printsByDefault, refLayerName, refLayerStyle, refName, refSnaps, refsOf, refFromXref, refTransform, unitScale, updateRef, withRef, withRefLayer, withoutRef, xrefCandidates, xrefFile, type CadRef, type RefGeometry } from './cadRefs';
import type { Project } from '../types';

const p: Project = { ...sampleProject, cadRefs: undefined };
const ref = (over: Partial<CadRef> = {}): CadRef => ({ name: 'STR-GF', file: 'STR-GF.dwg', type: 'overlay', at: [0, 0], scale: 1, rot: 0, fade: 50, print: true, ...over });
/** Two lines on two layers: S-GRID from (0, 0) to (10, 0), S-COLUMN from (0, 0) to (0, 10). */
const geom = (): RefGeometry => ({ file: 'STR-GF.dwg', units: 4, segs: Float64Array.from([0, 0, 10, 0, 0, 0, 0, 10]), segLayers: Uint16Array.from([0, 1]), layers: [{ name: 'S-GRID', rgb: 1 }, { name: 'S-COLUMN', rgb: 2 }] });
afterEach(() => dropRefGeometry('STR-GF.dwg'));

describe('references of a plan', () => {
  it('attaches, changes and detaches a reference, per plan file and without case', () => {
    const a = withRef(p, 'GF.dwg', ref());
    expect(refsOf(a, 'gf.DWG')).toEqual([ref()]);
    expect(refsOf(a, 'FF.dwg')).toEqual([]);
    const b = updateRef(a, 'GF.dwg', 'str-gf', { fade: 70, clip: [[0, 0], [1, 0], [1, 1]] });
    expect(refsOf(b, 'GF.dwg')[0]).toMatchObject({ fade: 70, clip: [[0, 0], [1, 0], [1, 1]] });
    expect(refsOf(updateRef(b, 'GF.dwg', 'STR-GF', { clip: undefined }), 'GF.dwg')[0]).not.toHaveProperty('clip');
    expect(withoutRef(b, 'GF.dwg', 'STR-GF').cadRefs).toBeUndefined();
    expect(updateRef(a, 'GF.dwg', 'nothing', { fade: 0 })).toBe(a);
  });

  it('names a new reference after its file, numbered when taken, without | or $', () => {
    expect(refName(p, 'GF.dwg', 'C:\\Structure\\STR-GF.dwg')).toBe('STR-GF');
    const a = withRef(p, 'GF.dwg', ref());
    expect(refName(a, 'GF.dwg', 'STR-GF.dxf')).toBe('STR-GF-2');
    expect(refName(p, 'GF.dwg', 'MECH|GF$1.dxf')).toBe('MECH_GF_1');
  });

  it('works out the scale from the units: m → mm 1000, mm → m 0.001, unknown 1', () => {
    expect(unitScale(6, 4)).toBe(1000);
    expect(unitScale(4, 6)).toBe(0.001);
    expect(unitScale(4, 4)).toBe(1);
    expect(unitScale(0, 4)).toBe(1);
    expect(newRef(p, 'GF.dwg', 'STR-GF.dxf', 6, 4)).toEqual({ name: 'STR-GF', file: 'STR-GF.dxf', type: 'overlay', at: [0, 0], scale: 1000, rot: 0, fade: 50, print: true });
  });

  it('prints the structure by default, other services not', () => {
    expect(['STR-GF.dwg', 'GF Structural.dxf', 'S_GRID.dwg', 'ARCH-GF.dwg', 'Columns L1.dwg'].map(printsByDefault)).toEqual([true, true, true, true, true]);
    expect(['MECH-GF.dxf', 'PLUMB-GF.dwg', 'Construction phasing.dwg', 'FIRE.dwg'].map(printsByDefault)).toEqual([false, false, false, false]);
  });

  it('places a point: scaled, rotated, then moved to the insertion point', () => {
    const [x, y] = refTransform({ at: [100, 200], scale: 2, rot: 90 })(10, 0);
    expect(x).toBeCloseTo(100);
    expect(y).toBeCloseTo(220);
  });

  it('cuts a line to a clip outline, also a concave one', () => {
    const square: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    expect(clipToOutline([-5, 5], [15, 5], square)).toEqual([[[0, 5], [10, 5]]]);
    expect(clipToOutline([20, 5], [30, 5], square)).toEqual([]);
    expect(clipToOutline([2, 2], [8, 2], square)).toEqual([[[2, 2], [8, 2]]]);
    // A U shape: the line across its arms is in two pieces.
    const u: [number, number][] = [[0, 0], [10, 0], [10, 10], [7, 10], [7, 3], [3, 3], [3, 10], [0, 10]];
    expect(clipToOutline([-1, 5], [11, 5], u)).toEqual([[[0, 5], [3, 5]], [[7, 5], [10, 5]]]);
    expect(insideOutline([5, 5], u)).toBe(false);
  });

  it('places a reference on its plan without layers off, clipped; for print also without layers set not to print', () => {
    const g = geom();
    expect([...placeRef(g, ref({ at: [100, 0] })).segs]).toEqual([100, 0, 110, 0, 100, 0, 100, 10]);
    const off = withRefLayer(withRef(p, 'GF.dwg', ref()), 'GF.dwg', 'STR-GF', 's-grid', { hidden: true });
    const r = refsOf(off, 'GF.dwg')[0];
    expect(r.layers).toEqual({ 's-grid': { hidden: true } });
    expect(refLayerStyle(r, 'S-GRID')).toEqual({ hidden: true });
    expect([...placeRef(g, r).segLayers]).toEqual([1]);
    const np = refsOf(withRefLayer(off, 'GF.dwg', 'STR-GF', 'S-GRID', { hidden: false, noPrint: true }), 'GF.dwg')[0];
    expect(np.layers).toEqual({ 'S-GRID': { noPrint: true } });
    expect(placeRef(g, np).segLayers.length).toBe(2);
    expect([...placeRef(g, np, true).segLayers]).toEqual([1]);
    expect([...placeRef(g, ref({ clip: [[-1, -1], [5, -1], [5, 5], [-1, 5]] })).segs]).toEqual([0, 0, 5, 0, 0, 0, 0, 5]);
    expect(refLayerName(r, 'S-GRID')).toBe('STR-GF|S-GRID');
    expect(boundLayerName(r, 'S-GRID')).toBe('STR-GF$0$S-GRID');
  });

  it('snaps to the ends and middles of reference lines, the nearest within reach', () => {
    const snap = refSnaps([placeRef(geom(), ref())]);
    expect(snap(9.5, 0.2, 1)).toEqual({ p: [10, 0], kind: 1 });
    expect(snap(5.1, 0, 1)).toEqual({ p: [5, 0], kind: 2 });
    expect(snap(50, 50, 1)).toBeUndefined();
    expect(refSnaps([])(0, 0, 1)).toBeUndefined();
  });

  it('prints only references that print, are loaded and were read; in metres', () => {
    const a = withRef(withRef(p, 'GF.dwg', ref()), 'GF.dwg', ref({ name: 'MECH', file: 'MECH.dxf', print: false }));
    expect(printedRefs(a, 'GF.dwg', 0.001)).toEqual([{ ref: ref(), missing: true }]);
    keepRefGeometry(geom());
    const [one] = printedRefs(a, 'GF.dwg', 0.001);
    expect([...one.segs!]).toEqual([0, 0, 0.01, 0, 0, 0, 0, 0.01]);
    expect(printedRefs(updateRef(a, 'GF.dwg', 'STR-GF', { unloaded: true }), 'GF.dwg', 0.001)).toEqual([]);
  });

  it('looks for a reference named inside the plan: saved path, from the plan folder, beside the plan, in its folder', () => {
    expect(xrefFile('..\\Structure\\STR-GF.dwg', 'STR-GF')).toBe('STR-GF.dwg');
    expect(xrefFile('', 'MECH-GF')).toBe('MECH-GF.dwg');
    expect(xrefCandidates('..\\Structure\\STR-GF.dwg', 'STR-GF', '/jobs/A/Arch/GF.dwg')).toEqual(['/jobs/A/Structure/STR-GF.dwg', '/jobs/A/Arch/STR-GF.dwg', '/jobs/A/Arch/Structure/STR-GF.dwg']);
    expect(xrefCandidates('C:\\Old\\Xref\\STR-GF.dwg', 'STR-GF', 'D:\\Jobs\\A\\GF.dwg')).toEqual(['C:\\Old\\Xref\\STR-GF.dwg', 'D:\\Jobs\\A\\STR-GF.dwg', 'D:\\Jobs\\A\\Xref\\STR-GF.dwg']);
    expect(xrefCandidates('.\\STR-GF.dwg', 'STR-GF', '/jobs/GF.dwg')).toEqual(['/jobs/STR-GF.dwg']);
    expect(xrefCandidates('', 'STR-GF', '/jobs/GF.dwg')).toEqual(['/jobs/STR-GF.dwg']);
    expect(xrefCandidates('/srv/STR-GF.dwg', 'STR-GF')).toEqual(['/srv/STR-GF.dwg']);
    expect(xrefCandidates('', '')).toEqual([]);
  });

  it('sets up a reference named inside the plan as the drawing places it, scaled from the units', () => {
    const x = { name: 'STR-GF', overlay: false, inserts: [{ x: 100, y: 200, sx: 2, rot: Math.PI / 2 }] };
    expect(refFromXref(p, 'GF.dwg', x, 'STR-GF.dwg', 6, 4)).toEqual({ name: 'STR-GF', file: 'STR-GF.dwg', type: 'attach', at: [100, 200], scale: 2000, rot: 90, fade: 50, print: true, found: true });
    expect(refFromXref(p, 'GF.dwg', { ...x, overlay: true, inserts: [] }, 'MECH.dxf')).toMatchObject({ type: 'overlay', at: [0, 0], scale: 1, rot: 0, print: false });
  });

  it('places texts and fills for Bind: moved, scaled, turned; without layers off; a clip keeps what is inside', () => {
    const g: RefGeometry = { ...geom(), texts: [{ x: 10, y: 0, h: 2.5, rot: 0, s: 'C1', layer: 1 }, { x: 0, y: 5, h: 2.5, rot: 0, s: 'GRID A', layer: 0 }],
      fills: [{ layer: 1, solid: false, loops: [[[0, 0], [1, 0], [1, 1], [0, 1]]], lines: [{ angle: 0, base: [0, 0], offset: [0, 2], dashes: [3, -1] }] }] };
    const { texts, fills } = placeRefExtras(g, ref({ at: [100, 0], scale: 2, rot: 90 }));
    expect(texts.map((t) => [t.s, +t.x.toFixed(6), +t.y.toFixed(6), t.h, +t.rot.toFixed(6)])).toEqual([['C1', 100, 20, 5, 1.570796], ['GRID A', 90, 0, 5, 1.570796]]);
    expect(fills[0].loops[0].map(([x, y]) => [+x.toFixed(6), +y.toFixed(6)])).toEqual([[100, 0], [100, 2], [98, 2], [98, 0]]);
    expect(fills[0].lines[0].base.map((v) => +v.toFixed(6))).toEqual([100, 0]);
    expect(fills[0].lines[0].offset.map((v) => +v.toFixed(6))).toEqual([-4, 0]);
    expect(fills[0].lines[0]).toMatchObject({ dashes: [6, -2] });
    expect(+fills[0].lines[0].angle.toFixed(6)).toBe(1.570796);
    const off = refsOf(withRefLayer(withRef(p, 'GF.dwg', ref()), 'GF.dwg', 'STR-GF', 'S-COLUMN', { hidden: true }), 'GF.dwg')[0];
    expect(placeRefExtras(g, off)).toEqual({ texts: [expect.objectContaining({ s: 'GRID A' })], fills: [] });
    const clipped = placeRefExtras(g, ref({ clip: [[-1, -1], [3, -1], [3, 8], [-1, 8]] }));
    expect(clipped.texts.map((t) => t.s)).toEqual(['GRID A']);
    expect(clipped.fills).toHaveLength(1);
    expect(placeRefExtras(geom(), ref())).toEqual({ texts: [], fills: [] }); // read before texts and fills were kept
  });
});
