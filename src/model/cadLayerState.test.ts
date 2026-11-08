import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { applyLayerPatch, archOnOf, currentLayerOf, deleteRefusal, layersToChange, newPropsOf, withNewProps, extentsOf, isolate, layerFileOf, matchesFilter, newLayerName, renameLayer, renameRefusal, restoreState, unisolate, withCurrentLayer, withNewLayer, withoutLayer, withoutState, withSavedState, type LayerRef, type LayerSnap } from './cadLayerState';
import { drawnLayers, effective, layerStylesOf, withLayerStyle } from './cadLayerStyle';
import { refsOf } from './cadRefs';
import { sketchOf } from './cadSketch';
import type { Project, SketchItem } from '../types';

const F = 'GF.dwg';
const line = (id: string, layer: string): SketchItem => ({ id, kind: 'line', layer, pts: [[0, 0], [1, 0]] });
const base: Project = { ...sampleProject, cadLayerStyle: undefined, cadLayerFile: undefined, cadSketch: [{ file: F, items: [line('S1', 'LV-SKETCH'), line('S2', 'E-LIGHT')] }] };
const rows = (p: Project, archOn: Record<string, boolean> = { 'A-WALL': true, 'A-DOOR': true }): (LayerRef & LayerSnap)[] => {
  const st = layerStylesOf(p, F);
  return [
    ...drawnLayers(sketchOf(p, F), layerFileOf(p, F).layers).map((name) => ({ name, group: 'drawn' as const, on: !st[name]?.hidden, freeze: st[name]?.freeze, lock: st[name]?.lock, color: st[name]?.color })),
    ...Object.entries(archOn).map(([name, on]) => ({ name, group: 'arch' as const, drawingOn: true, on, freeze: st[name]?.freeze, lock: st[name]?.lock, color: st[name]?.color }))
  ];
};

describe('layer palette: data per drawing file', () => {
  it('an older project opens as before: LV-SKETCH current, no states, nothing isolated', () => {
    expect(layerFileOf(sampleProject, F)).toEqual({});
    expect(currentLayerOf(sampleProject, F)).toBe('LV-SKETCH');
    expect(sampleProject.cadLayerFile).toBeUndefined();
  });

  it('keeps the current layer per drawing (case ignored); LV-SKETCH again clears it', () => {
    const a = withCurrentLayer(base, F, 'E-LIGHT');
    expect(currentLayerOf(a, 'gf.DWG')).toBe('E-LIGHT');
    expect(currentLayerOf(a, 'FF.dwg')).toBe('LV-SKETCH');
    expect(withCurrentLayer(a, F, 'lv-sketch').cadLayerFile).toBeUndefined();
  });

  it('a new layer is the next free LayerN and lists while empty; deleting it removes it and its style', () => {
    const name = newLayerName(['LV-SKETCH', 'layer1']);
    expect(name).toBe('Layer2');
    const a = withLayerStyle(withNewLayer(base, F, name), F, name, { color: 'idx:3' });
    expect(drawnLayers(sketchOf(a, F), layerFileOf(a, F).layers)).toEqual(['LV-SKETCH', 'E-LIGHT', 'LV-ANNO', 'LV-HATCH', 'Layer2']);
    const b = withoutLayer(a, F, 'LAYER2');
    expect(b.cadLayerFile).toBeUndefined();
    expect(b.cadLayerStyle).toBeUndefined();
  });

  it('filters with * and ?, or by any part of the name', () => {
    expect(['E-LIGHT-SW', 'A-LIGHTING', 'LV-SKETCH', 'E-TRAY'].filter((n) => matchesFilter(n, '*LIGHT*'))).toEqual(['E-LIGHT-SW', 'A-LIGHTING']);
    expect(matchesFilter('E-TRAY', 'e-?ray')).toBe(true);
    expect(matchesFilter('E-TRAY', 'E-*X')).toBe(false);
    expect(matchesFilter('E-TRAY', 'tra')).toBe(true);
    expect(matchesFilter('A.B', 'A.*')).toBe(true);
    expect(matchesFilter('AXB', 'A.*')).toBe(false);
  });
});

describe('layer palette: rename and delete', () => {
  it('only drawn layers that are not the app\'s own can be renamed', () => {
    expect(renameRefusal({ name: 'A-WALL', group: 'arch' })).toBe('The architect\'s layers keep their names.');
    expect(renameRefusal({ name: 'STR|A-WALL', group: 'ref' })).toBe('A reference\'s layers keep their names.');
    for (const n of ['LV-SKETCH', 'lv-anno', 'LV-HATCH', 'E-TRAY', 'E-CABLE']) expect(renameRefusal({ name: n, group: 'drawn' })).toMatch(/one of the app's own layers/);
    expect(renameRefusal({ name: 'E-LIGHT', group: 'drawn' })).toBeUndefined();
  });

  it('a rename moves the objects, style, current layer, states, Isolate\'s set and viewport freezes', () => {
    let p = withCurrentLayer(withLayerStyle(base, F, 'E-LIGHT', { lt: 'dashed', freeze: false, lock: true }), F, 'E-LIGHT');
    p = withSavedState(p, F, 'Check', rows(p));
    p = isolate(p, F, rows(p), ['LV-SKETCH']).project;
    p = { ...p, cadPlans: [{ building: 'B', level: 'GF', file: F }], drawingSet: { sheets: [{ id: 's1', kind: 'plan', buildingId: 'B', levelId: 'GF', viewports: [{ id: 'vp1', box: [0, 0, 10, 10], at: [0, 0], scale: 100, frozen: ['e-light', 'LV-ANNO'] }] }] } as unknown as Project['drawingSet'] };
    const r = renameLayer(p, F, 'E-LIGHT', 'E-LIGHT-SW', ['A-WALL']);
    if ('error' in r) throw new Error(r.error);
    const q = r.project;
    expect(sketchOf(q, F).map((it) => it.layer)).toEqual(['LV-SKETCH', 'E-LIGHT-SW']);
    expect(layerStylesOf(q, F)['E-LIGHT-SW']).toMatchObject({ lt: 'dashed', lock: true });
    expect(layerStylesOf(q, F)['E-LIGHT']).toBeUndefined();
    expect(currentLayerOf(q, F)).toBe('E-LIGHT-SW');
    expect(Object.keys(layerFileOf(q, F).states![0].layers)).toContain('E-LIGHT-SW');
    expect(layerFileOf(q, F).iso).toContain('E-LIGHT-SW');
    expect(q.drawingSet!.sheets[0].viewports![0].frozen).toEqual(['E-LIGHT-SW', 'LV-ANNO']);
  });

  it('refuses a name in use, an app layer\'s name, a blank one and bad characters', () => {
    expect(renameLayer(base, F, 'E-LIGHT', 'a-wall', ['A-WALL', 'E-LIGHT'])).toEqual({ error: 'There is already a layer a-wall.' });
    expect(renameLayer(base, F, 'E-LIGHT', 'LV-ANNO', [])).toEqual({ error: 'There is already a layer LV-ANNO.' });
    expect(renameLayer(base, F, 'E-LIGHT', '  ', [])).toEqual({ error: 'A layer needs a name.' });
    expect('error' in renameLayer(base, F, 'E-LIGHT', 'E|X', [])).toBe(true);
    expect('error' in renameLayer(base, F, 'LV-SKETCH', 'MINE', [])).toBe(true);
    // Its own name in another case is fine.
    const r = renameLayer(base, F, 'E-LIGHT', 'e-light', ['E-LIGHT']);
    expect('project' in r && sketchOf(r.project, F)[1].layer).toBe('e-light');
  });

  it('deletes only an empty drawn layer that is not current, and says why otherwise', () => {
    expect(deleteRefusal({ name: 'A-WALL', group: 'arch' }, 0, 'LV-SKETCH')).toBe('A-WALL: the architect\'s layers cannot be deleted.');
    expect(deleteRefusal({ name: 'LV-HATCH', group: 'drawn' }, 0, 'LV-SKETCH')).toBe('LV-HATCH is one of the app\'s own layers.');
    expect(deleteRefusal({ name: 'E-X', group: 'drawn' }, 0, 'e-x')).toBe('E-X is the current layer; set another one current first.');
    expect(deleteRefusal({ name: 'E-X', group: 'drawn' }, 2, 'LV-SKETCH')).toBe('E-X has 2 objects on it; erase or move them first.');
    expect(deleteRefusal({ name: 'E-X', group: 'drawn' }, 0, 'LV-SKETCH')).toBeUndefined();
  });
});

describe('layer palette: freeze, on, isolate and states', () => {
  it('a patch on several rows: drawn layers keep it in the style, the architect\'s On in the drawing\'s record', () => {
    const r = applyLayerPatch(base, F, [{ name: 'E-LIGHT', group: 'drawn' }, { name: 'A-WALL', group: 'arch', drawingOn: true }], { on: false, lock: true, print: false, lt: 'center' });
    expect(layerFileOf(r, F).archOn).toEqual({ 'A-WALL': false });
    expect(layerStylesOf(r, F)).toEqual({ 'E-LIGHT': { hidden: true, lock: true, noPrint: true, lt: 'center' }, 'A-WALL': { lock: true } });
    // Back to ByLayer: a key present with undefined; back to the drawing's own On drops the app's setting.
    const back = applyLayerPatch(r, F, [{ name: 'E-LIGHT', group: 'drawn' }, { name: 'A-WALL', group: 'arch', drawingOn: true }], { lt: undefined, on: true, print: true });
    expect(layerStylesOf(back, F)['E-LIGHT']).toEqual({ lock: true });
    expect(layerFileOf(back, F).archOn).toBeUndefined();
  });

  it('the architect\'s layers show as the drawing has them, unless turned on or off in the app (by name, case ignored)', () => {
    const layers = [{ name: 'A-WALL', on: true }, { name: 'A-HIDDEN', on: false }];
    expect([...archOnOf(base, F, layers)]).toEqual([1, 0]);
    const p = applyLayerPatch(base, F, [{ name: 'a-wall', group: 'arch', drawingOn: true }, { name: 'A-HIDDEN', group: 'arch', drawingOn: false }], { on: false });
    expect([...archOnOf(p, F, layers)]).toEqual([0, 0]);
    const q = applyLayerPatch(p, F, [{ name: 'A-HIDDEN', group: 'arch', drawingOn: false }], { on: true });
    expect([...archOnOf(q, F, layers)]).toEqual([0, 1]);
    expect([...archOnOf(q, 'FF.dwg', layers)]).toEqual([1, 0]); // another drawing: as it is
  });

  it('a reference\'s layer takes On, Print and colour only', () => {
    const p: Project = { ...base, cadRefs: { 'gf.dwg': [{ name: 'STR', file: 'STR.dxf', type: 'overlay', at: [0, 0], scale: 1, rot: 0, fade: 50, print: true }] } } as unknown as Project;
    const r = applyLayerPatch(p, F, [{ name: 'STR|A-COL', group: 'ref', ref: 'STR', layer: 'A-COL' }], { on: false, freeze: true, lock: true, print: false, color: 'idx:8' });
    expect(refsOf(r, F)[0].layers).toEqual({ 'A-COL': { hidden: true, noPrint: true, color: 'idx:8' } });
    expect(r.cadLayerStyle).toBeUndefined();
  });

  it('a frozen drawn layer is hidden and not picked, apart from Off', () => {
    const st = layerStylesOf(applyLayerPatch(base, F, [{ name: 'E-LIGHT', group: 'drawn' }], { freeze: true }), F);
    expect(st['E-LIGHT']).toEqual({ freeze: true });
    expect(effective(line('S2', 'E-LIGHT'), st)).toMatchObject({ hidden: true, lock: false });
  });

  it('Isolate turns every other layer off in one change and keeps which; Unisolate turns those back on', () => {
    const start = applyLayerPatch(base, F, [{ name: 'LV-HATCH', group: 'drawn' }], { on: false });
    const iso = isolate(start, F, rows(start), ['e-light']);
    expect(iso.off).toBe(4); // LV-SKETCH, LV-ANNO, A-WALL, A-DOOR (LV-HATCH was off already)
    expect(layerFileOf(iso.project, F).archOn).toEqual({ 'A-WALL': false, 'A-DOOR': false });
    expect([...layerFileOf(iso.project, F).iso!].sort()).toEqual(['A-DOOR', 'A-WALL', 'LV-ANNO', 'LV-SKETCH']);
    expect(Object.entries(layerStylesOf(iso.project, F)).filter(([, s]) => s.hidden).map(([k]) => k).sort()).toEqual(['LV-ANNO', 'LV-HATCH', 'LV-SKETCH']);
    const back = unisolate(iso.project, F, rows(iso.project, { 'A-WALL': false, 'A-DOOR': false }))!;
    expect(back).toEqual(start); // LV-HATCH stays off: Isolate did not turn it off
    expect(unisolate(back, F, rows(back))).toBeUndefined();
  });

  it('Unisolate keeps what changed after Isolate: a colour, a lock', () => {
    const iso = isolate(base, F, rows(base), ['LV-SKETCH']).project;
    const edited = applyLayerPatch(iso, F, [{ name: 'E-LIGHT', group: 'drawn' }, { name: 'A-DOOR', group: 'arch', drawingOn: true }], { color: 'idx:3', lock: true });
    const back = unisolate(edited, F, rows(edited, { 'A-WALL': false, 'A-DOOR': false }))!;
    expect(layerStylesOf(back, F)).toEqual({ 'E-LIGHT': { color: 'idx:3', lock: true }, 'A-DOOR': { color: 'idx:3', lock: true } });
    expect(layerFileOf(back, F)).toEqual({});
  });

  it('a layer state keeps On, Freeze, Lock and colour per drawing file, and restores them', () => {
    let p = applyLayerPatch(base, F, [{ name: 'E-LIGHT', group: 'drawn' }], { color: 'idx:2', lock: true });
    p = withSavedState(p, F, 'Lighting check', rows(p, { 'A-WALL': true, 'A-DOOR': false }));
    expect(layerFileOf(p, F).states![0]).toEqual({ name: 'Lighting check', layers: expect.objectContaining({ 'E-LIGHT': { on: true, lock: true, color: 'idx:2' }, 'A-DOOR': { on: false } }) });
    expect(layerFileOf(p, 'FF.dwg').states).toBeUndefined();
    // Changed since; restored.
    p = applyLayerPatch(p, F, [{ name: 'E-LIGHT', group: 'drawn' }, { name: 'A-DOOR', group: 'arch', drawingOn: true }], { color: undefined, lock: false, freeze: true, on: true });
    const r = restoreState(p, F, 'lighting check', rows(p))!;
    expect(layerFileOf(r.project, F).archOn).toEqual({ 'A-DOOR': false });
    expect(r.kept).toBeUndefined();
    expect(layerStylesOf(r.project, F)['E-LIGHT']).toEqual({ color: 'idx:2', lock: true });
    // Saved again under the same name: replaced; deleted.
    p = withSavedState(r.project, F, 'LIGHTING CHECK', rows(r.project));
    expect(layerFileOf(p, F).states!.map((s) => s.name)).toEqual(['LIGHTING CHECK']);
    expect(withoutState(p, F, 'lighting check').cadLayerFile).toEqual({ 'gf.dwg': { archOn: { 'A-DOOR': false } } }); // A-DOOR stays off as restored
    expect(restoreState(p, F, 'nope', rows(p))).toBeUndefined();
  });

  it('restoring a state never freezes the current layer', () => {
    let p = applyLayerPatch(base, F, [{ name: 'E-LIGHT', group: 'drawn' }], { freeze: true });
    p = withSavedState(p, F, 'Frozen lights', rows(p));
    p = withCurrentLayer(applyLayerPatch(p, F, [{ name: 'E-LIGHT', group: 'drawn' }], { freeze: false }), F, 'E-LIGHT');
    const r = restoreState(p, F, 'Frozen lights', rows(p))!;
    expect(layerStylesOf(r.project, F)['E-LIGHT']).toBeUndefined();
    expect(r.kept).toBe('E-LIGHT');
  });

  it('zoom extents leave frozen layers out', () => {
    const segs = [0, 0, 10, 5, 100, 100, 200, 300];
    expect(extentsOf(segs, [0, 1], [1000, 2000], () => true)).toEqual([1000, 2000, 1200, 2300]);
    expect(extentsOf(segs, [0, 1], [1000, 2000], (l) => l !== 1)).toEqual([1000, 2000, 1010, 2005]);
    expect(extentsOf(segs, [0, 1], [0, 0], () => false)).toBeUndefined();
  });

  it('a layer command by picking changes only the layers not already so, and never freezes the current layer', () => {
    const r = rows(base);
    expect(layersToChange(r, ['e-light', 'A-WALL'], { on: false }, 'LV-SKETCH').rows.map((x) => x.name)).toEqual(['E-LIGHT', 'A-WALL']);
    const locked = rows(withLayerStyle(base, F, 'E-LIGHT', { lock: true }));
    expect(layersToChange(locked, ['E-LIGHT'], { lock: true }, 'LV-SKETCH').rows).toEqual([]); // already locked
    expect(layersToChange(locked, ['E-LIGHT'], { lock: false }, 'LV-SKETCH').rows.map((x) => x.name)).toEqual(['E-LIGHT']);
    expect(layersToChange(r, ['LV-SKETCH', 'E-LIGHT'], { freeze: true }, 'LV-SKETCH')).toMatchObject({ rows: [{ name: 'E-LIGHT' }], skipped: 'LV-SKETCH' });
    expect(layersToChange(r, ['LV-SKETCH'], { on: false }, 'LV-SKETCH').rows.map((x) => x.name)).toEqual(['LV-SKETCH']); // off is allowed
  });

  it('keeps the colour, linetype and lineweight of new objects per drawing file; ByLayer drops one', () => {
    expect(newPropsOf(base, F)).toEqual({});
    const red = withNewProps(base, F, { color: '#ff3b30' });
    const both = withNewProps(red, F, { lw: 0.5 });
    expect(newPropsOf(both, F)).toEqual({ color: '#ff3b30', lw: 0.5 });
    expect(newPropsOf(both, 'other.dwg')).toEqual({});
    expect(layerFileOf(withNewProps(withCurrentLayer(both, F, 'E-LIGHT'), F, { color: undefined }), F)).toEqual({ current: 'E-LIGHT', props: { lw: 0.5 } });
    expect(withNewProps(withNewProps(both, F, { color: undefined }), F, { lw: undefined }).cadLayerFile).toBeUndefined(); // all ByLayer: nothing kept
  });
});
