import { describe, expect, it } from 'vitest';
import { evaluateSheet } from '../calc/sheetFormula';
import { sampleProject } from '../data/sampleProject';
import { addSpareWay } from '../model/spareWays';
import { newSheet, withCells, withStyle, mergeArea, area, type Sheet, type SheetLink } from '../model/sheets';
import type { Project } from '../types';
import { fillLinked, linkFromPlaceholders, linkNeeds, linkToBoard, LINK_FIELDS } from './sheetLink';
import { scheduleRowKeys, templateData } from './scheduleFields';

const AT = new Date('2026-10-27T10:00:00Z');
const project = addSpareWay(sampleProject, 'DB-GF1', 'spare').project;
const data = templateData(project, 'DB-GF1', AT);
const N = data.rows.length;
const sheet = (cells: Record<string, string>): Sheet => withCells(newSheet(), cells);
const val = (s: Sheet, k: string) => evaluateSheet(s.cells)[k]?.value;

/** A panel schedule: heads in rows 1-2, the pattern row 5 (ref, room, own note, MCB, formula, watts), a SUM row below. */
const layout = (extra: Record<string, string> = {}): Sheet => {
  const s = linkFromPlaceholders(sheet({ A1: 'PANEL SCHEDULE', A2: 'DB: {{board.id}}', D2: 'FED FROM: {{board.fedFrom}} ', A5: '{{row.ref}}', B5: '{{ row.room }}', D5: '{{row.mcb}}', E5: '{{row.watts}}', F5: '=E5*2', ...extra }))!.sheet;
  return linkToBoard({ ...s, link: { ...s.link!, columns: { ...s.link!.columns, C: 'own' } } }, 'DB-GF1');
};
const sums = (extra: Record<string, string> = {}) => layout({ E6: '=SUM(E5:E5)', F7: '=SUM(E5:E5)+1', A8: 'End', ...extra });

describe('LINK_FIELDS', () => {
  it('every key is one templateData produces', () => {
    const have = new Set([...Object.keys(data.fields), ...Object.keys(data.rows[0])]);
    for (const f of LINK_FIELDS) if (f.key !== 'own') expect(have.has(f.key), f.key).toBe(true);
    expect(LINK_FIELDS.filter((f) => f.kind === 'cell').every((f) => !f.typed)).toBe(true);
    expect(LINK_FIELDS.find((f) => f.key === 'row.length')).toEqual({ key: 'row.length', label: 'Length, m', kind: 'row', typed: true });
    expect(LINK_FIELDS[LINK_FIELDS.length - 1]).toEqual({ key: 'own', label: 'Your column · kept with each circuit', kind: 'row', typed: true });
  });
});

describe('linkNeeds', () => {
  const link = (cells: SheetLink['cells'], columns: SheetLink['columns']): SheetLink => ({ category: 'db', cells, firstRow: 5, rows: [], columns });
  it('lists the three needs and which are met', () => {
    expect(linkNeeds(link({}, {})).map((n) => [n.label, n.ok])).toEqual([['Board number', false], ['Fed from', false], ['A description or a load on each row', false]]);
    expect(linkNeeds(link({ A1: { field: 'board.id' }, B1: { field: 'board.fedFrom' } }, { C: 'row.points.ltg' })).every((n) => n.ok)).toBe(true);
    expect(linkNeeds(link({ A1: { field: 'board.id' } }, { C: 'row.mcb' })).map((n) => n.ok)).toEqual([true, false, false]);
  });
});

describe('linkFromPlaceholders', () => {
  it('takes the pattern row, the header cells and their text', () => {
    const r = linkFromPlaceholders(sheet({ A2: 'DB: {{board.id}}', D2: 'FED FROM: {{board.fedFrom}} kV', A3: '{{board.name}}', A5: '{{row.ref}}', B5: '{{ row.room }}', C5: 'text', A6: '{{row.sl}}' }))!;
    expect(r.unknown).toEqual([]);
    expect(r.sheet.link).toEqual({
      category: 'db', firstRow: 5, rows: [], columns: { A: 'row.ref', B: 'row.room' },
      cells: { A2: { field: 'board.id', before: 'DB: ' }, D2: { field: 'board.fedFrom', before: 'FED FROM: ', after: ' kV' }, A3: { field: 'board.name' } }
    });
    expect(r.sheet.cells).toEqual({ A2: 'DB: ', D2: 'FED FROM:  kV', C5: 'text', A6: '{{row.sl}}' });
  });
  it('leaves unknown keys in place and lists them', () => {
    const r = linkFromPlaceholders(sheet({ A1: '{{board.colour}}', B1: '{{board.id}}', C1: '{{label.ltg}}', A5: '{{row.ref}}', B5: '{{row.nothing}}' }))!;
    expect(r.unknown).toEqual(['board.colour', 'row.nothing']);
    expect(r.sheet.cells).toEqual({ A1: '{{board.colour}}', B5: '{{row.nothing}}' });
    expect(r.sheet.link!.cells.C1).toEqual({ field: 'label.ltg' });
    expect(r.sheet.link!.columns).toEqual({ A: 'row.ref' });
  });
  it('finds nothing without a row placeholder', () => {
    expect(linkFromPlaceholders(sheet({ A1: '{{board.id}}', A5: 'x {{row.ref}}' }))).toBeUndefined();
  });
});

describe('fillLinked', () => {
  it('fills the header cells and one row per circuit and spare', () => {
    const s = fillLinked(project, layout(), AT);
    expect(s.cells.A2).toBe('DB: DB-GF1');
    expect(s.cells.D2).toBe(`FED FROM: ${data.fields['board.fedFrom']} `);
    expect(s.link!.rows).toEqual(scheduleRowKeys(project, 'DB-GF1'));
    expect(s.rows).toBeGreaterThanOrEqual(4 + N);
    for (let i = 0; i < N; i++) {
      const r = data.rows[i];
      expect(s.cells[`A${5 + i}`]).toBe(r['row.ref']);
      expect(s.cells[`B${5 + i}`]).toBe(r['row.room']);
      expect(s.cells[`D${5 + i}`]).toBe(r['row.mcb'] === '' ? undefined : String(r['row.mcb']));
      expect(s.cells[`E${5 + i}`]).toBe(r['row.watts'] === '' ? undefined : String(r['row.watts']));
    }
    expect(s.cells[`A${5 + N}`]).toBeUndefined();
  });
  it('writes a number as a number and a text that reads as a number with an apostrophe', () => {
    const s = fillLinked(project, layout(), AT);
    expect(typeof val(s, 'D5')).toBe('number');
    const named: Project = { ...project, boards: project.boards.map((b) => (b.id === 'DB-GF1' ? { ...b, name: '1234' } : b)) };
    const base = layout();
    const t = fillLinked(named, { ...base, link: { ...base.link!, cells: { A3: { field: 'board.name' } } } }, AT);
    expect(t.cells.A3).toBe("'1234");
  });
  it('a formula column is filled down', () => {
    const s = fillLinked(project, layout(), AT);
    expect(s.cells.F5).toBe('=E5*2');
    expect(s.cells[`F${4 + N}`]).toBe(`=E${4 + N}*2`);
  });
});

/** A project whose DB-GF1 has only its first n circuit and spare rows: the link is filled for each size in turn. */
const trimmed = (n: number): Project => {
  const keep = new Set(scheduleRowKeys(project, 'DB-GF1').slice(0, n));
  return { ...project, feeders: project.feeders.filter((f) => f.boardId !== 'DB-GF1' || keep.has(f.uid ?? f.id) || !f.phase), boards: project.boards.map((b) => (b.id === 'DB-GF1' ? { ...b, spareWays: b.spareWays?.filter((x) => keep.has(`spare:${x.id}`)) } : b)) };
};

describe('fillLinked — resizing', () => {
  const rowsOf = (p: Project) => scheduleRowKeys(p, 'DB-GF1').length;
  it('1 → 5 → 7 → 2 rows keep a SUM over the block exact, and the cells below move', () => {
    let s = fillLinked(trimmed(1), sums(), AT);
    expect(rowsOf(trimmed(1))).toBe(1);
    expect(s.cells.E6).toBe('=SUM(E5:E5)');
    for (const n of [5, 7, 2]) {
      const p = trimmed(n);
      expect(rowsOf(p)).toBe(n);
      s = fillLinked(p, s, AT);
      expect(s.link!.rows).toHaveLength(n);
      expect(s.cells[`E${5 + n}`]).toBe(`=SUM(E5:E${4 + n})`);
      expect(s.cells[`F${6 + n}`]).toBe(`=SUM(E5:E${4 + n})+1`);
      expect(s.cells[`A${7 + n}`]).toBe('End');
      expect(s.cells[`E${6 + n}`]).toBeUndefined();
      expect(s.cells[`A${5 + n}`]).toBeUndefined();
      expect(val(s, `E${5 + n}`)).toBe(data0(p).reduce((t, v) => t + v, 0));
    }
  });
  it('a DB with no circuits keeps one blank row', () => {
    const empty = { ...project, feeders: project.feeders.filter((f) => f.boardId !== 'DB-GF1' || !f.phase), boards: project.boards.map((b) => (b.id === 'DB-GF1' ? { ...b, spareWays: undefined } : b)) };
    const s = fillLinked(empty, fillLinked(project, sums(), AT), AT);
    expect(s.link!.rows).toEqual([]);
    expect(s.cells.A5).toBeUndefined();
    expect(s.cells.E6).toBe('=SUM(E5:E5)');
  });
});
const data0 = (p: Project) => templateData(p, 'DB-GF1', AT).rows.map((r) => Number(r['row.watts']) || 0);

describe('fillLinked — look', () => {
  it('copies the first row\'s styles and one-row merges to every row', () => {
    let base = withStyle(layout({ G5: 'x' }), area({ r: 5, c: 1 }, { r: 5, c: 2 }), { bold: true, border: 'trbl' });
    base = mergeArea(base, area({ r: 5, c: 7 }, { r: 5, c: 8 }));
    const s = fillLinked(project, base, AT);
    for (let i = 0; i < N; i++) {
      expect(s.styles![`A${5 + i}`]).toEqual({ bold: true, border: 'trbl' });
      expect(s.styles![`B${5 + i}`]).toEqual({ bold: true, border: 'trbl' });
      expect(s.merges).toContainEqual({ r0: 5 + i, c0: 7, r1: 5 + i, c1: 8 });
    }
    expect(s.merges).toHaveLength(N);
    const smaller = fillLinked(trimmed(2), s, AT);
    expect(smaller.merges).toHaveLength(2);
    expect(smaller.styles![`A${N + 5}`]).toBeUndefined();
  });
});

describe('fillLinked — own column', () => {
  it('text typed beside a circuit follows it when the order changes', () => {
    const keys = scheduleRowKeys(project, 'DB-GF1');
    let s = fillLinked(project, layout(), AT);
    s = withCells(s, { C5: 'first', C6: 'second', [`C${4 + N}`]: 'last' });
    // Moving circuits to other ways changes the order: swap the ways of the first and the last circuit.
    const circuits = keys.filter((k) => !k.startsWith('spare:')), first = circuits[0], second = circuits[circuits.length - 1];
    const ways = new Map(project.feeders.filter((f) => f.id === first || f.id === second).map((f) => [f.id, f.way]));
    const swapped: Project = { ...project, feeders: project.feeders.map((f) => (ways.has(f.id) ? { ...f, way: ways.get(f.id === first ? second : first) } : f)) };
    const after = scheduleRowKeys(swapped, 'DB-GF1');
    expect(after).not.toEqual(keys);
    const t = fillLinked(swapped, s, AT);
    const own = Object.fromEntries(keys.map((k, i) => [k, s.cells[`C${5 + i}`]]));
    after.forEach((k, i) => expect(t.cells[`C${5 + i}`], k).toBe(own[k]));
    // A key no longer on the board loses its text.
    const gone = fillLinked(trimmed(N - 1), s, AT);
    expect(Object.values(gone.cells).includes('last')).toBe(false);
  });
});

describe('fillLinked — repeat and unchanged', () => {
  it('a second call with nothing changed gives an equal sheet', () => {
    const once = fillLinked(project, sums(), AT);
    expect(fillLinked(project, once, AT)).toEqual(once);
    const grown = fillLinked(trimmed(3), once, AT);
    expect(fillLinked(trimmed(3), grown, AT)).toEqual(grown);
  });
  it('a sheet without a link, without a board, or with a board not in the project is returned as it is', () => {
    const plain = sheet({ A1: 'x' });
    expect(fillLinked(project, plain)).toBe(plain);
    const noBoard = { ...layout(), link: { ...layout().link!, boardId: undefined } };
    expect(fillLinked(project, noBoard)).toBe(noBoard);
    const gone = linkToBoard(layout(), 'DB-NOPE');
    expect(fillLinked(project, gone)).toBe(gone);
  });
  it('linkToBoard sets the board; on another board the block keeps its size and loses its keys, and the fill leaves no old row', () => {
    const s = fillLinked(project, sums(), AT);
    expect(linkToBoard(s, 'DB-GF1').link!.rows).toEqual(s.link!.rows);
    expect(linkToBoard(s, 'DB-X').link).toMatchObject({ boardId: 'DB-X', rows: Array<string>(N).fill('') });
    const other = project.boards.find((b) => b.id !== 'DB-GF1' && scheduleRowKeys(project, b.id).length !== N)!;
    const typed = withCells(s, { C5: 'old board note' });
    const moved = fillLinked(project, linkToBoard(typed, other.id), AT), n = Math.max(1, scheduleRowKeys(project, other.id).length);
    expect(moved.cells.A2).toBe(`DB: ${other.id}`);
    expect(moved.link!.rows).toEqual(scheduleRowKeys(project, other.id));
    expect(moved.cells[`E${5 + n}`]).toBe(`=SUM(E5:E${4 + n})`);
    expect(moved.cells[`A${7 + n}`]).toBe('End');
    expect(moved.cells.C5).toBeUndefined();
    const plain = sheet({});
    expect(linkToBoard(plain, 'DB-GF1')).toBe(plain);
  });
});
