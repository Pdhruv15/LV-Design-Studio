import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { addSpareWay } from '../model/spareWays';
import { newSheet, type Sheet } from '../model/sheets';
import type { Project } from '../types';
import { applyLinked, pendingMarks } from './sheetApply';
import { addCircuitRow, fillLinked, typeLinked } from './sheetLink';
import { scheduleRowKeys, templateData } from './scheduleFields';

/** A panel schedule on DB-GF1: the board number in B2, the first circuit row 6, a column each for the typed values and one of your own. */
const linked = (): Sheet => ({ ...newSheet(), link: { category: 'db', boardId: 'DB-GF1', firstRow: 6, cells: { B2: { field: 'board.id' } }, rows: [], columns: { A: 'row.ref', B: 'row.room', C: 'row.mcb', D: 'row.wire', E: 'row.ecc', F: 'row.length', G: 'row.watts', H: 'row.remarks', I: 'own' } } });
const shown = (p: Project, s: Sheet = linked()) => fillLinked(p, s);
const typed = (p: Project, s: Sheet, edits: Record<string, string>) => typeLinked(p, s, edits).sheet;
const feeder = (p: Project, id: string) => p.feeders.find((f) => f.id === id)!;
const N = scheduleRowKeys(sampleProject, 'DB-GF1').length; // the first free row after the circuits is 6 + N

describe('applyLinked', () => {
  it('room and remarks reach the circuit; the typed values leave the sheet and the next fill shows them from the project', () => {
    const s = typed(sampleProject, shown(sampleProject), { B6: 'Hall lights', H6: 'dimmable' });
    expect(s.link!.pending).toEqual({ 'DB-GF1-R1': { B: 'Hall lights', H: 'dimmable' } });
    const r = applyLinked(sampleProject, s);
    expect(r).toMatchObject({ changed: 1, added: 0, rejected: [] });
    expect(feeder(r.project, 'DB-GF1-R1')).toMatchObject({ room: 'Hall lights', remarks: 'dimmable' });
    expect(r.sheet.link!.pending).toBeUndefined();
    expect(shown(r.project, r.sheet).cells.B6).toBe('Hall lights');
  });

  it('a typed MCB is kept as sized by hand', () => {
    const s = typed(sampleProject, shown(sampleProject), { C7: '16' });
    const f = feeder(applyLinked(sampleProject, s).project, 'DB-GF1-Y1');
    expect(f).toMatchObject({ breakerRatingA: 16, manualSize: true });
  });

  it('an invalid cable size is rejected with the user\'s cell and stays pending; the rest is applied', () => {
    const s = typed(sampleProject, shown(sampleProject), { D6: '3', B6: 'Hall' });
    const r = applyLinked(sampleProject, s);
    expect(r.rejected).toEqual(['D6: "3" is not a valid cable size']);
    expect(r.changed).toBe(1);
    expect(feeder(r.project, 'DB-GF1-R1').cableCsaMm2).toBe(2.5);
    expect(r.sheet.link!.pending).toEqual({ 'DB-GF1-R1': { D: '3' } });
    const only = typed(sampleProject, shown(sampleProject), { D6: '3' });
    const none = applyLinked(sampleProject, only);
    expect(none.rejected).toHaveLength(1);
    expect(none.project).toBe(sampleProject);
    expect(none.sheet).toBe(only);
  });

  it('a typed load is one load item: ltg for a lights description, spare1 otherwise', () => {
    const s = typed(sampleProject, shown(sampleProject), { B6: 'Hall LIGHTS', G6: '2500', B7: 'Store', G7: '600' });
    const r = applyLinked(sampleProject, s);
    expect(r.changed).toBe(2);
    expect(feeder(r.project, 'DB-GF1-R1')).toMatchObject({ points: {}, loadItems: [{ name: 'Hall LIGHTS', pointType: 'ltg', quantity: 1, unitWatts: 2500 }] });
    expect(feeder(r.project, 'DB-GF1-Y1').loadItems).toEqual([{ name: 'Store', pointType: 'spare1', quantity: 1, unitWatts: 600 }]);
    const rows = templateData(r.project, 'DB-GF1').rows;
    expect([rows[0]['row.watts'], rows[1]['row.watts']]).toEqual([2500, 600]);
    const bad = applyLinked(sampleProject, typed(sampleProject, shown(sampleProject), { G6: 'lots', G7: '0' }));
    expect(bad.rejected).toEqual(['G6: "lots" is not a load in watts', 'G7: "0" is not a load in watts']);
  });

  it('a new row with a description and a load becomes a circuit sized by the rules, and its own text stays beside it', () => {
    const s0 = addCircuitRow(shown(sampleProject));
    const s1 = shown(sampleProject, s0);
    expect(s1.link!.rows[N]).toBe('new:0');
    const row = 6 + N;
    const s = typed(sampleProject, s1, { [`B${row}`]: 'New store', [`G${row}`]: '1500', [`I${row}`]: 'mine' });
    expect(s.link!.added).toEqual([{ B: 'New store', G: '1500' }]);
    const r = applyLinked(sampleProject, s);
    expect(r).toMatchObject({ changed: 0, added: 1, rejected: [] });
    expect(r.project.feeders).toHaveLength(sampleProject.feeders.length + 1);
    const made = r.project.feeders.find((f) => !sampleProject.feeders.some((x) => x.id === f.id))!;
    expect(made).toMatchObject({ boardId: 'DB-GF1', room: 'New store' });
    expect(made.manualSize).toBeFalsy();
    expect(made.breakerRatingA).toBeGreaterThan(0);
    expect(made.cableCsaMm2).toBeGreaterThanOrEqual(2.5);
    expect(r.sheet.link!.added).toBeUndefined();
    const again = shown(r.project, r.sheet);
    const keys = scheduleRowKeys(r.project, 'DB-GF1');
    const at = keys.indexOf(made.id);
    expect(again.cells[`I${6 + at}`]).toBe('mine');
    expect(again.cells[`B${6 + at}`]).toBe('New store');
    expect(Object.values(again.cells).filter((v) => v === 'mine')).toHaveLength(1);
  });

  it('a new row with nothing useful is rejected and kept; the rows left are numbered again', () => {
    const base = shown(sampleProject, addCircuitRow(addCircuitRow(shown(sampleProject))));
    const s = typed(sampleProject, shown(sampleProject, base), { [`H${6 + N}`]: 'remark only', [`B${7 + N}`]: 'Pump room' });
    const r = applyLinked(sampleProject, s);
    expect(r.rejected).toEqual([`Row ${6 + N}: give a description or a load`]);
    expect(r.added).toBe(1);
    expect(r.sheet.link!.added).toEqual([{ H: 'remark only' }]);
    expect(r.sheet.link!.rows[N]).toBe('new:0');
    expect(r.sheet.link!.rows).toHaveLength(N + 2);
    expect(r.sheet.link!.rows[N + 1]).toMatch(/^DB-GF1-/);
  });

  it('a spare takes its MCB rating', () => {
    const p = addSpareWay(sampleProject, 'DB-GF1', 'spare').project;
    const keys = scheduleRowKeys(p, 'DB-GF1'), at = keys.findIndex((k) => k.startsWith('spare:'));
    const s = typed(p, shown(p), { [`C${6 + at}`]: '25' });
    const r = applyLinked(p, s);
    expect(r.changed).toBe(1);
    expect(r.project.boards.find((b) => b.id === 'DB-GF1')!.spareWays![0].ratingA).toBe(25);
  });

  it('has nothing to do for a sheet with nothing typed', () => {
    const s = shown(sampleProject);
    const r = applyLinked(sampleProject, s);
    expect(r).toEqual({ project: sampleProject, sheet: s, changed: 0, added: 0, rejected: [] });
    expect(r.project).toBe(sampleProject);
    expect(r.sheet).toBe(s);
  });
});

describe('pendingMarks', () => {
  it('marks a typed value pending, a refused one with its reason, and a size that fails its check', () => {
    const s = typed(sampleProject, shown(sampleProject), { B6: 'Hall', D7: '3', C8: '32' });
    const marks = pendingMarks(sampleProject, s);
    expect(marks.B6).toEqual({ kind: 'pending', text: 'Typed, not applied yet' });
    expect(marks.D7).toEqual({ kind: 'refused', text: '"3" is not a valid cable size' });
    expect(marks.C8.kind).toBe('check');
    expect(marks.C8.text).toBe('After Apply this circuit needs a check: Cable not protected: In 32 A > Iz 31.3 A; DEWA Table 1: 32 A breaker on 2.5 mm² (max 16 A)');
    expect(Object.keys(marks).sort()).toEqual(['B6', 'C8', 'D7']);
    expect(pendingMarks(sampleProject, shown(sampleProject))).toEqual({});
  });
});
