import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import type { Board, Feeder, Project } from '../types';
import { autoSheets, drawable, drawnProject, isMvView, mainSheetNos, MV_OVERVIEW_TITLE, sheetChecks, sheetHash, sheetProject } from './drawingSet';

const tx = (id: string, extra: Partial<Board> = {}): Board => ({ id, name: id, kind: 'MDB', sourceKva: 1000, sourceImpedancePct: 6, ...extra });
const sub = (id: string, up: string): Board => ({ id, name: id, kind: 'SMDB', upstreamId: up });
const inc = (from: string, to: string): Feeder => ({ id: `I-${to}`, boardId: from, feedsBoardId: to, name: to, loadKw: 0, demandFactor: 1, powerFactor: 0.9, lengthM: 30, cableCsaMm2: 95, cores: 4, breakerRatingA: 250, breakerIcuKa: 50, breakerType: 'MCCB' });
/** SS-1: RMU-1 → MDB-1 (the sample's, with its boards) and MDB-2, tied by BC-1. SS-2: RMU-2 → MDB-3. RMU-3 → MDB-4 in no
 * substation; MDB-5 teed off the ring; MDB-A on an authority LV supply. */
const p: Project = {
  ...sampleProject,
  boards: [
    ...sampleProject.boards.map((b) => (b.id === 'MDB-1' ? { ...b, rmu: 'RMU-1', substation: 'SS-1' } : b)),
    tx('MDB-2', { rmu: 'RMU-1', substation: 'SS-1' }), sub('SMDB-2A', 'MDB-2'), tx('MDB-3', { rmu: 'RMU-2', substation: 'SS-2' }), sub('SMDB-3A', 'MDB-3'),
    tx('MDB-4', { rmu: 'RMU-3' }), tx('MDB-5'), { id: 'MDB-A', name: 'MDB-A', kind: 'MDB', supply: { fedFrom: 'DEWA', ratingA: 200 } }, { id: 'DB-A', name: 'DB-A', kind: 'DB', upstreamId: 'MDB-A' }
  ],
  feeders: [...sampleProject.feeders, inc('MDB-2', 'SMDB-2A'), inc('MDB-3', 'SMDB-3A'), inc('MDB-A', 'DB-A')],
  ties: [{ id: 'BC-1', a: 'MDB-1', b: 'MDB-2', ratingA: 1600 }],
  rmus: [{ name: 'RMU-1', config: 'RRTT' }, { name: 'RMU-2', config: 'RRT', normallyOpen: 'R2' }]
};
const set = autoSheets(p, 'perSubstation');
const sld = set.sheets.filter((s) => s.kind === 'system');

describe('One sheet per substation (proposal 2026-11-18 part 5)', () => {
  it('makes the MV overview, then a sheet per substation in ring order, per RMU or transformer in none, per authority supply', () => {
    expect(sld.map((s) => [s.number, s.title])).toEqual([
      ['E-SLD-001', MV_OVERVIEW_TITLE],
      ['E-SLD-002', 'SLD — SS-1 (TX-1, TX-2)'],
      ['E-SLD-003', 'SLD — SS-2 (TX-3)'],
      ['E-SLD-004', 'SLD — RMU-3 (TX-4)'],
      ['E-SLD-005', 'SLD — MDB-5 (TX-5)'],
      ['E-SLD-006', 'SLD — MDB-A (authority LV supply)']
    ]);
    expect(set.sheets.some((s) => s.kind === 'earthing')).toBe(true);
    // The MV overview holds no panels; every board is on the sheet of its substation, RMU, transformer or supply.
    expect([isMvView(sld[0]), sld[0].boards]).toEqual([true, []]);
    expect(sld[1].boards).toEqual(expect.arrayContaining(['MDB-1', 'SMDB-GF', 'DB-GF1', 'MDB-2', 'SMDB-2A']));
    expect(sld[1].boards).not.toContain('MDB-3');
    expect(sld.slice(1).flatMap((s) => s.boards).sort()).toEqual(p.boards.map((b) => b.id).sort());
    // A bus coupler between two main boards of one substation stays on its sheet.
    expect(sheetProject(p, set, sld[1]).ties).toEqual([{ id: 'BC-1', a: 'MDB-1', b: 'MDB-2', ratingA: 1600 }]);
    // Asking for DB sheets too adds them after the SLDs.
    expect(autoSheets(p, 'perSubstation', true).sheets.some((s) => s.kind === 'board')).toBe(true);
  });

  it('the MV overview draws the main boards only, names the sheet each is on, and passes the checks', () => {
    expect(drawable(sld[0])).toBe(true);
    expect(mainSheetNos(p, set)).toEqual({ 'MDB-1': 'E-SLD-002', 'MDB-2': 'E-SLD-002', 'MDB-3': 'E-SLD-003', 'MDB-4': 'E-SLD-004', 'MDB-5': 'E-SLD-005', 'MDB-A': 'E-SLD-006' });
    const d = drawnProject(p, set, sld[0]);
    expect([d.boards.map((b) => b.id), d.feeders.length]).toEqual([['MDB-1', 'MDB-2', 'MDB-3', 'MDB-4', 'MDB-5', 'MDB-A'], 0]);
    expect(drawnProject(p, set, sld[1])).toEqual(sheetProject(p, set, sld[1]));
    const checks = sheetChecks(p, set).map((c) => c.text);
    expect(checks.filter((t) => t.includes('no panels') || t.includes('is on no sheet'))).toEqual([]);
  });

  it('its fingerprint follows what it prints: transformers, RMUs and the sheet numbers, not a DB\'s loads', () => {
    const h = sheetHash(p, set, sld[0]);
    const kva: Project = { ...p, boards: p.boards.map((b) => (b.id === 'MDB-3' ? { ...b, sourceKva: 1500 } : b)) };
    const nop: Project = { ...p, rmus: [{ name: 'RMU-1', config: 'RRTT', normallyOpen: 'R1' }, { name: 'RMU-2', config: 'RRT' }] };
    const load: Project = { ...p, feeders: p.feeders.map((f, i) => (i === 0 ? { ...f, loadKw: f.loadKw + 5 } : f)) };
    const moved = { ...set, sheets: set.sheets.map((s) => (s.id === sld[2].id ? { ...s, number: 'E-SLD-009' } : s)) };
    expect([sheetHash(kva, set, sld[0]) !== h, sheetHash(nop, set, sld[0]) !== h, sheetHash(p, moved, sld[0]) !== h, sheetHash(load, set, sld[0]) === h]).toEqual([true, true, true, true]);
    // A substation's own sheet does change with its loads.
    const ss1Load: Project = { ...p, feeders: p.feeders.map((f) => (f.boardId === 'DB-GF1' ? { ...f, loadKw: f.loadKw + 5 } : f)) };
    expect(sheetHash(ss1Load, set, sld[1])).not.toBe(sheetHash(p, set, sld[1]));
  });
});
