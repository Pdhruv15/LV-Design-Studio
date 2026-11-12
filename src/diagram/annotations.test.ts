import { describe, expect, it } from 'vitest';
import { buildAnnotations, DEFAULT_LAYERS, isView, SHEET_LAYERS, withView } from './annotations';
import { deleteBoard, boardAndDescendants } from '../model/edit';
import { evaluateProject } from '../calc/electrical';
import { boardSummary } from '../calc/summary';
import { sampleProject } from '../data/sampleProject';
import type { StudyResults } from '../engines/types';

const results = evaluateProject(sampleProject);

describe('diagram annotations', () => {
  it('uses the built-in results when no engine study is given', () => {
    const a = buildAnnotations(sampleProject, results);
    const r = results.find((x) => x.feeder.id === 'GF-HVAC')!;
    expect(a.feeders['GF-HVAC'].currentA).toBe(r.ib);
    expect(a.feeders['GF-HVAC'].vdTotalPct).toBe(r.vdTotalPct);
    expect(a.feeders['GF-HVAC'].faultKA).toBe(r.endFaultKA);
    expect(a.feeders['GF-HVAC'].pf).toBe(0.85);
    const s = boardSummary(sampleProject, sampleProject.boards[1]);
    expect(a.boards['SMDB-GF'].voltagePct).toBe(s.voltagePct);
    expect(a.boards['SMDB-GF'].voltageV).toBeCloseTo(415 * (s.voltagePct / 100), 9);
    expect(a.boards['MDB-1'].voltagePct).toBe(100);
    // An incomer shows the power factor of the board it supplies.
    expect(a.feeders['INC-GF'].pf).toBeCloseTo(s.powerFactor, 9);
  });

  it('prefers engine values where the engine reported them', () => {
    const engine: StudyResults = {
      engineId: 'opendss',
      feeders: { 'GF-HVAC': { ib: 190, vdTotalPct: 4.2, endFaultKA: 9.5 } },
      boards: { 'MDB-1': { voltagePct: 98.3, faultKA: 27.8 } },
      messages: []
    };
    const a = buildAnnotations(sampleProject, results, engine);
    expect(a.feeders['GF-HVAC']).toMatchObject({ currentA: 190, vdTotalPct: 4.2, faultKA: 9.5, vdStatus: 'bad' });
    expect(a.feeders['GF-HVAC'].loadingPct).toBeCloseTo((190 / 250) * 100, 9);
    expect(a.boards['MDB-1'].voltagePct).toBe(98.3);
    expect(a.boards['MDB-1'].voltageStatus).toBe('ok');
    // Values the engine didn't report fall back to built-in.
    expect(a.feeders['GF-LTG'].currentA).toBe(results.find((x) => x.feeder.id === 'GF-LTG')!.ib);
  });
});

describe('delete board', () => {
  it('removes the board, its feeders and its incomer', () => {
    const p = deleteBoard(sampleProject, 'MCC-1');
    expect(p.boards.map((b) => b.id)).toEqual(['MDB-1', 'SMDB-GF', 'SMDB-FF', 'DB-GF1']);
    expect(p.feeders.some((f) => f.boardId === 'MCC-1' || f.feedsBoardId === 'MCC-1')).toBe(false);
    expect(p.feeders).toHaveLength(sampleProject.feeders.length - 3); // INC-MCC, MCC-WP, MCC-FP
  });

  it('removes nested sub-boards too', () => {
    const nested = {
      ...sampleProject,
      boards: [...sampleProject.boards, { id: 'DB-X', name: 'X', upstreamId: 'SMDB-GF' }],
      feeders: [
        ...sampleProject.feeders,
        { ...sampleProject.feeders[0], id: 'INC-X', boardId: 'SMDB-GF', feedsBoardId: 'DB-X' },
        { ...sampleProject.feeders[5], id: 'X-1', boardId: 'DB-X' }
      ]
    };
    expect([...boardAndDescendants(nested, 'SMDB-GF')].sort()).toEqual(['DB-GF1', 'DB-X', 'SMDB-GF']);
    const p = deleteBoard(nested, 'SMDB-GF');
    expect(p.boards.map((b) => b.id)).not.toContain('DB-X');
    expect(p.feeders.map((f) => f.id)).not.toContain('X-1');
  });

  it('refuses to delete the only main board', () => {
    expect(() => deleteBoard(sampleProject, 'MDB-1')).toThrow(/at least one main board/);
  });
});

describe('sheet views and the Level and room tick', () => {
  const load = { current: true, voltage: false, vd: false, fault: false, pf: false, loading: true };
  it('keeps the constants without the tick, so the key is absent (off)', () => {
    expect('location' in DEFAULT_LAYERS || 'location' in SHEET_LAYERS).toBe(false);
  });
  it('a view chip keeps the sheet\'s tick as it was', () => {
    expect(withView({ ...SHEET_LAYERS, location: true }, load)).toEqual({ ...load, location: true });
    expect(withView(SHEET_LAYERS, load)).toBe(load);
    expect(withView({ ...SHEET_LAYERS, location: false }, load)).toBe(load);
  });
  it('the chip is on whatever the tick says', () => {
    expect(isView({ ...load, location: true }, load)).toBe(true);
    expect(isView({ ...load, location: false }, load)).toBe(true);
    expect(isView(load, load)).toBe(true);
    expect(isView({ ...load, location: true, fault: true }, load)).toBe(false);
    expect(isView({ ...SHEET_LAYERS, location: true }, SHEET_LAYERS)).toBe(true);
  });
});
