import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { emergencyLayout, TYPICAL_FITTING } from '../calc/emergencyLighting';
import { addPlanSheets, planDrawing } from '../docs/planLayout';
import { placedOn } from './cadDevices';
import { setOf } from './drawingSet';
import { placeEmergency } from './emergencyPlace';
import type { Project } from '../types';

const gf = { building: 'V', level: 'GF' };
const villa: Project = {
  ...sampleProject, lvPoints: undefined, cadWiring: undefined, cadSketch: undefined, elvDevices: undefined, drawingSet: undefined,
  building: { buildings: [{ id: 'V', name: 'Villa', levels: [{ id: 'GF', name: 'Ground floor', kind: 'ground', heightM: 4 }] }], rooms: [{ id: 'r1', buildingId: 'V', levelId: 'GF', name: 'Hall', type: 'lobby', areaM2: 120, outline: [[0, 0], [12, 0], [12, 10], [0, 10]] }] }
};
const circuit = 'DB-GF1-Y1';

describe('emergency lighting — a level\'s layout, placed as tagged lighting points', () => {
  it('combines routes, points of emphasis (to the nearest route, or their own fitting) and open areas', () => {
    const l = emergencyLayout([[[0, 0], [30, 0]], [[0, 20], [0, 40]]], [{ at: [10, 1], kind: 'call-point' }, { at: [1, 30], kind: 'stair' }, { at: [50, 50], kind: 'first-aid' }],
      [{ name: 'Hall', outline: [[0, 0], [12, 0], [12, 10], [0, 10]] }], TYPICAL_FITTING);
    expect(l.lengthM).toBe(50);
    expect(l.fittings.filter((f) => f.why === 'emphasis').map((f) => f.note)).toEqual([
      'First aid point — no escape route within 2 m: own fitting', 'Fire alarm call point', 'Stair (each flight)'
    ]);
    expect(l.fittings.filter((f) => f.why === 'open-area')).toHaveLength(4);
    expect(l.signs).toHaveLength(2);
    expect(l.warnings.some((w) => w.startsWith('1 point has no escape route within 2 m'))).toBe(true);
  });

  it('places fittings and signs on the circuit, counted as lighting points, with their own symbols on the plan and the sheet', () => {
    const before = villa.feeders.find((f) => f.id === circuit)!.points?.ltg ?? 0;
    const layout = emergencyLayout([[[1, 5], [11, 5]]], [], [], TYPICAL_FITTING);
    const r = placeEmergency(villa, gf, circuit, layout);
    expect(r).toMatchObject({ fittings: layout.fittings.length, signs: 1 });
    expect(r.project.feeders.find((f) => f.id === circuit)!.points?.ltg).toBe(before + r.fittings + r.signs);
    expect(r.project.lvPoints!.map((d) => d.emergency)).toEqual([...layout.fittings.map(() => 'fitting'), 'exit-sign']);
    expect(placedOn(r.project, gf).map((d) => d.label)).toEqual([...layout.fittings.map(() => 'Emergency light'), 'Exit sign']);
    const { set, ids } = addPlanSheets(setOf(r.project), r.project, 'lighting');
    const d = planDrawing(r.project, set.sheets.find((s) => s.id === ids[0])!)!;
    expect(d.legendSvg).toMatch(new RegExp(`>Emergency light</text>.*>${r.fittings}</text>`, 's'));
    expect(d.legendSvg).toMatch(/>Exit sign<\/text>.*>1<\/text>/s);
    expect(d.svg).toContain('>EX</text>');
    const colours = [...d.svg.matchAll(/(?:fill|stroke)="#([0-9a-f]{6}|[0-9a-f]{3})"/gi)].map((m) => (m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1]).toLowerCase());
    expect(colours.every((c) => c.slice(0, 2) === c.slice(2, 4) && c.slice(2, 4) === c.slice(4))).toBe(true); // black, white and greys only
  });

  it('refuses no circuit, or nothing to place', () => {
    const layout = emergencyLayout([[[1, 5], [11, 5]]], [], [], TYPICAL_FITTING);
    expect(() => placeEmergency(villa, gf, '', layout)).toThrow(/unswitched lighting circuit/);
    expect(() => placeEmergency(villa, gf, circuit, emergencyLayout([], [], [], TYPICAL_FITTING))).toThrow(/Nothing to place/);
  });
});
