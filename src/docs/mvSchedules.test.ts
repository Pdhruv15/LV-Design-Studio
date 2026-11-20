import { describe, expect, it } from 'vitest';
import { newProject, type Board, type Project } from '../types';
import { rmuSchedule, txSchedule } from './mvSchedules';

const tx = (id: string, extra: Partial<Board> = {}): Board => ({ id, name: id, kind: 'MDB', sourceKva: 1000, sourceImpedancePct: 6, ...extra });
/** SS-1: RMU-1 (RRTTT, fuse 80 A, rated) → MDB-1, MDB-2, one tee-off spare. SS-2: RMU-2 (RRT, breaker, N/O R2) → MDB-3.
 * MDB-4 teed off the ring in no substation; MDB-A on an authority LV supply. */
const p: Project = {
  ...newProject('MV'), voltageV: 400, feeders: [],
  boards: [
    tx('MDB-1', { rmu: 'RMU-1', substation: 'SS-1' }), tx('MDB-2', { rmu: 'RMU-1', substation: 'SS-1', sourceKva: 1500, vectorGroup: 'Dyn5' }),
    tx('MDB-3', { rmu: 'RMU-2', substation: 'SS-2' }), tx('MDB-4', { sourceImpedancePct: undefined }), { id: 'MDB-A', name: 'MDB-A', kind: 'MDB', supply: { fedFrom: 'DEWA', ratingA: 200 } }
  ],
  rmus: [
    { name: 'RMU-1', config: 'RRTTT', ratedKv: 12, ratedA: 630, ikKa: 20, ikDurationS: 3, tOff: 'fuse', fuseA: 80 },
    { name: 'RMU-2', config: 'RRT', tOff: 'vcb', normallyOpen: 'R2' }
  ]
};

describe('MV overview schedules', () => {
  it('RMU SCHEDULE: each RMU in ring order with its substation, ways, ratings, protection and what each tee-off feeds', () => {
    const t = rmuSchedule(p)!;
    expect([t.title, t.head]).toEqual(['RMU SCHEDULE', ['RMU', 'S/S', 'Ways', 'Rating', 'Short-time', 'Tee-off protection', 'Feeds']]);
    expect(t.rows).toEqual([
      ['RMU-1', 'SS-1', 'RRTTT', '12 kV · 630 A', '20 kA 3 s', 'switch-fuse 80 A', 'TX-1, TX-2, T3 spare'],
      ['RMU-2', 'SS-2', 'RRT', '—', '—', 'CB, relay 50/51, 50N/51N', 'TX-3 · N/O on R2']
    ]);
    expect(t.widths).toHaveLength(t.head.length);
    expect(rmuSchedule({ ...p, boards: p.boards.map((b) => ({ ...b, rmu: undefined })) })).toBeUndefined();
  });

  it('TRANSFORMER SCHEDULE: each transformer with rating, impedance, group, ratio, substation, RMU way, main board and sheet', () => {
    const t = txSchedule(p, { 'MDB-1': 'E-SLD-002', 'MDB-2': 'E-SLD-002', 'MDB-3': 'E-SLD-003' })!;
    expect([t.title, t.head]).toEqual(['TRANSFORMER SCHEDULE', ['TX', 'kVA', 'Z %', 'Group', 'Ratio', 'S/S', 'RMU / way', 'Main board', 'Sheet']]);
    expect(t.rows).toEqual([
      ['TX-1', '1000', '6', 'Dyn11', '11 / 0.400 kV', 'SS-1', 'RMU-1 / T1', 'MDB-1', 'E-SLD-002'],
      ['TX-2', '1500', '6', 'Dyn5', '11 / 0.400 kV', 'SS-1', 'RMU-1 / T2', 'MDB-2', 'E-SLD-002'],
      ['TX-3', '1000', '6', 'Dyn11', '11 / 0.400 kV', 'SS-2', 'RMU-2 / T1', 'MDB-3', 'E-SLD-003'],
      ['TX-4', '1000', '—', 'Dyn11', '11 / 0.400 kV', '—', '—', 'MDB-4', '—']
    ]);
    expect(t.widths).toHaveLength(t.head.length);
    expect(txSchedule({ ...p, boards: [p.boards[4]] })).toBeUndefined();
  });

  it('writes each ratio with the voltage of the grid source feeding the transformer', () => {
    const ratios = (q: Project) => Object.fromEntries(txSchedule(q)!.rows.map((r) => [r[0], r[4]]));
    const two: Project = { ...p, gridSources: [{ id: 'A', name: 'A', kv: 11 }, { id: 'B', name: 'B', kv: 33 }], rmus: p.rmus!.map((r) => (r.name === 'RMU-2' ? { ...r, sourceId: 'B' } : r)) };
    expect(ratios(two)).toEqual({ 'TX-1': '11 / 0.400 kV', 'TX-2': '11 / 0.400 kV', 'TX-3': '33 / 0.400 kV', 'TX-4': '11 / 0.400 kV' });
    expect(new Set(Object.values(ratios({ ...p, gridSources: [{ id: 'A', name: 'A', kv: 22 }] })))).toEqual(new Set(['22 / 0.400 kV']));
  });
});
