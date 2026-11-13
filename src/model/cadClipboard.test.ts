import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { clipPayload, clipText, lowerLeft, parseClip, pastedItems, withPasted } from './cadClipboard';
import { layerFileOf } from './cadLayerState';
import { layerStylesOf, withLayerStyle } from './cadLayerStyle';
import { addSketch, sketchOf } from './cadSketch';
import type { Project, SketchItem } from '../types';

const MM = 4, M = 6;
const p0: Project = { ...sampleProject, cadSketch: undefined, cadLayerStyle: undefined, cadLayerFile: undefined };
const line: Omit<SketchItem, 'id'> = { kind: 'line', layer: 'LV-SKETCH', pts: [[1000, 2000], [5000, 2000]] };
const circle: Omit<SketchItem, 'id'> = { kind: 'circle', layer: 'E-POWER', pts: [[3000, 3000]], r: 500, color: '1' };
const tray: Omit<SketchItem, 'id'> = { kind: 'pline', layer: 'E-TRAY', pts: [[0, 0], [2000, 0]], tray: { widthMm: 300, service: 'Power', route: 'TR1' } };
const text: Omit<SketchItem, 'id'> = { kind: 'text', layer: 'LV-ANNO', pts: [[1000, 1000]], text: 'DB-1', h: 250, rot: 0.5, just: 'MC', frame: 'box' };

/** A project with the objects drawn on GF.dwg, and E-POWER styled red, dashed, 0.35 mm. */
function drawn(items: Omit<SketchItem, 'id'>[]) {
  let p = withLayerStyle(p0, 'GF.dwg', 'E-POWER', { color: '1', lt: 'dashed', lw: 0.35 });
  for (const it of items) p = addSketch(p, 'GF.dwg', it).project;
  return { p, items: sketchOf(p, 'GF.dwg') };
}
const roundTrip = (text: string) => { const r = parseClip(text); if ('error' in r) throw new Error(r.error); return r.clip; };

describe('Design CAD clipboard', () => {
  it('takes the lower-left of the objects as the base point, circles by their radius', () => {
    expect(lowerLeft([line, circle])).toEqual([1000, 2000]);
    expect(lowerLeft([circle])).toEqual([2500, 2500]);
    expect(lowerLeft([])).toEqual([0, 0]);
  });

  it('reads back exactly what was copied, without IDs, with the layer styles used', () => {
    const { p, items } = drawn([line, circle, tray, text]);
    const c = roundTrip(clipText(clipPayload(p, 'GF.dwg', items, [1000, 2000], MM)));
    expect(c.items).toEqual([line, circle, tray, text]);
    expect(c.base).toEqual([1000, 2000]);
    expect(c.units).toBe(MM);
    expect(c.layers).toEqual({ 'E-POWER': { color: '1', lt: 'dashed', lw: 0.35 } });
  });

  it('pastes with the base point at the point clicked', () => {
    const { p, items } = drawn([line]);
    const c = clipPayload(p, 'GF.dwg', items, [1000, 2000], MM);
    expect(pastedItems(c, 'GF.dwg', MM, [0, 0]).items[0].pts).toEqual([[0, 0], [4000, 0]]);
    expect(pastedItems(c, 'GF.dwg', MM, 'orig').items[0].pts).toEqual(line.pts);
  });

  it('converts millimetres to metres and back: lengths, radii and text heights', () => {
    const { p, items } = drawn([line, circle, text]);
    const c = clipPayload(p, 'GF.dwg', items, [1000, 2000], MM);
    const inM = pastedItems(c, 'L1.dwg', M, [10, 20]).items;
    expect(inM[0].pts[0]).toEqual([10, 20]);
    expect(inM[0].pts[1][0]).toBeCloseTo(14, 9);
    expect(inM[1].r).toBeCloseTo(0.5, 9);
    expect(inM[2].h).toBeCloseTo(0.25, 9);
    expect(inM[2].rot).toBe(0.5);
    // Same coordinates in metres: 1000 mm is 1 m from the origin.
    expect(pastedItems(c, 'L1.dwg', M, 'orig').items[0].pts[0]).toEqual([1, 2]);
    const back = clipPayload(p, 'L1.dwg', inM.map((x, i) => ({ ...x, id: `S${i + 1}` })), [10, 20], M);
    expect(pastedItems(back, 'GF.dwg', MM, [1000, 2000]).items[0].pts[1][0]).toBeCloseTo(5000, 6);
  });

  it('keeps tray and cable data only in the drawing they came from', () => {
    const { p, items } = drawn([tray, { kind: 'pline', layer: 'E-CABLE', pts: [[0, 0], [1, 1]], cable: { feederId: 'F1' } }]);
    const c = clipPayload(p, 'GF.dwg', items, [0, 0], MM);
    const here = pastedItems(c, 'gf.DWG', MM, [100, 0]);
    expect(here.plain).toBe(0);
    expect(here.items[0].tray?.route).toBe('TR1');
    const there = pastedItems(c, 'L1.dwg', MM, [100, 0]);
    expect(there.plain).toBe(2);
    expect(there.items.every((x) => !x.tray && !x.cable)).toBe(true);
    expect(there.items[0].kind).toBe('pline');
  });

  it('gives new IDs that are unique in the project, in one change', () => {
    const { p, items } = drawn([line, circle]);
    const c = clipPayload(p, 'GF.dwg', items, [0, 0], MM);
    const once = withPasted(p, 'GF.dwg', c, pastedItems(c, 'GF.dwg', MM, [10, 10]).items).project;
    const twice = withPasted(once, 'L1.dwg', c, pastedItems(c, 'L1.dwg', MM, [10, 10]).items).project;
    const ids = (twice.cadSketch ?? []).flatMap((s) => s.items.map((x) => x.id));
    expect(ids).toEqual(['S1', 'S2', 'S3', 'S4', 'S5', 'S6']);
    expect(new Set(ids).size).toBe(ids.length);
    expect(sketchOf(twice, 'L1.dwg').map((x) => x.id)).toEqual(['S5', 'S6']);
  });

  it('adds a layer the drawing lacks, with the style it had; a layer it has keeps its own', () => {
    const { p, items } = drawn([line, circle]);
    const c = clipPayload(p, 'GF.dwg', items, [0, 0], MM);
    const r = withPasted(p, 'L1.dwg', c, pastedItems(c, 'L1.dwg', MM, [0, 0]).items);
    expect(r.layersAdded).toEqual(['E-POWER']);
    expect(layerFileOf(r.project, 'L1.dwg').layers).toEqual(['E-POWER']);
    expect(layerStylesOf(r.project, 'L1.dwg')['E-POWER']).toEqual({ color: '1', lt: 'dashed', lw: 0.35 });
    const own = withLayerStyle(p, 'L1.dwg', 'e-power', { color: '5' });
    const r2 = withPasted(own, 'L1.dwg', c, pastedItems(c, 'L1.dwg', MM, [0, 0]).items);
    expect(r2.layersAdded).toEqual([]);
    expect(layerStylesOf(r2.project, 'L1.dwg')).toEqual({ 'e-power': { color: '5' } });
  });

  it('refuses what is not a payload, an unknown kind, a newer version and bad fields', () => {
    const { p, items } = drawn([line]);
    const good = clipPayload(p, 'GF.dwg', items, [0, 0], MM);
    const bad = (x: unknown) => 'error' in parseClip(JSON.stringify(x));
    expect('error' in parseClip('hello')).toBe(true);
    expect(bad({ app: 'other', v: 1 })).toBe(true);
    expect(bad({ ...good, v: 2 })).toBe(true);
    expect(bad({ ...good, units: 99 })).toBe(true);
    expect(bad({ ...good, items: [] })).toBe(true);
    expect(bad({ ...good, items: [{ ...line, kind: 'solid3d' }] })).toBe(true);
    expect(bad({ ...good, items: [{ ...line, pts: [[0, 0], [1, 'x']] }] })).toBe(true);
    expect(bad({ ...good, items: [{ ...line, pts: [[0, 0]] }] })).toBe(true);
    expect(bad({ ...good, items: [{ ...circle, r: -1 }] })).toBe(true);
    expect(bad({ ...good, items: [{ ...text, just: 'XX' }] })).toBe(true);
    expect(bad({ ...good, items: [{ ...line, lt: 'zigzag' }] })).toBe(true);
    expect(bad({ ...good, items: [{ ...line, layer: '' }] })).toBe(true);
    expect(bad({ ...good, layers: { 'E-POWER': { lw: 'thick' } } })).toBe(true);
    expect(bad({ ...good, items: [{ kind: 'dim', layer: 'LV-ANNO', pts: [[0, 0], [1, 0], [0, 1]], look: { arrow: 'rocket', size: 1, off: 0, ext: 0 } }] })).toBe(true);
    expect(parseClip(JSON.stringify({ ...good, v: 2 }))).toEqual({ error: 'The objects were copied by a newer version of the app.' });
  });

  it('drops fields the app does not know', () => {
    const { p, items } = drawn([line]);
    const c = roundTrip(JSON.stringify({ ...clipPayload(p, 'GF.dwg', items, [0, 0], MM), extra: 1, items: [{ ...line, onclick: 'x' }] }));
    expect(c.items[0]).toEqual(line);
    expect('extra' in c).toBe(false);
  });

  it('keeps a dimension style look and a hatch', () => {
    const dim: Omit<SketchItem, 'id'> = { kind: 'dim', layer: 'LV-ANNO', pts: [[0, 0], [1000, 0], [500, 300]], dir: 0, look: { arrow: 'tick', size: 100, off: 50, ext: 75, decimals: 0, textPos: 'above' } };
    const hatch: Omit<SketchItem, 'id'> = { kind: 'pline', layer: 'LV-HATCH', pts: [[0, 0], [10, 0], [10, 10]], closed: true, hatch: { pattern: 'ansi31', scale: 3, angle: 0 } };
    const { p, items } = drawn([dim, hatch]);
    expect(roundTrip(clipText(clipPayload(p, 'GF.dwg', items, [0, 0], MM))).items).toEqual([dim, hatch]);
  });
});

describe('Design CAD clipboard: hatches', () => {
  const hatch: Omit<SketchItem, 'id'> = { kind: 'pline', layer: 'LV-HATCH', closed: true, pts: [[0, 0], [4000, 0], [4000, 4000], [0, 4000]], hatch: { pattern: 'ansi31', scale: 3, angle: 0, origin: [100, 200] },
    holes: [[[1000, 1000], [2000, 1000], [2000, 2000]]], assoc: ['S1', 'S2'] };
  it('keeps the islands and the pattern\'s origin; a pasted hatch is not tied to the objects of the copied one', () => {
    const { p, items } = drawn([hatch]);
    const clip = roundTrip(clipText(clipPayload(p, 'GF.dwg', items, [0, 0], MM)));
    const [back] = pastedItems(clip, 'GF.dwg', MM, 'orig').items;
    expect(back.holes).toEqual(hatch.holes);
    expect(back.hatch!.origin).toEqual([100, 200]);
    expect(back.assoc).toBeUndefined();
  });
  it('refuses islands or an origin that are not points', () => {
    const { p, items } = drawn([hatch]);
    const text = clipText(clipPayload(p, 'GF.dwg', items, [0, 0], MM));
    const bad = (f: (o: { items: Record<string, unknown>[] }) => void) => { const o = JSON.parse(text); f(o); return parseClip(JSON.stringify(o)); };
    expect(bad((o) => { o.items[0].holes = [[['x', 1], [2, 2], [3, 3]]]; })).toHaveProperty('error');
    expect(bad((o) => { o.items[0].holes = [[[1, 1]]]; })).toHaveProperty('error');
    expect(bad((o) => { (o.items[0].hatch as Record<string, unknown>).origin = 'here'; })).toHaveProperty('error');
  });
});
