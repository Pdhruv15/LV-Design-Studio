import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { cableLabel } from './cadDevices';
import { planTarget, type PlanTarget } from './planTarget';
import type { Project, SketchItem } from '../types';

const lv = (id: string, name: string) => ({ id, name, kind: 'ground' as const, heightM: 4 });
const base: Project = {
  ...sampleProject, lvPoints: undefined, cadSketch: undefined, cadPlanLinks: undefined,
  building: { buildings: [{ id: 'V', name: 'Villa', levels: [lv('L0', 'Ground'), lv('L1', 'Level 1'), lv('L2', 'Level 2')] }], rooms: [] },
  cadPlans: [{ building: 'V', level: 'L0', file: 'g.dxf', units: 6 }, { building: 'V', level: 'L1', file: 'l1.dxf', units: 6 }]
};
const circuit = base.feeders.find((f) => !f.feedsBoardId && !f.generation)!;
const toBoard = base.feeders.find((f) => f.feedsBoardId)!;
const point = (id: string, levelId: string, x = 1, y = 1) => ({ id, type: 'ltg' as const, feederId: circuit.id, buildingId: 'V', levelId, x, y });
const route = (id: string, feederId: string, pts: [number, number][]): SketchItem => ({ id, kind: 'pline', layer: 'E-CABLE', pts, cable: { feederId } });
const ok = (t: PlanTarget | string) => { expect(typeof t).not.toBe('string'); return t as PlanTarget; };
const withBoard = (p: Project, id: string, extra: object) => ({ ...p, boards: p.boards.map((b) => (b.id === id ? { ...b, ...extra } : b)) });

describe('Show on plan: where a board or circuit is', () => {
  it('shows a placed board on its level, the window a single point gets at least 4 m each way', () => {
    const p = withBoard(base, toBoard.feedsBoardId!, { level: { building: 'V', level: 'L1' }, planPoint: { x: 10, y: 20 }, location: 'Elec. room 1.01' });
    const t = ok(planTarget(p, { board: toBoard.feedsBoardId! }));
    expect(t).toMatchObject({ kind: 'board', file: 'l1.dxf', keys: [`board:${toBoard.feedsBoardId}`], itemIds: [], box: { x0: 6, y0: 16, x1: 14, y1: 24 }, label: `${toBoard.feedsBoardId} · Level 1 · Elec. room 1.01` });
    expect(t.note).toBeUndefined();
  });

  it('says so when a board is not placed, or its level has no plan drawing', () => {
    expect(planTarget(base, { board: 'MDB-1' })).toBe('MDB-1 is not placed on a plan (Design CAD → Place board)');
    const p = withBoard(base, 'MDB-1', { level: { building: 'V', level: 'L2' }, planPoint: { x: 1, y: 1 } });
    expect(planTarget(p, { board: 'MDB-1' })).toBe('No plan drawing is set for Level 2');
  });

  it('shows a circuit by its drawn route, grown by a quarter, in metres whatever the drawing units', () => {
    const p = { ...base, cadSketch: [{ file: 'l1.dxf', items: [route('S1', circuit.id, [[0, 0], [20, 0]]), route('S2', circuit.id, [[20, 0], [20, 10]])] }] };
    const t = ok(planTarget(p, { feeder: circuit.id }));
    expect(t).toMatchObject({ kind: 'route', file: 'l1.dxf', itemIds: ['S1', 'S2'], keys: [] });
    expect(t.box).toEqual({ x0: -2.5, y0: -1.25, x1: 22.5, y1: 11.25 });
    const mm = { ...p, cadPlans: [{ building: 'V', level: 'L1', file: 'l1.dxf', units: 4 }] };
    expect(ok(planTarget(mm, { feeder: circuit.id })).box!.x1).toBeCloseTo(4.01, 6); // 20 mm of route: the 4 m minimum
  });

  it('takes the lowest level when route pieces are on several, and ignores another circuit\'s route', () => {
    const p = { ...base, cadSketch: [
      { file: 'l1.dxf', items: [route('S1', circuit.id, [[0, 0], [5, 5]])] },
      { file: 'g.dxf', items: [route('S2', circuit.id, [[0, 0], [5, 5]]), route('S3', toBoard.id, [[50, 50], [60, 60]])] }
    ] };
    expect(ok(planTarget(p, { feeder: circuit.id }))).toMatchObject({ file: 'g.dxf', itemIds: ['S2'] });
  });

  it('matches the sketch\'s file name to the plan\'s whatever the letter case', () => {
    const p = { ...base, cadSketch: [{ file: 'L1.DXF', items: [route('S1', circuit.id, [[0, 0], [20, 0]])] }] };
    expect(ok(planTarget(p, { feeder: circuit.id }))).toMatchObject({ file: 'l1.dxf', itemIds: ['S1'] });
  });

  it('shows a route linked by handle on its drawing, with nothing to zoom to or pick', () => {
    const p = { ...base, cadPlanLinks: [{ file: 'l1.dxf', routes: { '2F': circuit.id } }] };
    const t = ok(planTarget(p, { feeder: circuit.id }));
    expect(t).toMatchObject({ kind: 'route', file: 'l1.dxf', itemIds: [] });
    expect(t.box).toBeUndefined();
  });

  it('prefers a drawn route to placed devices', () => {
    const p = { ...base, lvPoints: [point('P1', 'L0')], cadSketch: [{ file: 'l1.dxf', items: [route('S1', circuit.id, [[0, 0], [5, 5]])] }] };
    expect(ok(planTarget(p, { feeder: circuit.id })).kind).toBe('route');
  });

  it('shows devices on the level holding most of them', () => {
    const p = { ...base, lvPoints: [point('P1', 'L0', 0, 0), point('P2', 'L1', 2, 2), point('P3', 'L1', 12, 8)] };
    const t = ok(planTarget(p, { feeder: circuit.id }));
    expect(t).toMatchObject({ kind: 'devices', file: 'l1.dxf', keys: ['lv:P2', 'lv:P3'] });
    expect(t.box).toEqual({ x0: 0.75, y0: 1, x1: 13.25, y1: 9 }); // 10 wide grown by a quarter; 6 high held to 8 m
  });

  it('takes the lowest level on a tie of devices', () => {
    const p = { ...base, lvPoints: [point('P1', 'L1'), point('P2', 'L0')] };
    expect(ok(planTarget(p, { feeder: circuit.id }))).toMatchObject({ file: 'g.dxf', keys: ['lv:P2'] });
  });

  it('shows the board a feeder feeds when it has no route or devices, and says so', () => {
    const id = toBoard.feedsBoardId!;
    const p = withBoard(base, id, { level: { building: 'V', level: 'L0' }, planPoint: { x: 3, y: 3 }, location: 'Elec. room 0.01' });
    const t = ok(planTarget(p, { feeder: toBoard.id }));
    expect(t).toMatchObject({ kind: 'board', keys: [`board:${id}`], file: 'g.dxf' });
    expect(t.label).toBe(`${id} · Ground · Elec. room 0.01`);
    expect(`${t.note}: ${t.label}`).toBe(`${cableLabel(p, toBoard)} has no route or devices on a plan; showing the board it feeds: ${id} · Ground · Elec. room 0.01`);
  });

  it('says so when a circuit has nothing on a plan, or its level has no drawing', () => {
    expect(planTarget(base, { feeder: circuit.id })).toBe(`${cableLabel(base, circuit)} has no route or devices on a plan`);
    const p = { ...base, lvPoints: [point('P1', 'L2')] };
    expect(planTarget(p, { feeder: circuit.id })).toBe('No plan drawing is set for Level 2');
  });
});
