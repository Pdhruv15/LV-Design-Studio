import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { planEmergency } from './emergency';
import { incompleteSchedules, scheduleGroupOf, scheduleGroups } from './scheduleGroups';
import { buildFormWorkbook } from '../docs/formWorkbook';
import { scheduleCircuits } from '../calc/loadSchedule';
import type { Board, Project } from '../types';

describe('load schedule groups', () => {
  it('sample: MDB, SMDB, DB and MCC tabs in supply order', () => {
    const g = scheduleGroups(sampleProject);
    expect(Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v.map((b) => b.id)]))).toEqual({ mdb: ['MDB-1'], smdb: ['SMDB-GF', 'SMDB-FF'], db: ['DB-GF1'], emg: [], mcc: ['MCC-1'], other: [] });
  });

  it('emergency system in its own tab: EMDB, then ESMDBs, then EDBs; workbook in the same order', () => {
    const e = planEmergency(sampleProject, { count: 1, mainsFrom: 'MDB-1', esmdb: 2, edb: 3, incomers: true });
    expect(e.ok).toBe(true);
    const p = { ...sampleProject, boards: [...sampleProject.boards, ...e.boards], feeders: [...sampleProject.feeders, ...e.feeders] };
    const g = scheduleGroups(p);
    expect(g.emg.map((b) => b.kind)).toEqual(['EMDB', 'SMDB', 'SMDB', 'DB', 'DB', 'DB']);
    expect(g.smdb.map((b) => b.id)).toEqual(['SMDB-GF', 'SMDB-FF']); // emergency sub-mains are not in the normal SMDB tab
    const names = buildFormWorkbook(p).worksheets.map((w) => w.name);
    expect(names.indexOf('DB-GF1 SCHEDULE')).toBeLessThan(names.findIndex((n) => n.startsWith(e.boards[0].id)));
    expect(names.findIndex((n) => n.startsWith(e.boards[0].id))).toBeLessThan(names.indexOf('MCC-1 MD'));
  });

  it('groups explicit LV-MDB, EDB and EMCC panel types for schedules', () => {
    const p = {
      ...sampleProject,
      boards: [
        ...sampleProject.boards,
        { id: 'LV-MDB-2', name: 'LV main', kind: 'LV-MDB' as const },
        { id: 'EDB-1', name: 'Emergency DB', kind: 'EDB' as const, upstreamId: 'MDB-1' },
        { id: 'EMCC-1', name: 'Emergency MCC', kind: 'EMCC' as const, upstreamId: 'MDB-1' }
      ]
    };
    const g = scheduleGroups(p);
    expect(g.mdb.map((b) => b.id)).toContain('LV-MDB-2');
    expect(g.emg.map((b) => b.id)).toEqual(['EDB-1', 'EMCC-1']);
  });

  it('marks the panels whose schedule still needs filling, as each panel tab worked it out before', () => {
    const byTab = (p: Project, b: Board) => (scheduleGroupOf(p, b) === 'db' || ['DB', 'EDB'].includes(b.kind ?? 'DB') ? !scheduleCircuits(p, b.id).length : !p.feeders.some((f) => f.boardId === b.id));
    const p: Project = {
      ...sampleProject,
      boards: [
        ...sampleProject.boards,
        { id: 'DB-NEW', name: 'New DB', upstreamId: 'SMDB-GF' },
        { id: 'DB-NOWAY', name: 'DB without ways', upstreamId: 'SMDB-GF' },
        { id: 'EDB-2', name: 'Emergency DB', kind: 'EDB', upstreamId: 'MDB-1' },
        { id: 'MCC-2', name: 'Pumps', kind: 'MCC', upstreamId: 'MDB-1' },
        { id: 'MCC-3', name: 'Fans', kind: 'MCC', upstreamId: 'MDB-1' }
      ],
      feeders: [
        ...sampleProject.feeders,
        { id: 'NOWAY-1', boardId: 'DB-NOWAY', name: 'Lighting', loadKw: 1, demandFactor: 1, powerFactor: 0.9, lengthM: 10, cableCsaMm2: 2.5, cores: 2, breakerRatingA: 16, breakerIcuKa: 6 },
        { id: 'MCC-3-1', boardId: 'MCC-3', name: 'Fan 1', loadKw: 5, demandFactor: 1, powerFactor: 0.85, lengthM: 20, cableCsaMm2: 4, cores: 4, breakerRatingA: 16, breakerIcuKa: 10 }
      ]
    };
    expect([...incompleteSchedules(p)].sort()).toEqual(p.boards.filter((b) => byTab(p, b)).map((b) => b.id).sort());
    expect(incompleteSchedules(p)).toEqual(new Set(['DB-NEW', 'DB-NOWAY', 'EDB-2', 'MCC-2']));
    expect(incompleteSchedules(sampleProject)).toEqual(new Set(sampleProject.boards.filter((b) => byTab(sampleProject, b)).map((b) => b.id)));
  });
});
