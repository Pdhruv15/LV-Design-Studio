import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { withProjectFormat } from '../model/scheduleFormats';
import { area, mergeArea, newSheet, withCells, withPaper, withStyle, type Sheet } from '../model/sheets';
import { scheduleRowKeys } from './scheduleFields';
import { formatSheetOf, formatSheetsOf, headingRows, sheetsHtml } from './sheetPrint';
import { linkToBoard, panelCategoryOf } from './sheetLink';

const at = (r: number, c: number) => ({ r, c });
const cell = (html: string, text: string) => new RegExp(`<td[^>]*>${text}</td>`).exec(html)?.[0] ?? '';

/** A DB layout as an office would draw it: a merged, bordered heading, a grey heading row, one pattern row and a total. */
function dbLayout(): Sheet {
  let s = withCells(newSheet(), { A1: 'Acme Electrical', A3: 'Circuit', B3: 'Description', C3: 'Load W', C5: 'Total', D5: '=SUM(C4:C4)' });
  s = mergeArea(s, area(at(1, 1), at(1, 4)));
  s = withStyle(s, area(at(1, 1), at(1, 4)), { bold: true, align: 'center', border: 'TRBL' });
  s = withStyle(s, area(at(3, 1), at(3, 4)), { bold: true, fill: true, border: 'trbl' });
  s = withStyle(s, area(at(4, 1), at(4, 4)), { border: 'trbl' });
  return { ...s, widths: { A: 64, B: 200, C: 96, D: 96 }, link: { category: 'db', cells: {}, firstRow: 4, rows: [], columns: { A: 'row.ref', B: 'row.room', C: 'row.watts' } } };
}

describe('sheetsHtml', () => {
  const small = (() => {
    let s = withCells(newSheet(), { A1: 'Head', B2: '12.5', C2: '=B2*2', A3: 'a < b & "c"' });
    s = mergeArea(s, area(at(1, 1), at(2, 1)));
    s = withStyle(s, area(at(1, 1), at(1, 1)), { bold: true, border: 'TRBL' });
    s = withStyle(s, area(at(2, 3), at(2, 3)), { fill: true, align: 'center' });
    s = withStyle(s, area(at(3, 1), at(3, 1)), { italic: true, underline: true });
    return s;
  })();
  const html = sheetsHtml([small], 'Title & co');

  it('prints only the used part, fitted to the page width, black and white, with no header or footer', () => {
    expect(html).toContain('<title>Title &amp; co</title>');
    expect(html).toContain('@page { size: A4 landscape; margin: 10mm; }');
    expect(html).toMatch(/table-layout: fixed; width: 100%; border-collapse: collapse/);
    expect(html.match(/<tr>/g)).toHaveLength(3);
    expect(html.match(/<col /g)).toHaveLength(3);
    expect(html).not.toMatch(/<h1|<header|<footer|<th/);
    expect(html.match(/<col style="width:([\d.]+)%">/g)!.map((c) => +/([\d.]+)/.exec(c)![1]).reduce((a, b) => a + b, 0)).toBeCloseTo(100, 1);
  });
  it('merges a heading with colspan / rowspan and writes no covered cell', () => {
    expect(html).toContain('<td rowspan="2"');
    expect(html.match(/<td/g)).toHaveLength(8); // 3 × 3 cells less the covered A2
    expect(html).not.toContain('colspan');
  });
  it('gives thin and thick borders their own styles and an unbordered cell none', () => {
    const h = sheetsHtml([withStyle(withCells(newSheet(), { A1: 'x', C1: 'z' }), area(at(1, 1), at(1, 1)), { border: 'tB' })], 't');
    expect(cell(h, 'x')).toContain('border-top:0.5pt solid #000');
    expect(cell(h, 'x')).toContain('border-bottom:1.5pt solid #000');
    expect(cell(h, 'z')).not.toContain('border');
    expect(cell(h, 'z')).not.toContain('solid');
  });
  it('prints bold, italic, underline, alignment, a formula\'s value and a grey fill; texts are escaped', () => {
    expect(cell(html, 'Head')).toContain('font-weight:700');
    expect(html).toMatch(/<td style="text-align:right;border-left:1.5pt solid #000">12.5<\/td>/);
    expect(html).toMatch(/<td style="text-align:center;background:#e6e6e6">25<\/td>/);
    expect(cell(html, 'a &lt; b &amp; &quot;c&quot;')).toMatch(/text-align:left;font-style:italic;text-decoration:underline/);
    expect(html).not.toContain('=B2*2');
    expect(html.match(/#[0-9a-f]{3,6}/gi)!.every((c) => ['#000', '#fff', '#e6e6e6'].includes(c))).toBe(true);
  });
  it('puts one page break between two sheets and none after the last', () => {
    const two = sheetsHtml([small, small], 't');
    expect(two.match(/page-break-after:always/g)).toHaveLength(1);
    expect(sheetsHtml([small], 't')).not.toContain('page-break-after:always');
  });
});

describe('the paper of a sheet', () => {
  const plain = withCells(newSheet(), { A1: 'x' });
  const pages = (html: string) => [...html.matchAll(/@page([^{]*)\{ size: ([^;]+); margin: 10mm; \}/g)].map((m) => [m[1].trim(), m[2]]);
  const sections = (html: string) => [...html.matchAll(/<section([^>]*)>/g)].map((m) => /page:([\w-]+)/.exec(m[1])?.[1] ?? '');

  it('is A4 landscape for a sheet that names none, as before', () => {
    const html = sheetsHtml([plain, plain], 't');
    expect(pages(html)).toEqual([['', 'A4 landscape']]);
    expect(sections(html)).toEqual(['', '']);
    expect(sheetsHtml([], 't')).toContain('@page { size: A4 landscape; margin: 10mm; }');
  });
  it('is the sheet\'s own paper: the page of the document, with the same margins', () => {
    expect(pages(sheetsHtml([withPaper(plain, 'A3')], 't'))).toEqual([['', 'A3 landscape']]);
    expect(pages(sheetsHtml([withPaper(plain, 'A4 portrait')], 't'))).toEqual([['', 'A4 portrait']]);
    const html = sheetsHtml([withPaper(plain, 'A3 portrait'), withPaper(plain, 'A3 portrait')], 't');
    expect(pages(html)).toEqual([['', 'A3 portrait']]);
    expect(sections(html)).toEqual(['', '']);
  });
  it('gives each sheet its paper in a PDF of all panels: one page rule per other paper, named on the sheets that use it', () => {
    const html = sheetsHtml([plain, withPaper(plain, 'A3'), plain, withPaper(plain, 'A4 portrait'), withPaper(plain, 'A3')], 't');
    expect(pages(html)).toEqual([['', 'A4 landscape'], ['p-a3', 'A3 landscape'], ['p-a4-portrait', 'A4 portrait']]);
    expect(sections(html)).toEqual(['', 'p-a3', '', 'p-a4-portrait', 'p-a3']);
    expect(html.match(/page-break-after:always/g)).toHaveLength(4);
    const a3First = sheetsHtml([withPaper(plain, 'A3'), plain], 't');
    expect(pages(a3First)).toEqual([['', 'A3 landscape'], ['p-a4', 'A4 landscape']]);
    expect(sections(a3First)).toEqual(['', 'p-a4']);
  });
});

describe('heading rows on every page', () => {
  /** The DB layout with its rows moved down: a title, a row of the panel's values, two heading rows with merged cells, the pattern row 6. */
  const tall = (): Sheet => {
    let s = withCells(newSheet(), { A1: 'Acme Electrical', A3: 'PANEL: ', A4: 'CCT', B4: 'DESCRIPTION', C4: 'LOAD (W)', C5: 'R', D5: 'Y', C7: 'TOTAL' });
    for (const [a, b] of [[at(4, 1), at(5, 1)], [at(4, 2), at(5, 2)], [at(4, 3), at(4, 4)]]) s = mergeArea(s, area(a, b));
    s = withStyle(s, area(at(3, 1), at(7, 4)), { border: 'trbl' });
    return { ...s, link: { category: 'db', firstRow: 6, rows: [], cells: { A3: { field: 'board.id', before: 'PANEL: ' } }, columns: { A: 'row.ref', B: 'row.room', C: 'row.R', D: 'row.Y' } } };
  };
  const relink = (s: Sheet, patch: Partial<NonNullable<Sheet['link']>>): Sheet => ({ ...s, link: { ...s.link!, ...patch } });

  it('are the rows directly above the first circuit row, up to the row that holds a value of the panel', () => {
    expect(headingRows(tall())).toEqual({ top: 4, bottom: 5 });
    expect(headingRows(dbLayout())).toEqual({ top: 3, bottom: 3 }); // the empty row 2 ends them
  });
  it('take a column\'s own heading and watts per unit as headings, and stop at eight rows', () => {
    expect(headingRows(relink(tall(), { cells: { A3: { field: 'label.ltg' } } }))).toEqual({ top: 3, bottom: 5 });
    const many = relink(withCells(tall(), Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`A${i + 1}`, 'x']))), { firstRow: 13, cells: {} });
    expect(headingRows({ ...many, merges: undefined })).toEqual({ top: 5, bottom: 12 });
  });
  it('start under a merged area that comes from above, and are none when one runs into the rows, without a link or with nothing above', () => {
    const from3 = { ...tall(), merges: [{ r0: 3, c0: 1, r1: 4, c1: 1 }] };
    expect(headingRows(from3)).toEqual({ top: 5, bottom: 5 });
    expect(headingRows({ ...tall(), merges: [{ r0: 5, c0: 1, r1: 6, c1: 1 }] })).toBeUndefined();
    const { link: _l, ...bare } = tall();
    expect(headingRows(bare)).toBeUndefined();
    expect(headingRows(relink(tall(), { firstRow: 1 }))).toBeUndefined();
    expect(headingRows(withCells(tall(), { A4: '', B4: '', C4: '', C5: '', D5: '' }))).toEqual({ top: 4, bottom: 5 }); // merged cells still fill the rows
  });
  it('print as the head of the table that holds the rows; the rows above are a table of their own with the same columns', () => {
    const h = sheetsHtml([tall()], 't');
    expect(h.match(/<table>/g)).toHaveLength(2);
    expect(h.match(/<thead>/g)).toHaveLength(1);
    const [above, main] = h.split('</table>');
    expect(above).not.toContain('<thead>');
    expect(above.match(/<tr>/g)).toHaveLength(3);
    expect(/<thead>(.*)<\/thead>/.exec(main)![1].match(/<tr>/g)).toHaveLength(2);
    expect(/<tbody>(.*)<\/tbody>/.exec(main)![1].match(/<tr>/g)).toHaveLength(2);
    expect(/<colgroup>.*?<\/colgroup>/.exec(above)![0]).toBe(/<colgroup>.*?<\/colgroup>/.exec(main)![0]);
    expect(h).toContain('thead { display: table-header-group; break-inside: avoid; }');
  });
  it('draw the line between the two tables once: the heading keeps its top line, the row above gives up its bottom line', () => {
    const h = sheetsHtml([tall()], 't');
    expect(cell(h, 'PANEL: ')).toContain('border-top:0.5pt solid #000');
    expect(cell(h, 'PANEL: ')).not.toContain('border-bottom');
    expect(cell(h, 'CCT')).toContain('border-top:0.5pt solid #000');
    expect(cell(sheetsHtml([{ ...tall(), link: undefined }], 't'), 'PANEL: ')).toContain('border-bottom:0.5pt solid #000');
  });
  it('leave a sheet with no heading rows as one table', () => {
    const h = sheetsHtml([relink(tall(), { firstRow: 1 })], 't');
    expect(h.match(/<table>/g)).toHaveLength(1);
    expect(h).not.toContain('<thead>');
  });
});

describe('formatSheetOf and formatSheetsOf', () => {
  const format = { id: 'f', name: 'Acme DB', category: 'db' as const, sheet: dbLayout(), updatedAt: '2026-11-14' };
  const smdbFormat = { id: 'g', name: 'Acme SMDB', category: 'md' as const, sheet: { ...dbLayout(), link: { ...dbLayout().link!, category: 'md' as const, columns: { A: 'row.sl', B: 'row.name' } } }, updatedAt: '2026-11-14' };

  it('makes a sheet from the project format for the board\'s category, filled from the project, leaving the project unchanged', () => {
    const p = withProjectFormat(sampleProject, 'db', format), before = JSON.stringify(p);
    const s = formatSheetOf(p, 'DB-GF1')!;
    expect(s.link!.boardId).toBe('DB-GF1');
    expect(s.link!.rows).toHaveLength(scheduleRowKeys(p, 'DB-GF1').length);
    expect(s.cells.A4).toBeTruthy();
    expect(JSON.stringify(p)).toBe(before);
    expect(p.sheets).toBeUndefined();
  });
  it('keeps an output-only format output-only while filling the same Excel/PDF layout', () => {
    const output = { ...format, sheet: { ...dbLayout(), link: { ...dbLayout().link!, mode: 'output' as const } } };
    const s = formatSheetOf(withProjectFormat(sampleProject, 'db', output), 'DB-GF1')!;
    expect(s.link!.mode).toBe('output');
    expect(s.cells.A4).toBeTruthy();
    expect(sheetsHtml([s], 'DB output')).toContain(String(s.cells.A4));
  });
  it('uses the book\'s sheet linked to the board, without typed values that were not applied', () => {
    const linked = linkToBoard(dbLayout(), 'DB-GF1');
    const typed = { ...linked, link: { ...linked.link!, pending: { x: { B: 'TYPED' } }, added: [{ B: 'NEW ROW' }] } };
    const p = { ...sampleProject, sheets: { sheets: [typed] } };
    const s = formatSheetOf(p, 'DB-GF1')!;
    expect(s.link!.pending).toBeUndefined();
    expect(s.link!.added).toBeUndefined();
    expect(JSON.stringify(s.cells)).not.toMatch(/TYPED|NEW ROW/);
    expect(s.id).toBe(typed.id);
  });
  it('keeps the paper of the project\'s format, and of the book\'s sheet when the board has one', () => {
    const p = withProjectFormat(sampleProject, 'db', { ...format, sheet: withPaper(dbLayout(), 'A3') });
    expect(formatSheetOf(p, 'DB-GF1')!.paper).toBe('A3');
    const own = { ...p, sheets: { sheets: [withPaper(linkToBoard(dbLayout(), 'DB-GF1'), 'A4 portrait')] } };
    expect(formatSheetOf(own, 'DB-GF1')!.paper).toBe('A4 portrait');
    expect(formatSheetOf(withProjectFormat(sampleProject, 'db', format), 'DB-GF1')).not.toHaveProperty('paper');
  });
  it('is undefined for a board with neither a sheet nor a format', () => {
    expect(formatSheetOf(sampleProject, 'DB-GF1')).toBeUndefined();
    expect(formatSheetOf(withProjectFormat(sampleProject, 'db', format), 'MDB-1')).toBeUndefined();
    expect(formatSheetOf(sampleProject, 'NO-SUCH')).toBeUndefined();
  });
  it('gives every board that has a format, in supply order', () => {
    const p = withProjectFormat(withProjectFormat(sampleProject, 'db', format), 'smdb', smdbFormat);
    const ids = formatSheetsOf(p).map((s) => s.link!.boardId);
    const expected = p.boards.filter((b) => ['db', 'smdb'].includes(panelCategoryOf(p, b) ?? '')).map((b) => b.id);
    expect(ids.length).toBeGreaterThan(2);
    expect([...ids].sort()).toEqual([...expected].sort());
    expect(ids.indexOf('SMDB-GF')).toBeLessThan(ids.indexOf('DB-GF1'));
    expect(formatSheetsOf(sampleProject)).toEqual([]);
    const html = sheetsHtml(formatSheetsOf(p), 'all');
    expect(html.match(/page-break-after:always/g)).toHaveLength(ids.length - 1);
  });
});
