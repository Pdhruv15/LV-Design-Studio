import { describe, expect, it } from 'vitest';
import { newProject, type Project } from '../types';
import { buildDashboard } from '../calc/dashboard';
import { buildReportHtml } from '../docs/calcReport';
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
