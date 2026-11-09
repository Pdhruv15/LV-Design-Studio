import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { scheduleTable } from './loadScheduleDoc';
import { tableHeightMm, TABLE_ROW_MM } from './sheetTable';
import { buildSldSheetHtml } from './sldSheet';

/** A DB's load schedule as a table under its circuit diagram on the board sheet. */
describe('schedule table on a board sheet', () => {
  const db = sampleProject.boards.find((b) => b.kind === 'DB' && sampleProject.feeders.some((f) => f.boardId === b.id))!;
  it('has the schedule document\'s columns and rows, totals at the foot', () => {
    const t = scheduleTable(sampleProject, db.id);
    expect(t.title).toContain(db.id);
    expect(t.head.slice(0, 7)).toEqual(['Sl.', 'Cct', 'ELCB', 'MCB A', 'Wire mm²', 'ECC mm²', 'Room / area']);
    expect(t.head.slice(-4)).toEqual(['R (W)', 'Y (W)', 'B (W)', 'Remarks']);
    expect(t.rows.length).toBeGreaterThan(0);
    for (const r of [...t.rows, ...t.foot]) expect(r).toHaveLength(t.head.length);
    expect(t.widths).toHaveLength(t.head.length);
    expect(t.foot[0]).toContain('TOTAL CONNECTED LOAD (W)');
    expect(t.lines[0]).toContain(`DB: ${db.id}`);
    expect(tableHeightMm(t)).toBeCloseTo(5 + t.lines.length * 3.6 + (2 + t.rows.length + 2) * TABLE_ROW_MM + 4, 6);
    expect(tableHeightMm(t, 3.5)).toBeGreaterThan(tableHeightMm(t));
  });
  it('prints under the drawing, which moves up by its height', () => {
    const t = scheduleTable(sampleProject, db.id);
    const html = buildSldSheetHtml(sampleProject, '<svg viewBox="0 0 100 50"></svg>', 'A3', { no: 'E-DB-001', title: 'DB', count: 1, index: 1, table: t });
    expect(html).toContain('<div class="tbl">');
    expect(html).toContain(`.tbl { position: absolute; left: 3mm; right: calc(3mm + 92mm); bottom: 3mm; height: ${+tableHeightMm(t).toFixed(2)}mm`);
    expect(html).toContain(`bottom: ${+(3 + tableHeightMm(t)).toFixed(2)}mm; display: flex`);
    expect((html.match(/<tr>/g) ?? []).length).toBeGreaterThanOrEqual(t.rows.length + 1);
  });
});
