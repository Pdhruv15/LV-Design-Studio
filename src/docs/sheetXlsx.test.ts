import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { newSheet, sheetValues, withCells, withStyle, type Sheet } from '../model/sheets';
import { buildXlsx, readXlsx, reportText } from './sheetXlsx';

/** An office load schedule as Excel would save it. */
async function officeFile(): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('DB-GF-01');
  ws.addRow(['Ckt', 'Description', 'Ph', 'MCB (A)', 'Cable', 'Load (W)', 'Qty', 'Total (kW)', 'DF', 'Demand (kW)', 'Remarks']);
  ws.getRow(1).font = { bold: true };
  ws.addRow(['L1', 'Lighting – office', 'R', 10, '3C 2.5', 60, 20, { formula: 'F2*G2/1000', result: 1.2 }, 1, { formula: 'H2*I2', result: 1.2 }, '']);
  ws.addRow(['P1', 'Sockets – office', 'B', 20, '3C 4', 200, 8, { formula: 'F3*G3/1000', result: 1.6 }, 0.5, { formula: 'H3*I3', result: 0.8 }, 'On RCD']);
  ws.addRow(['A2', 'Split AC', 'RYB', 32, '5C 6', 5200, 1, { formula: 'F4*G4/1000', result: 5.2 }, 0.8, { formula: 'H4*I4', result: 4.16 }, '']);
  ws.addRow(['', 'Total', '', '', '', '', '', { formula: 'SUM(H2:H4)', result: 8 }, '', { formula: 'SUM(J2:J4)', result: 6.16 }, '']);
  ws.getCell('B5').font = { bold: true, italic: true };
  ws.getCell('I2').numFmt = '0%';
  ws.getCell('J5').numFmt = '0.00';
  ws.getCell('C1').alignment = { horizontal: 'center', wrapText: true };
  ws.getCell('H5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
  ws.getColumn(2).width = 28;
  ws.getCell('A8').value = '0105';
  ws.getCell('A9').value = '=text, not a formula';
  ws.getCell('A10').value = new Date(Date.UTC(2026, 10, 13));
  ws.getCell('A11').value = { richText: [{ text: 'Rich ' }, { text: 'text', font: { bold: true } }] };
  ws.getCell('A12').value = true;
  ws.getCell('B8').value = { formula: 'XLOOKUP(A2,A2:A4,H2:H4)', result: 1.2 };
  ws.getCell('B9').value = { formula: 'Rates!B2*2', result: 14 };
  ws.getCell('B10').value = { formula: 'B8+B9', result: 15.2 };
  ws.getCell('B11').value = { formula: 'IF(A12,"yes!","no")', result: 'yes!' };
  ws.mergeCells('D8:F8');
  ws.getCell('D8').value = 'Merged heading';
  wb.addWorksheet('Rates').getCell('B2').value = 7;
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

describe('Sheets — opening an Excel file', () => {
  it('keeps values, formulas, the styles the app has, widths and sheet names', async () => {
    const { sheets } = await readXlsx(await officeFile(), 'Load schedule.xlsx');
    const s = sheets[0];
    expect(sheets.map((x) => x.name)).toEqual(['DB-GF-01', 'Rates']);
    expect(s.source).toBe('Load schedule.xlsx');
    expect(s.cells.A1).toBe('Ckt');
    expect(s.cells.F2).toBe('60');
    expect(s.cells.H2).toBe('=F2*G2/1000');
    expect(s.cells.H5).toBe('=SUM(H2:H4)');
    expect(s.cells.K2).toBeUndefined();
    expect(s.styles!.A1).toEqual({ bold: true });
    expect(s.styles!.B5).toEqual({ bold: true, italic: true });
    expect(s.styles!.I2).toEqual({ fmt: 'percent' });
    expect(s.styles!.J5).toEqual({ fmt: 'dec2' });
    expect(s.styles!.C1).toEqual({ bold: true, align: 'center', wrap: true });
    expect(s.styles!.H5).toEqual({ fill: true });
    expect(s.widths).toEqual({ B: 201 });
    expect(s.rows).toBeGreaterThanOrEqual(40);
  });

  it('works the formulas out itself: the same totals as the file', async () => {
    const s = (await readXlsx(await officeFile(), 'f.xlsx')).sheets[0], v = sheetValues(s);
    expect([v.H2.value, v.J3.value, v.H5.value, v.J5.value]).toEqual([1.2, 0.8, 8, 6.16]);
  });

  it('text that looks like a number or a formula stays text; dates, rich text and TRUE come through', async () => {
    const s = (await readXlsx(await officeFile(), 'f.xlsx')).sheets[0], v = sheetValues(s);
    expect(s.cells.A8).toBe("'0105");
    expect(v.A8.value).toBe('0105');
    expect(v.A9.value).toBe('=text, not a formula');
    expect(v.A10.value).toBe('2026-11-13');
    expect(v.A11.value).toBe('Rich text');
    expect(v.A12.value).toBe(true);
    expect(v.B11.value).toBe('yes!');
  });

  it('a formula the app cannot work out keeps the file\'s value, is marked, and the cells using it still work', async () => {
    const { sheets, report } = await readXlsx(await officeFile(), 'f.xlsx');
    const s = sheets[0], v = sheetValues(s);
    expect(s.cells.B8).toBe('=XLOOKUP(A2,A2:A4,H2:H4)');
    expect(v.B8).toEqual({ value: 1.2, unsupported: true });
    expect(v.B9).toEqual({ value: 14, unsupported: true });
    expect(v.B10).toEqual({ value: 15.2 });
    expect(Object.keys(s.kept!).sort()).toEqual(['B8', 'B9']);
    expect(report).toMatchObject({ sheets: 2, formulas: 12, keptFormulas: 2, keptBecause: ['XLOOKUP', 'another sheet'], mergedAreas: 1, cut: [] });
    expect(s.merges).toEqual([{ r0: 8, c0: 4, r1: 8, c1: 6 }]);
    expect(reportText('f.xlsx', report)).toBe("Opened f.xlsx: 2 sheets, 56 cells, 12 formulas · 2 kept with the file's value (XLOOKUP; another sheet) · 1 merged area.");
  });

  it('once the engineer retypes such a cell, the file\'s old value is no longer used', async () => {
    const s = (await readXlsx(await officeFile(), 'f.xlsx')).sheets[0];
    expect(sheetValues(withCells(s, { B8: '=NOPE(1)' })).B8).toEqual({ value: null, error: '#NAME?', unsupported: true });
    expect(sheetValues(withCells(s, { B8: '=1+1' })).B8).toEqual({ value: 2 });
  });

  it('a merged area is kept: the value in its first cell, none in the others', async () => {
    const s = (await readXlsx(await officeFile(), 'f.xlsx')).sheets[0];
    expect(s.cells.D8).toBe('Merged heading');
    expect(s.cells.E8).toBeUndefined();
    expect(s.merges).toEqual([{ r0: 8, c0: 4, r1: 8, c1: 6 }]);
    expect(reportText('f.xlsx', { sheets: 1, cells: 2, formulas: 0, keptFormulas: 0, keptBecause: [], mergedAreas: 2, cut: [] })).toBe('Opened f.xlsx: 1 sheet, 2 cells, 0 formulas · 2 merged areas.');
  });

  it('borders are read: thin, thick, on a cell with no value, and on a row that has only empty cells', async () => {
    const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Form');
    ws.getCell('A1').value = 'Name';
    ws.getCell('A1').border = { top: { style: 'thin' }, left: { style: 'hair' }, bottom: { style: 'medium' } };
    ws.getCell('B1').border = { bottom: { style: 'double', color: { argb: 'FFFF0000' } }, right: { style: 'dashed' } }; // no value
    ws.getCell('B4').border = { top: { style: 'thick' } }; // a row of only empty cells
    ws.getCell('C4').border = { top: { style: 'mediumDashed' }, bottom: { style: 'dotted' } };
    ws.getCell('D6').font = { name: 'Arial' }; // styled, but nothing the app keeps
    const { sheets, report } = await readXlsx((await wb.xlsx.writeBuffer()) as ArrayBuffer, 'form.xlsx');
    const s = sheets[0];
    expect(s.styles).toEqual({ A1: { border: 'tBl' }, B1: { border: 'rB' }, B4: { border: 'T' }, C4: { border: 'Tb' } });
    expect(s.cells).toEqual({ A1: 'Name' });
    expect(report.cells).toBe(1);
    expect(s.rows).toBeGreaterThanOrEqual(40);
  });

  it('a merged area takes its outline from its corner cells, and the other cells keep nothing', async () => {
    const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Form');
    ws.getCell('B2').value = 'Title';
    ws.mergeCellsWithoutStyle('B2:D3');
    ws.getCell('B2').border = { top: { style: 'thin' }, left: { style: 'medium' } };
    ws.getCell('D2').border = { right: { style: 'medium' }, top: { style: 'thin' } };
    ws.getCell('B3').border = { bottom: { style: 'thin' } };
    ws.getCell('C3').border = { bottom: { style: 'thick' } };
    const s = (await readXlsx((await wb.xlsx.writeBuffer()) as ArrayBuffer, 'form.xlsx')).sheets[0];
    expect(s.merges).toEqual([{ r0: 2, c0: 2, r1: 3, c1: 4 }]);
    expect(s.styles).toEqual({ B2: { border: 'tRbL' } });
    expect(s.cells).toEqual({ B2: 'Title' });
  });

  it('a merged area beyond the limits is dropped, one that crosses them is cut, a single cell is not an area', async () => {
    const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Big');
    ws.getCell('A1').value = 'x';
    ws.mergeCells('A1:B1');
    ws.mergeCells(1999, 59, 2005, 65);
    ws.mergeCells(2001, 1, 2002, 2);
    ws.mergeCells(5, 60, 5, 62);
    ws.mergeCells(10, 61, 11, 62);
    const { sheets, report } = await readXlsx((await wb.xlsx.writeBuffer()) as ArrayBuffer, 'big.xlsx');
    expect(sheets[0].merges).toEqual([{ r0: 1, c0: 1, r1: 1, c1: 2 }, { r0: 1999, c0: 59, r1: 2000, c1: 60 }]);
    expect(report.mergedAreas).toBe(2);
    expect(sheets[0].rows).toBeGreaterThanOrEqual(2000);
    expect(sheets[0].cols).toBeGreaterThanOrEqual(60);
  });

  it('sheets opened into a book get ids and names of their own', async () => {
    const mine: Sheet = { ...newSheet(), name: 'DB-GF-01' };
    const { sheets } = await readXlsx(await officeFile(), 'f.xlsx', [mine]);
    expect(sheets.map((x) => x.name)).toEqual(['DB-GF-01 (2)', 'Rates']);
    expect(new Set([mine.id, ...sheets.map((x) => x.id)]).size).toBe(3);
  });

  it('shared formulas (Excel\'s fill down) are read cell by cell', async () => {
    const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('S');
    ws.getCell('A1').value = 2; ws.getCell('A2').value = 3; ws.getCell('A3').value = 4;
    ws.fillFormula('B1:B3', 'A1*10', [20, 30, 40]);
    const s = (await readXlsx((await wb.xlsx.writeBuffer()) as ArrayBuffer, 'f.xlsx')).sheets[0];
    expect([s.cells.B1, s.cells.B2, s.cells.B3]).toEqual(['=A1*10', '=A2*10', '=A3*10']);
  });
});

describe('Sheets — saving an Excel file', () => {
  it('writes formulas with the app\'s results, styles and widths, and reads back the same sheet', async () => {
    let s = withCells({ ...newSheet(), name: 'Loads' }, { A1: 'Ckt', B1: 'kW', A2: 'L1', B2: '1.2', A3: 'P1', B3: '1.6', B4: '=SUM(B2:B3)', C4: '=B4/0', A5: "'0105", A6: 'TRUE' });
    s = withStyle(s, { r0: 1, c0: 1, r1: 1, c1: 2 }, { bold: true });
    s = withStyle(s, { r0: 4, c0: 2, r1: 4, c1: 2 }, { fmt: 'dec2', fill: true, align: 'right' });
    s = { ...s, widths: { A: 140 } };
    const ws = buildXlsx([s]).getWorksheet('Loads')!;
    expect(ws.getCell('B2').value).toBe(1.2);
    expect(ws.getCell('B4').value).toEqual({ formula: 'SUM(B2:B3)', result: 2.8 });
    expect(ws.getCell('C4').value).toEqual({ formula: 'B4/0', result: { error: '#DIV/0!' } });
    expect(ws.getCell('A5').value).toBe('0105');
    expect(ws.getCell('A6').value).toBe(true);
    expect(ws.getCell('A1').font).toEqual({ bold: true });
    expect(ws.getCell('B4').numFmt).toBe('#,##0.00');
    expect(ws.getColumn(1).width).toBe(19.29);
    const back = (await readXlsx((await buildXlsx([s]).xlsx.writeBuffer()) as ArrayBuffer, 'out.xlsx')).sheets[0];
    expect(back.cells).toEqual(s.cells);
    expect(back.styles).toEqual(s.styles);
    expect(back.widths).toEqual(s.widths);
    expect(back.name).toBe('Loads');
  });

  it('merged areas and borders go out and come back: the outline on the first cell, a lone border on an empty cell', async () => {
    let s = withCells({ ...newSheet(), name: 'Form' }, { A1: 'Title', B5: 'x' });
    s = withStyle(s, { r0: 1, c0: 1, r1: 1, c1: 1 }, { border: 'trbl', bold: true });
    s = withStyle(s, { r0: 5, c0: 2, r1: 5, c1: 2 }, { border: 'tBl' });
    s = withStyle(s, { r0: 7, c0: 3, r1: 7, c1: 3 }, { border: 'b' }); // an empty cell
    s = withStyle(s, { r0: 9, c0: 1, r1: 9, c1: 1 }, { border: 'TRBL' });
    s = { ...s, merges: [{ r0: 1, c0: 1, r1: 2, c1: 3 }, { r0: 9, c0: 1, r1: 10, c1: 2 }] };
    const wb = buildXlsx([s]), ws = wb.getWorksheet('Form')!;
    expect(ws.getCell('A1').border).toEqual({ top: { style: 'thin' }, right: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' } });
    expect(ws.getCell('B5').border).toEqual({ top: { style: 'thin' }, bottom: { style: 'medium' }, left: { style: 'thin' } });
    const back = (await readXlsx((await wb.xlsx.writeBuffer()) as ArrayBuffer, 'out.xlsx')).sheets[0];
    expect(back.merges).toEqual(s.merges);
    expect(back.styles).toEqual({ A1: { bold: true, border: 'trbl' }, B5: { border: 'tBl' }, C7: { border: 'b' }, A9: { border: 'TRBL' } });
    expect(back.cells).toEqual({ A1: 'Title', B5: 'x' });
  });

  it('a formula kept from a file goes back into the saved file unchanged, with its value', async () => {
    const s = (await readXlsx(await officeFile(), 'f.xlsx')).sheets[0];
    const ws = buildXlsx([s]).getWorksheet('DB-GF-01')!;
    expect(ws.getCell('B8').value).toEqual({ formula: 'XLOOKUP(A2,A2:A4,H2:H4)', result: 1.2 });
    expect(ws.getCell('B9').value).toEqual({ formula: 'Rates!B2*2', result: 14 });
    expect(ws.getCell('H5').value).toEqual({ formula: 'SUM(H2:H4)', result: 8 });
  });
});
