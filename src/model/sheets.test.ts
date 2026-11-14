import { describe, expect, it } from 'vitest';
import { evaluateSheet } from '../calc/sheetFormula';
import { adjustFormula, allBordered, allStyled, area, areaCells, deleteCols, deleteRows, edgesOf, fillDownEdits, insertCols, insertRows, masterOf, mergeArea, mergeAt, newSheet, pasteEdits, rawRows, sheetNameError, shown, shownRows, sumFormula, unmergeArea, withCells, withNextWidth, withStyle, type Sheet } from './sheets';

const sheet = (cells: Record<string, string>): Sheet => withCells(newSheet(), cells);
const schedule = sheet({ A1: 'Ckt', F1: 'Load (W)', G1: 'Qty', H1: 'Total (kW)', A2: 'L1', F2: '60', G2: '20', H2: '=F2*G2/1000', A3: 'L2', F3: '40', G3: '15', H3: '=F3*G3/1000', A4: 'P1', F4: '200', G4: '8', H4: '=F4*G4/1000', H5: '=SUM(H2:H4)' });
const val = (s: Sheet, k: string) => evaluateSheet(s.cells)[k]?.value;

describe('sheets — a sheet and its cells', () => {
  it('new sheets get the next free name and id', () => {
    const a = newSheet(), b = newSheet([a]), c = newSheet([a, { ...b, name: 'Sheet 3' }]);
    expect([a.name, a.id, b.name, b.id, c.name, c.id]).toEqual(['Sheet 1', 'S1', 'Sheet 2', 'S2', 'Sheet 4', 'S3']);
    expect(newSheet([a], ' Loads ').name).toBe('Loads');
  });

  it('sheet names: needed, 31 characters, Excel\'s characters, not twice', () => {
    const a = newSheet();
    expect(sheetNameError(' ', [])).toBeDefined();
    expect(sheetNameError('x'.repeat(32), [])).toBeDefined();
    expect(sheetNameError('a/b', [])).toBeDefined();
    expect(sheetNameError('sheet 1', [a])).toBeDefined();
    expect(sheetNameError('Load schedule', [a])).toBeUndefined();
  });

  it('setting and clearing cells; the sheet grows to hold a far cell', () => {
    const s = withCells(newSheet(), { a1: '5', $B$2: '=A1*2', A3: '' });
    expect(s.cells).toEqual({ A1: '5', B2: '=A1*2' });
    expect(withCells(s, { A1: '' }).cells).toEqual({ B2: '=A1*2' });
    expect(withCells(newSheet(), { C90: 'x' }).rows).toBe(90);
    expect(withCells(newSheet(), { A3000: 'x', nonsense: 'y' }).cells).toEqual({});
  });

  it('areas', () => {
    expect(area({ r: 4, c: 3 }, { r: 2, c: 1 })).toEqual({ r0: 2, c0: 1, r1: 4, c1: 3 });
    expect(areaCells({ r0: 1, c0: 1, r1: 2, c1: 2 })).toEqual(['A1', 'B1', 'A2', 'B2']);
  });
});

describe('sheets — styles and widths', () => {
  it('a style is set on the whole area and removed when turned off', () => {
    const a = { r0: 1, c0: 1, r1: 1, c1: 2 };
    const s = withStyle(schedule, a, { bold: true });
    expect(s.styles).toEqual({ A1: { bold: true }, B1: { bold: true } });
    expect(allStyled(s, a, 'bold')).toBe(true);
    expect(allStyled(s, { ...a, c1: 3 }, 'bold')).toBe(false);
    expect(withStyle(s, a, { bold: undefined }).styles).toEqual({});
    expect(withStyle(s, a, { align: 'right' }).styles!.A1).toEqual({ bold: true, align: 'right' });
  });

  it('column width steps up and wraps round', () => {
    const a = { r0: 1, c0: 2, r1: 1, c1: 3 };
    let s = withNextWidth(schedule, a);
    expect(s.widths).toEqual({ B: 140, C: 140 });
    s = withNextWidth(withNextWidth(s, a), a);
    expect(s.widths!.B).toBe(280);
    expect(withNextWidth(s, a).widths!.B).toBe(64);
  });
});

describe('sheets — inserting and deleting rows and columns', () => {
  it('insert a row: cells move down and formulas follow, the total still adds every line', () => {
    const s = insertRows(schedule, 3);
    expect(s.cells.A3).toBeUndefined();
    expect(s.cells.H4).toBe('=F4*G4/1000');
    expect(s.cells.H6).toBe('=SUM(H2:H5)');
    expect(val(s, 'H6')).toBe(val(schedule, 'H5'));
    expect(s.rows).toBe(schedule.rows + 1);
  });

  it('delete a row: the total loses that line; a formula that pointed at it is #REF!', () => {
    const s = deleteRows(schedule, 3);
    expect(s.cells.H4).toBe('=SUM(H2:H3)');
    expect(val(s, 'H4')).toBe(2.8);
    const t = deleteRows(sheet({ A1: '1', A2: '2', B5: '=A2*2', B6: '=A1+1' }), 2);
    expect(t.cells.B4).toBe('=#REF!*2');
    expect(evaluateSheet(t.cells).B4.error).toBe('#REF!');
    expect(t.cells.B5).toBe('=A1+1');
  });

  it('insert and delete a column', () => {
    const s = insertCols(schedule, 7);
    expect(s.cells.I2).toBe('=F2*H2/1000');
    expect(s.cells.H2).toBe('20');
    expect(val(s, 'I5')).toBe(val(schedule, 'H5'));
    const d = deleteCols(schedule, 2, 4); // B to E
    expect(d.cells.D2).toBe('=B2*C2/1000');
    expect(val(d, 'D5')).toBe(val(schedule, 'H5'));
    expect(d.cols).toBe(schedule.cols - 4);
  });

  it('styles and widths move with their cells', () => {
    const s = withNextWidth(withStyle(schedule, { r0: 2, c0: 8, r1: 2, c1: 8 }, { bold: true }), { r0: 1, c0: 8, r1: 1, c1: 8 });
    expect(insertRows(s, 1).styles).toEqual({ H3: { bold: true } });
    expect(insertCols(s, 1).widths).toEqual({ I: 140 });
    expect(deleteCols(s, 8).widths).toEqual({});
  });

  it('references in a formula: before the change stay, $ ones move too, text and function names are left', () => {
    expect(adjustFormula('=A1+A5', 'row', 3, 2)).toBe('=A1+A7');
    expect(adjustFormula('=$A$5', 'row', 3, 1)).toBe('=$A$6');
    expect(adjustFormula('=IF(A5>0,"A5",LOG10(A5))', 'row', 3, 1)).toBe('=IF(A6>0,"A5",LOG10(A6))');
    expect(adjustFormula('=B2', 'col', 2, 1)).toBe('=C2');
    expect(adjustFormula('A5 is text', 'row', 1, 1)).toBe('A5 is text');
  });

  it('ranges: shrink when part is deleted, #REF! when all of it is, grow when a row is put inside', () => {
    expect(adjustFormula('=SUM(A2:A6)', 'row', 4, 1)).toBe('=SUM(A2:A7)');
    expect(adjustFormula('=SUM(A2:A6)', 'row', 2, -1)).toBe('=SUM(A2:A5)');
    expect(adjustFormula('=SUM(A2:A6)', 'row', 6, -1)).toBe('=SUM(A2:A5)');
    expect(adjustFormula('=SUM(A2:A6)', 'row', 5, -4)).toBe('=SUM(A2:A4)');
    expect(adjustFormula('=SUM(A2:A6)', 'row', 2, -5)).toBe('=SUM(#REF!)');
    expect(adjustFormula('=SUM(A2:A6)', 'row', 8, -1)).toBe('=SUM(A2:A6)');
    expect(adjustFormula('=SUM(A2:A6)', 'row', 1, -1)).toBe('=SUM(A1:A5)');
    expect(adjustFormula('=SUM(B2:D2)', 'col', 3, -1)).toBe('=SUM(B2:C2)');
  });
});

describe('sheets — copy, paste, fill and sum', () => {
  const a = { r0: 2, c0: 6, r1: 2, c1: 8 };
  it('copies what was typed and what is shown', () => {
    expect(rawRows(schedule, a)).toEqual([['60', '20', '=F2*G2/1000']]);
    expect(shownRows(schedule, a)).toEqual([['60', '20', '1.2']]);
  });

  it('paste within the sheet: formulas follow the move', () => {
    const edits = pasteEdits(rawRows(schedule, a), { r0: 6, c0: 6, r1: 6, c1: 6 }, { r: 2, c: 6 });
    expect(edits).toEqual({ F6: '60', G6: '20', H6: '=F6*G6/1000' });
  });

  it('paste from elsewhere: as typed', () => {
    expect(pasteEdits([['1', '2'], ['3']], { r0: 1, c0: 1, r1: 1, c1: 1 })).toEqual({ A1: '1', B1: '2', A2: '3', B2: '' });
    expect(pasteEdits([], { r0: 1, c0: 1, r1: 1, c1: 1 })).toEqual({});
  });

  it('one copied cell fills a larger selection', () => {
    expect(pasteEdits([['=F2*2']], { r0: 3, c0: 9, r1: 4, c1: 9 }, { r: 2, c: 9 })).toEqual({ I3: '=F3*2', I4: '=F4*2' });
  });

  it('fill down', () => {
    const s = sheet({ F2: '60', G2: '20', H2: '=F2*G2/1000', F3: '40', G3: '15' });
    expect(fillDownEdits(s, { r0: 2, c0: 8, r1: 4, c1: 8 })).toEqual({ H3: '=F3*G3/1000', H4: '=F4*G4/1000' });
  });

  it('Sum: the run of numbers above, else to the left, else nothing', () => {
    expect(sumFormula(schedule, 5, 8)).toBe('=SUM(H2:H4)');
    expect(sumFormula(schedule, 2, 8)).toBe('=SUM(F2:G2)');
    expect(sumFormula(schedule, 9, 2)).toBeUndefined();
  });
});

describe('sheets — how a cell is shown', () => {
  it('numbers, formats, text, errors', () => {
    expect(shown({ value: 1.5 })).toBe('1.5');
    expect(shown({ value: 1 / 3 })).toBe('0.3333333333');
    expect(shown({ value: 1234.5 }, 'dec2')).toBe('1,234.50');
    expect(shown({ value: 0.8 }, 'percent')).toBe('80%');
    expect(shown({ value: 'MDB-1' }, 'dec2')).toBe('MDB-1');
    expect(shown({ value: true })).toBe('TRUE');
    expect(shown({ value: null, error: '#DIV/0!' })).toBe('#DIV/0!');
    expect(shown(undefined)).toBe('');
  });
});

describe('sheets — merged areas', () => {
  const a = (r0: number, c0: number, r1: number, c1: number) => ({ r0, c0, r1, c1 });
  it('merging keeps the first typed value in reading order, clears the rest and leaves styles', () => {
    const s = withStyle(sheet({ A1: '', B1: ' ', C1: 'x', A2: 'y', D1: 'out' }), a(2, 1, 2, 1), { bold: true });
    const m = mergeArea(s, a(1, 1, 2, 3));
    expect(m.cells).toEqual({ A1: 'x', D1: 'out' });
    expect(m.merges).toEqual([a(1, 1, 2, 3)]);
    expect(m.styles).toEqual({ A2: { bold: true } });
    expect(mergeArea(s, a(1, 1, 1, 1))).toBe(s);
  });

  it('merging takes in every merged area it touches; kept entries of cleared cells go', () => {
    const base = { ...sheet({ B2: 'one', E5: 'two' }), kept: { E5: { f: '=NOPE(1)', v: 3 } } };
    const s = mergeArea(mergeArea(base, a(2, 2, 3, 3)), a(5, 5, 6, 6));
    expect(s.merges).toHaveLength(2);
    const g = mergeArea(s, a(3, 3, 5, 5)); // touches both: grows over them
    expect(g.merges).toEqual([a(2, 2, 6, 6)]);
    expect(g.cells).toEqual({ B2: 'one' });
    expect(g.kept).toEqual({});
  });

  it('unmerging takes apart every area the selection touches', () => {
    const s = mergeArea(mergeArea(sheet({}), a(1, 1, 1, 2)), a(3, 1, 3, 2));
    expect(unmergeArea(s, a(1, 2, 2, 2)).merges).toEqual([a(3, 1, 3, 2)]);
    expect(unmergeArea(s, a(1, 1, 3, 2)).merges).toBeUndefined();
    expect(unmergeArea(s, a(5, 5, 5, 5))).toBe(s);
  });

  it('mergeAt and masterOf find the area of a cell', () => {
    const s = mergeArea(sheet({}), a(2, 2, 3, 4));
    expect(mergeAt(s, 3, 4)).toEqual(a(2, 2, 3, 4));
    expect(mergeAt(s, 4, 4)).toBeUndefined();
    expect(masterOf(s, 3, 4)).toEqual({ r: 2, c: 2 });
    expect(masterOf(s, 5, 5)).toEqual({ r: 5, c: 5 });
  });

  it('an edit to a covered cell is dropped, the first cell can be edited', () => {
    const s = mergeArea(sheet({ B2: 'v' }), a(2, 2, 3, 3));
    expect(withCells(s, { C3: 'no', B2: 'new' }).cells).toEqual({ B2: 'new' });
    expect(withCells(s, { C3: '' }).cells).toEqual({ B2: 'v' });
  });

  it('inserting rows or columns moves, grows or leaves an area', () => {
    const s = mergeArea(sheet({}), a(3, 2, 5, 4));
    expect(insertRows(s, 1, 2).merges).toEqual([a(5, 2, 7, 4)]);
    expect(insertRows(s, 4, 1).merges).toEqual([a(3, 2, 6, 4)]);
    expect(insertRows(s, 3, 1).merges).toEqual([a(4, 2, 6, 4)]);
    expect(insertRows(s, 6, 1).merges).toEqual([a(3, 2, 5, 4)]);
    expect(insertCols(s, 3, 2).merges).toEqual([a(3, 2, 5, 6)]);
    expect(insertCols(s, 1, 1).merges).toEqual([a(3, 3, 5, 5)]);
  });

  it('deleting rows or columns moves, cuts or removes an area', () => {
    const s = mergeArea(sheet({}), a(3, 2, 5, 4));
    expect(deleteRows(s, 1, 2).merges).toEqual([a(1, 2, 3, 4)]);
    expect(deleteRows(s, 4, 1).merges).toEqual([a(3, 2, 4, 4)]);
    expect(deleteRows(s, 2, 2).merges).toEqual([a(2, 2, 3, 4)]); // rows 2-3: the top row goes
    expect(deleteRows(s, 5, 1).merges).toEqual([a(3, 2, 4, 4)]);
    expect(deleteRows(s, 8, 1).merges).toEqual([a(3, 2, 5, 4)]);
    expect(deleteRows(s, 3, 3).merges).toBeUndefined();
    expect(deleteCols(s, 3, 2).merges).toEqual([a(3, 2, 5, 2)]);
    expect(deleteCols(s, 2, 2).merges).toEqual([a(3, 2, 5, 2)]);
    expect(deleteCols(s, 2, 3).merges).toBeUndefined();
    expect(deleteRows(mergeArea(sheet({}), a(3, 2, 3, 4)), 3, 1).merges).toBeUndefined();
    expect(deleteCols(mergeArea(sheet({}), a(3, 2, 4, 3)), 3, 1).merges).toEqual([a(3, 2, 4, 2)]); // one column of two rows is still 2 cells
  });
});

describe('sheets — borders', () => {
  const a = (r0: number, c0: number, r1: number, c1: number) => ({ r0, c0, r1, c1 });
  const put = (s: Sheet, k: string, border: string) => ({ ...s, styles: { ...(s.styles ?? {}), [k]: { ...(s.styles?.[k] ?? {}), border } } });
  it('withStyle sets and clears a border; an empty one is removed', () => {
    const s = withStyle(schedule, a(1, 1, 1, 2), { border: 'trbl' });
    expect(s.styles).toEqual({ A1: { border: 'trbl' }, B1: { border: 'trbl' } });
    expect(allBordered(s, a(1, 1, 1, 2))).toBe(true);
    expect(allBordered(s, a(1, 1, 1, 3))).toBe(false);
    expect(allBordered(put(s, 'B1', 'tRb'), a(1, 2, 1, 2))).toBe(false);
    expect(allBordered(put(s, 'B1', 'TRBL'), a(1, 2, 1, 2))).toBe(true);
    expect(withStyle(s, a(1, 1, 1, 2), { border: undefined }).styles).toEqual({});
    expect(withStyle(s, a(1, 1, 1, 1), { border: '' }).styles).toEqual({ B1: { border: 'trbl' } });
  });

  it('a side shows the cell\'s own line or the facing line of its neighbour, the thicker one', () => {
    let s = put(newSheet(), 'B2', 'tB');
    expect(edgesOf(s, 2, 2)).toEqual({ t: 1, r: 0, b: 2, l: 0 });
    expect(edgesOf(s, 3, 2)).toEqual({ t: 2, r: 0, b: 0, l: 0 }); // below: B2's bottom
    expect(edgesOf(s, 1, 2)).toEqual({ t: 0, r: 0, b: 1, l: 0 }); // above: B2's top
    s = put(put(s, 'A2', 'r'), 'C2', 'L');
    expect(edgesOf(s, 2, 2)).toEqual({ t: 1, r: 2, b: 2, l: 1 }); // thick beats thin
    expect(edgesOf(newSheet(), 1, 1)).toEqual({ t: 0, r: 0, b: 0, l: 0 });
  });

  it('a merged area shows its outline on the first cell and reads the neighbours beside it', () => {
    let s = mergeArea(put(newSheet(), 'B2', 'tbRL'), a(2, 2, 3, 3));
    s = put(put(put(s, 'D2', 'l'), 'B4', 'T'), 'B1', 'b');
    expect(edgesOf(s, 2, 2)).toEqual({ t: 1, r: 2, b: 2, l: 2 });
    expect(edgesOf(s, 3, 3)).toEqual(edgesOf(s, 2, 2));
    const t = mergeArea(put(newSheet(), 'A1', 'trbl'), a(1, 1, 2, 2)); // a neighbour in an area is read through its first cell
    expect(edgesOf(put(t, 'C1', 'l'), 1, 3)).toEqual({ t: 0, r: 0, b: 0, l: 1 });
    expect(edgesOf(t, 3, 2).t).toBe(1); // below the area: the area's bottom, read through its first cell
  });
});
