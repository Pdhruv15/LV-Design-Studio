import { afterEach, describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { boundLayerName, clipToOutline, dropRefGeometry, insideOutline, keepRefGeometry, newRef, placeRef, printedRefs, printsByDefault, refLayerName, refLayerStyle, refName, refSnaps, refsOf, refTransform, unitScale, updateRef, withRef, withRefLayer, withoutRef, type CadRef, type RefGeometry } from './cadRefs';
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
});
