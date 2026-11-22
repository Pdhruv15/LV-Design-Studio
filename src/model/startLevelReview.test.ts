import { describe, expect, it } from 'vitest';
import { newProject, type Project } from '../types';
import { buildDashboard } from '../calc/dashboard';
import { buildReportHtml } from '../docs/calcReport';
import { buildDesignBasis } from '../docs/designBasis';
import { autoSheets } from './drawingSet';
import { applyDrop, canDrop, tiePartner } from './sldEdit';
import { applyStartLevel } from './startLevel';

/** Review fixes: a first board fed from a board outside the project is not a substation, a coupler partner or an "authority supply". */
const canvas = { type: 'canvas' } as const;
const withDb = (p: Project) => applyDrop(p, { kind: 'board', board: 'DB' }, canvas).project;

describe('a first board fed from a board outside the project', () => {
  it('takes no bus coupler', () => {
    const p = withDb(newProject('X'));
    expect(tiePartner(p, 'DB-1')).toBeUndefined();
    expect(canDrop(p, { kind: 'tie' }, { type: 'bus', boardId: 'DB-1' })).toBe(false);
  });
  it('is not counted as a substation', () => {
    const p = withDb(applyStartLevel(newProject('X'), { level: 'rmu' }));
    expect(buildDashboard(p).substations).toBe(1);
  });
  it('is not called an authority supply in the report or the sheet titles', () => {
    const p = applyStartLevel(newProject('X'), { level: 'db' });
    const html = buildReportHtml(p);
    expect(html).toContain('DB-1: fed from a board outside this project');
    expect(html).not.toContain('authority supply');
    const q = withDb(applyStartLevel(newProject('X'), { level: 'rmu' }));
    expect(autoSheets(q, 'perSubstation').sheets.map((s) => s.title).join('|')).not.toContain('(LV source)');
  });
});

describe('a source with its rating typed in the documents', () => {
  const gen = (supply: NonNullable<Project['boards'][number]['supply']>): Project => {
    const p = applyStartLevel(newProject('X'), { level: 'db' });
    return { ...p, boards: p.boards.map((b) => (b.id === 'DB-1' ? { ...b, supply } : b)) };
  };
  it('the calculation report and the design basis say what the level rests on', () => {
    // 250 kVA, X″d 15 %, 415 V: 1.05 × 347.8 A ÷ 0.15 = 2.43 kA. 100 kVA PV at 1.2 × rated: 1.2 × 139.1 A = 0.17 kA.
    const g = gen({ kind: 'generator', ratedKva: 250 });
    expect(buildReportHtml(g)).toContain('DB-1: diesel generator 250 kVA, X″d 15 %, 2.43 kA calculated');
    expect(buildDesignBasis(g, []).system.supply).toEqual(['DB-1: diesel generator 250 kVA, X″d 15 %, 2.43 kA calculated']);
    const pv = gen({ kind: 'pv', ratedKva: 100 });
    expect(buildReportHtml(pv)).toContain('DB-1: solar PV 100 kVA, fault current 1.2 × rated, 0.17 kA calculated');
    expect(buildDesignBasis(pv, []).system.supply).toEqual(['DB-1: solar PV 100 kVA, fault current 1.2 × rated, 0.17 kA calculated']);
  });
  it('today\'s wording stays for a typed level and for an assumed one', () => {
    expect(buildReportHtml(gen({ kind: 'generator', ratedKva: 250, faultKa: 12 }))).toContain('DB-1: authority supply, 12 kA');
    expect(buildDesignBasis(gen({ kind: 'generator', ratedKva: 250, faultKa: 12 }), []).system.supply[0]).toBe('DB-1: supplied by Not defined, 12 kA fault level');
    expect(buildReportHtml(gen({ kind: 'generator' }))).toContain('DB-1: authority supply');
  });
});
