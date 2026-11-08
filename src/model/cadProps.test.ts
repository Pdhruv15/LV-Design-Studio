import { describe, expect, it } from 'vitest';
import { geometryRows, geomKind, kindChoices, parseTyped, propValue, sharedValue, shownValue, textRows, withProp, type PropDef } from './cadProps';
import type { SketchItem } from '../types';

const k = 0.001; // a drawing in mm
const line: SketchItem = { id: 'S1', kind: 'line', layer: 'LV-SKETCH', pts: [[1000, 2000], [5000, 2000]] };
const def = (key: PropDef['key']) => [...geometryRows(geomKind(line), [line]), ...geometryRows('arc', []), ...geometryRows('tray', []), ...geometryRows('pline', []), ...textRows('text'), ...textRows('dim')].find((d) => d.key === key)!;

describe('properties palette: geometry in metres and degrees', () => {
  it('a line: start, end, length and angle; length and angle move its end', () => {
    expect(['sx', 'sy', 'ex', 'ey', 'len', 'ang'].map((key) => propValue(line, key as PropDef['key'], k))).toEqual([1, 2, 5, 2, 4, 0]);
    const longer = withProp(line, 'len', 6, k)!;
    expect(longer.pts[1][0]).toBeCloseTo(7000, 6);
    const up = withProp(line, 'ang', 90, k)!;
    expect(up.pts[1][0]).toBeCloseTo(1000, 6);
    expect(up.pts[1][1]).toBeCloseTo(6000, 6);
    expect(withProp(line, 'ex', 7.5, k)!.pts).toEqual([[1000, 2000], [7500, 2000]]);
    expect(withProp(line, 'len', 0, k)).toBeUndefined();
    // Connected lines: no typed length or angle.
    const zig: SketchItem = { ...line, pts: [[0, 0], [1000, 0], [1000, 1000]] };
    expect(geometryRows('line', [zig]).filter((d) => d.ro).map((d) => d.key)).toEqual(['len', 'ang']);
    expect(withProp(zig, 'len', 5, k)).toBeUndefined();
  });

  it('a circle and an arc: centre, radius, start and end angles', () => {
    const arc: SketchItem = { id: 'A1', kind: 'arc', layer: 'LV-SKETCH', pts: [[0, 0]], r: 2000, a0: 0, a1: Math.PI / 2 };
    expect(propValue(arc, 'r', k)).toBe(2);
    expect(propValue(arc, 'a1', k)).toBeCloseTo(90, 9);
    expect(withProp(arc, 'a1', 180, k)!.a1).toBeCloseTo(Math.PI, 9);
    expect(withProp(arc, 'r', 3.5, k)!.r).toBeCloseTo(3500, 9);
    expect(withProp(arc, 'r', -1, k)).toBeUndefined();
    expect(withProp({ ...arc, kind: 'circle' }, 'cx', 1.25, k)!.pts).toEqual([[1250, 0]]);
  });

  it('a polyline: the vertex shown, its length, closed', () => {
    const pl: SketchItem = { id: 'P1', kind: 'pline', layer: 'LV-SKETCH', pts: [[0, 0], [3000, 0], [3000, 4000]] };
    expect([propValue(pl, 'vx', k, 1), propValue(pl, 'vy', k, 2), propValue(pl, 'len', k)]).toEqual([3, 4, 7]);
    expect(withProp(pl, 'vy', 1, k, 1)!.pts[1]).toEqual([3000, 1000]);
    const shut = withProp(pl, 'closed', 'Yes', k)!;
    expect(shut.closed).toBe(true);
    expect(propValue(shut, 'len', k)).toBe(12);
    expect('closed' in withProp(shut, 'closed', 'No', k)!).toBe(false);
  });

  it('a tray and a cable route: the route moves, its id, width, route and cable stay; width and service change', () => {
    const tray: SketchItem = { id: 'T1', kind: 'pline', layer: 'E-TRAY', pts: [[0, 0], [6000, 0]], tray: { widthMm: 300, service: 'Power', route: 'TR-1' } };
    const moved = withProp(tray, 'vx', 8, k, 1)!;
    expect(moved).toEqual({ ...tray, pts: [[0, 0], [8000, 0]] });
    expect(propValue(moved, 'len', k)).toBe(8);
    expect(withProp(tray, 'width', '450', k)!.tray).toEqual({ widthMm: 450, service: 'Power', route: 'TR-1' });
    expect(withProp(tray, 'service', '', k)!.tray).toEqual({ widthMm: 300, route: 'TR-1' });
    expect(withProp(tray, 'closed', 'Yes', k)).toBeUndefined();
    const cable: SketchItem = { id: 'C1', kind: 'pline', layer: 'E-CABLE', pts: [[0, 0], [1000, 0]], cable: { feederId: 'F1' } };
    expect(geomKind(cable)).toBe('cable');
    expect(withProp(cable, 'vy', 2, k, 0)).toEqual({ ...cable, pts: [[0, 2000], [1000, 0]] });
  });

  it('text: contents, height, rotation; a dimension: measured (read only) and a text override', () => {
    const t: SketchItem = { id: 'X1', kind: 'text', layer: 'LV-ANNO', pts: [[0, 0]], text: 'DB-1', h: 250, rot: 0 };
    expect([propValue(t, 'h', k), propValue(t, 'rot', k)]).toEqual([0.25, 0]);
    expect(withProp(t, 'rot', 90, k)!.rot).toBeCloseTo(Math.PI / 2, 9);
    expect(withProp(t, 'text', 'DB-2', k)!.text).toBe('DB-2');
    expect(withProp(t, 'text', ' ', k)).toBeUndefined();
    const d: SketchItem = { id: 'D1', kind: 'dim', layer: 'LV-ANNO', pts: [[0, 0], [4200, 0], [2100, -500]], text: '4.20' };
    expect([propValue(d, 'measured', k), propValue(d, 'override', k)]).toEqual([4.2, '']);
    const o = withProp(d, 'override', 'VARIES ON SITE', k)!;
    expect(propValue(o, 'override', k)).toBe('VARIES ON SITE');
    expect(withProp(o, 'override', '', k)!.text).toBe('4.20'); // blank: the measured value again
    expect(textRows('dim').find((x) => x.key === 'measured')!.ro).toBe(true);
  });

  it('a dimension of a style: its text is measured until typed over; blank measures it again in its unit', () => {
    const d: SketchItem = { id: 'D2', kind: 'dim', layer: 'LV-ANNO', pts: [[0, 0], [4200, 0], [2100, -500]], h: 200, look: { arrow: 'closed', size: 250, off: 60, ext: 125, unit: 'mm', decimals: 0 } };
    expect(propValue(d, 'override', k)).toBe('');
    const o = withProp(d, 'override', '4.20', k)!; // typed over, even with what it measures in metres
    expect([o.text, propValue(o, 'override', k)]).toEqual(['4.20', '4.20']);
    const back = withProp(o, 'override', ' ', k)!;
    expect('text' in back).toBe(false); // measured again: 4200 in its style
    expect(back.look).toEqual(d.look);
  });
});

describe('properties palette: several objects, shown and typed values', () => {
  it('a value they share, else varies', () => {
    const b = { ...line, id: 'S2', pts: [[1000, 3000], [5000, 3000]] as [number, number][] };
    expect(sharedValue([line, b], 'sx', k)).toBe(1);
    expect(sharedValue([line, b], 'sy', k)).toBe('varies');
    expect(sharedValue([line, b], 'len', k)).toBe(4);
  });

  it('metres to 2 decimals, degrees to 1; typed values take a comma and the unit', () => {
    expect(shownValue(def('ex'), 4.2)).toBe('4.20');
    expect(shownValue(def('len'), 3.5)).toBe('3.50 m');
    expect(shownValue(def('a0'), 45.04)).toBe('45.0°');
    expect(parseTyped(def('ex'), '4,25')).toBe(4.25);
    expect(parseTyped(def('ang'), '30°')).toBe(30);
    expect(parseTyped(def('ex'), '3.1 m')).toBe(3.1);
    expect(parseTyped(def('ex'), 'abc')).toBeUndefined();
    expect(parseTyped(def('ex'), '')).toBeUndefined();
    expect(parseTyped(def('text'), 'DB 1')).toBe('DB 1');
  });

  it('the kinds picked, for the drop-down', () => {
    const t: SketchItem = { id: 'X1', kind: 'text', layer: 'LV-ANNO', pts: [[0, 0]], text: 'A' };
    expect(kindChoices([line, { ...line, id: 'S2' }, t])).toEqual([{ id: '', label: 'All', n: 3 }, { id: 'Line', label: 'Line', n: 2 }, { id: 'Text', label: 'Text', n: 1 }]);
  });
});
