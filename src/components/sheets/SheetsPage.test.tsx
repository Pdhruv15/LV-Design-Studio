// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import SheetsPage from './SheetsPage';

const saved: { name: string; bytes: Uint8Array }[] = [];
const savedText: { name: string; text: string; ext: string }[] = [];
vi.mock('../../util/files', async (orig) => ({
  ...(await orig<typeof import('../../util/files')>()),
  saveBinary: async (name: string, bytes: Uint8Array) => { saved.push({ name, bytes }); return `Saved ${name}`; },
  saveText: async (name: string, text: string, _filter: string, ext: string) => { savedText.push({ name, text, ext }); return `Saved ${name}`; }
}));
import { sampleProject } from '../../data/sampleProject';
import { templateData } from '../../docs/scheduleFields';
import { panelRowKeys } from '../../docs/panelFields';
import { linkBoards } from '../../docs/sheetLink';
import { FORMATS_KEY, loadFormats, saveFormats, scheduleFormatFileText, scheduleFormatFromFileText, withFormat } from '../../model/scheduleFormats';
import { newSheet, withCells } from '../../model/sheets';
import type { Project } from '../../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root, host: HTMLDivElement, last: Project, changes: number;
const status: string[] = [];
const undo = vi.fn();
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); changes = 0; status.length = 0; undo.mockClear(); });
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; });

const render = (p: Project) => { last = p; act(() => root.render(<SheetsPage project={p} onChange={(x) => { changes++; render(x); }} onStatus={(m) => status.push(m)} onUndo={undo} />)); };
const grid = () => document.querySelector<HTMLDivElement>('.shx-wrap')!;
const td = (k: string) => document.querySelector<HTMLTableCellElement>(`[data-cell="${k}"]`)!;
const click = (k: string, shift = false) => act(() => { td(k).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, shiftKey: shift })); });
const gridKey = (k: string, more: KeyboardEventInit = {}) => act(() => { grid().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...more })); });
const tool = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('.shx-ribbon button')].find((b) => (b.getAttribute('aria-label') ?? b.textContent) === label)!;
const press = (label: string) => act(() => tool(label).click());
const cells = () => last.sheets!.sheets[0].cells;
/** Type into the active cell and end with a key. */
const type = (text: string, end = 'Enter') => {
  gridKey(text[0]);
  const input = grid().querySelector('input')!;
  act(() => { input.value = text; });
  act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: end, bubbles: true })); });
};
const book = (c: Record<string, string>): Project => ({ ...sampleProject, sheets: { sheets: [withCells(newSheet(), c)] } });

describe('Sheets page', () => {
  it('starts with one empty sheet and writes nothing until a cell is typed', () => {
    render(sampleProject);
    expect(document.querySelectorAll('.shx-sheets [role="tab"]').length).toBe(1);
    expect(td('A1').className).toContain('shx-act');
    expect(changes).toBe(0);
  });

  it('typing enters a value, Enter moves down, Tab moves right; a formula shows its result', () => {
    render(sampleProject);
    type('750');
    expect(cells()).toEqual({ A1: '750' });
    expect(td('A2').className).toContain('shx-act');
    click('B1');
    type('2', 'Tab');
    expect(td('C1').className).toContain('shx-act');
    type('=A1*B1/1000');
    expect(cells().C1).toBe('=A1*B1/1000');
    expect(td('C1').textContent).toBe('1.5');
    expect(td('C1').className).toContain('shx-fx');
    expect(changes).toBe(3);
  });

  it('Escape leaves the cell as it was; an edit that changes nothing is not a change', () => {
    render(book({ A1: '5' }));
    type('9', 'Escape');
    expect(cells().A1).toBe('5');
    gridKey('F2');
    act(() => { grid().querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    expect(changes).toBe(0);
  });

  it('shows an error in its cell and keeps the rest', () => {
    render(book({ A1: '=1/0', B1: '=A1+1', C1: '7' }));
    expect(td('A1').textContent).toBe('#DIV/0!');
    expect(td('B1').className).toContain('shx-err');
    expect(td('C1').textContent).toBe('7');
  });

  it('the formula bar shows what was typed and edits the cell', () => {
    render(book({ A1: '2', B1: '=A1*3' }));
    click('B1');
    const bar = document.querySelector<HTMLInputElement>('input[aria-label="Formula"]')!;
    expect(bar.value).toBe('=A1*3');
    expect(document.querySelector<HTMLInputElement>('input[aria-label="Cell"]')!.value).toBe('B1');
    act(() => { bar.value = '=A1*4'; bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    expect(cells().B1).toBe('=A1*4');
    expect(td('B1').textContent).toBe('8');
  });

  it('arrows move, Shift extends the selection, Delete clears it', () => {
    render(book({ A1: '1', A2: '2', B1: '3', B2: '4', C1: '5' }));
    gridKey('ArrowDown', { shiftKey: true });
    gridKey('ArrowRight', { shiftKey: true });
    expect(document.querySelector<HTMLInputElement>('input[aria-label="Cell"]')!.value).toBe('A1:B2');
    expect(document.querySelectorAll('td.shx-sel').length).toBe(4);
    gridKey('Delete');
    expect(cells()).toEqual({ C1: '5' });
    expect(changes).toBe(1);
  });

  it('copy and paste inside the sheet moves formulas; fill down too', () => {
    render(book({ F2: '60', G2: '20', H2: '=F2*G2/1000', F3: '40', G3: '15' }));
    click('H2');
    gridKey('c', { ctrlKey: true });
    click('H3');
    const text = '1.2';
    act(() => { const e = new Event('paste', { bubbles: true, cancelable: true }); Object.assign(e, { clipboardData: { getData: () => text } }); grid().dispatchEvent(e); });
    expect(cells().H3).toBe('=F3*G3/1000');
    expect(td('H3').textContent).toBe('0.6');
    click('H3'); click('H5', true);
    press('Fill down');
    expect(cells().H5).toBe('=F5*G5/1000');
  });

  it('text pasted from elsewhere goes in as typed, tab by tab and line by line', () => {
    render(sampleProject);
    act(() => { const e = new Event('paste', { bubbles: true, cancelable: true }); Object.assign(e, { clipboardData: { getData: () => 'L1\t60\nL2\t40\n' } }); grid().dispatchEvent(e); });
    expect(cells()).toEqual({ A1: 'L1', B1: '60', A2: 'L2', B2: '40' });
  });

  it('Home tools: bold, alignment, number format, Sum, insert and delete rows', () => {
    render(book({ A1: '1.5', A2: '2', A3: '0.8' }));
    press('Bold');
    expect(last.sheets!.sheets[0].styles).toEqual({ A1: { bold: true } });
    expect(td('A1').style.fontWeight).toBe('700');
    expect(tool('Bold').getAttribute('aria-pressed')).toBe('true');
    press('Bold');
    expect(last.sheets!.sheets[0].styles).toEqual({});
    press('Align centre');
    expect(td('A1').style.textAlign).toBe('center');
    click('A3'); press('Percent');
    expect(td('A3').textContent).toBe('80%');
    click('A1'); press('Decimals 0.00');
    expect(td('A1').textContent).toBe('1.50');
    click('A4'); press('Sum');
    expect(cells().A4).toBe('=SUM(A1:A3)');
    expect(td('A4').textContent).toBe('4.3');
    click('A2'); press('Insert row');
    expect(cells().A5).toBe('=SUM(A1:A4)');
    press('Delete row');
    expect(cells().A4).toBe('=SUM(A1:A3)');
    press('Undo');
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it('tools of later stages are greyed and say so', () => {
    render(sampleProject);
    for (const label of ['Sort', 'Filter', 'Find', 'Copy format']) expect(tool(label).disabled).toBe(true);
    expect(tool('Sort').title).toBe('Comes in a later stage');
    // Apply to project works now: greyed only while nothing is typed in a linked sheet.
    expect(tool('Apply to project').disabled).toBe(true);
    expect(tool('Apply to project').title).toBe('Apply to project');
    expect([...document.querySelectorAll<HTMLButtonElement>('.shx-tab')].filter((t) => t.disabled).map((t) => t.textContent)).toEqual(['Formulas', 'Data', 'Review']);
  });

  it('Merge cells is greyed for one plain cell; it merges a selection and takes it apart again', () => {
    render(book({ A1: '', B1: 'kept', C1: 'x' }));
    expect(tool('Merge cells').disabled).toBe(true);
    expect(tool('Merge cells').title).toBe('Merge cells');
    click('A1'); click('B1', true);
    expect(tool('Merge cells').disabled).toBe(false);
    press('Merge cells');
    const s = () => last.sheets!.sheets[0];
    expect(s().merges).toEqual([{ r0: 1, c0: 1, r1: 1, c1: 2 }]);
    expect(s().cells).toEqual({ A1: 'kept', C1: 'x' });
    expect(td('A1').colSpan).toBe(2);
    expect(td('B1')).toBeNull();
    expect(td('A1').className).toContain('shx-act');
    expect(td('A1').className).toContain('shx-sel');
    expect(document.querySelector<HTMLInputElement>('input[aria-label="Cell"]')!.value).toBe('A1:B1');
    expect(tool('Merge cells').getAttribute('aria-pressed')).toBe('true');
    expect(changes).toBe(1);
    press('Merge cells');
    expect(s().merges).toBeUndefined();
    expect(td('B1')).not.toBeNull();
    expect(changes).toBe(2);
    click('A1');
    expect(tool('Merge cells').disabled).toBe(true);
  });

  it('a merged area is one cell with row and column spans; arrows leave it past its last cell; typing edits its first cell', () => {
    const p = book({ A1: 'head', A3: 'below', D1: 'right' });
    render({ ...p, sheets: { sheets: [{ ...p.sheets!.sheets[0], merges: [{ r0: 1, c0: 1, r1: 2, c1: 3 }] }] } });
    expect(td('A1').rowSpan).toBe(2);
    expect(td('A1').colSpan).toBe(3);
    for (const k of ['B1', 'C1', 'A2', 'B2', 'C2']) expect(td(k)).toBeNull();
    expect(document.querySelectorAll('tbody tr')[0].querySelectorAll('td').length).toBe(1 + 12 - 3);
    gridKey('ArrowRight');
    expect(td('D1').className).toContain('shx-act');
    gridKey('ArrowLeft');
    expect(td('A1').className).toContain('shx-act');
    gridKey('ArrowDown');
    expect(td('A3').className).toContain('shx-act');
    gridKey('ArrowUp');
    expect(td('A1').className).toContain('shx-act');
    click('A1');
    type('new', 'Tab');
    expect(cells().A1).toBe('new');
    expect(td('D1').className).toContain('shx-act');
    click('A1');
    type('again');
    expect(td('A3').className).toContain('shx-act');
    click('A1');
    gridKey('F2');
    expect(grid().querySelector<HTMLInputElement>('input[aria-label="Edit A1"]')).not.toBeNull();
  });

  it('Borders sets all four sides on the selection and takes them off again, in one undo step each', () => {
    render(book({ A1: '1', B1: '2' }));
    const s = () => last.sheets!.sheets[0];
    expect(tool('Borders').getAttribute('aria-pressed')).toBe('false');
    click('A1'); click('B1', true);
    press('Borders');
    expect(s().styles).toEqual({ A1: { border: 'trbl' }, B1: { border: 'trbl' } });
    expect(td('A1').style.borderTop).toBe('1px solid var(--tx)');
    expect(td('B1').style.borderRight).toBe('1px solid var(--tx)');
    expect(td('C1').style.borderLeft).toBe('1px solid var(--tx)'); // the neighbour shows the same line
    expect(td('A2').style.borderBottom).toBe('');
    expect(tool('Borders').getAttribute('aria-pressed')).toBe('true');
    press('Borders');
    expect(s().styles).toEqual({});
    expect(td('A1').style.borderTop).toBe('');
    expect(changes).toBe(2);
  });

  it('a thick line is drawn 2px; a merged area is outlined from its first cell', () => {
    const p = book({ A1: 'head' });
    render({ ...p, sheets: { sheets: [{ ...p.sheets!.sheets[0], merges: [{ r0: 1, c0: 1, r1: 1, c1: 2 }], styles: { A1: { border: 'TrL' } } }] } });
    expect(td('A1').style.borderTop).toBe('2px solid var(--tx)');
    expect(td('A1').style.borderRight).toBe('1px solid var(--tx)');
    expect(td('A1').style.borderBottom).toBe('');
    expect(td('A1').style.borderLeft).toBe('2px solid var(--tx)');
    expect(td('C1').style.borderLeft).toBe('1px solid var(--tx)');
  });

  it('the sheet tabs stay one row: New sheet sits beside it, and many sheets get a list to jump to one', () => {
    render(book({ A1: 'first' }));
    expect(document.querySelector('.shx-sheets [aria-label="New sheet"]')).toBeNull();
    expect(document.querySelector('.shx-sheetbar > [aria-label="New sheet"]')).not.toBeNull();
    expect(document.querySelector('select[aria-label="Go to sheet"]')).toBeNull();
    const many: Project = { ...sampleProject, sheets: { sheets: Array.from({ length: 12 }, (_, i) => withCells({ ...newSheet(), id: `s${i}`, name: `Board ${i + 1}` }, { A1: `cell ${i + 1}` })) } };
    render(many);
    expect(document.querySelectorAll('.shx-sheets [role="tab"]').length).toBe(12);
    const list = document.querySelector<HTMLSelectElement>('select[aria-label="Go to sheet"]')!;
    expect([...list.options].map((o) => o.textContent)).toEqual(many.sheets!.sheets.map((x) => x.name));
    act(() => { list.value = 's10'; list.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(document.querySelector('.shx-sheets [aria-selected="true"]')!.textContent).toBe('Board 11');
    expect(td('A1').textContent).toBe('cell 11');
    expect(changes).toBe(0);
  });

  it('sheets: add, rename, switch and delete', () => {
    render(book({ A1: 'first' }));
    act(() => [...document.querySelectorAll<HTMLButtonElement>('.shx-tab')].find((t) => t.textContent === 'File')!.click());
    press('New sheet');
    expect(last.sheets!.sheets.map((s) => s.name)).toEqual(['Sheet 1', 'Sheet 2']);
    expect(td('A1').textContent).toBe('');
    press('Rename sheet');
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Sheet name"]')!;
    act(() => { input.value = 'Sheet 1'; input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    expect(status).toContain('Another sheet has this name');
    press('Rename sheet');
    const again = document.querySelector<HTMLInputElement>('input[aria-label="Sheet name"]')!;
    act(() => { again.value = 'Cable sizing'; again.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    expect(last.sheets!.sheets[1].name).toBe('Cable sizing');
    act(() => document.querySelectorAll<HTMLButtonElement>('.shx-sheets [role="tab"]')[0].click());
    expect(td('A1').textContent).toBe('first');
    press('Delete sheet');
    expect(last.sheets!.sheets.map((s) => s.name)).toEqual(['Cable sizing']);
    expect(tool('Delete sheet').disabled).toBe(true);
  });

  it('opens an Excel file as new sheets, keeps a formula it cannot work out, and saves the book back to .xlsx', async () => {
    const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('DB-GF-01');
    ws.addRow(['Ckt', 'W', 'Qty', 'kW']);
    ws.addRow(['L1', 60, 20, { formula: 'B2*C2/1000', result: 1.2 }]);
    ws.addRow(['', '', '', { formula: 'XLOOKUP("L1",A2:A2,D2:D2)', result: 1.2 }]);
    const file = new File([(await wb.xlsx.writeBuffer()) as ArrayBuffer], 'Load schedule.xlsx');
    if (!file.arrayBuffer) Object.defineProperty(file, 'arrayBuffer', { value: async () => (await wb.xlsx.writeBuffer()) as ArrayBuffer });
    render(book({ A1: 'mine' }));
    act(() => [...document.querySelectorAll<HTMLButtonElement>('.shx-tab')].find((t) => t.textContent === 'File')!.click());
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); await vi.waitFor(() => expect(status.some((m) => m.startsWith('Opened'))).toBe(true)); });
    expect(last.sheets!.sheets.map((x) => x.name)).toEqual(['Sheet 1', 'DB-GF-01']);
    expect(td('D2').textContent).toBe('1.2');
    expect(td('D3').className).toContain('shx-keep');
    expect(td('D3').title).toContain('Kept from the Excel file');
    expect(status[status.length - 1]).toContain("1 kept with the file's value (XLOOKUP)");
    saved.length = 0;
    await act(async () => { tool('Save as .xlsx').click(); await vi.waitFor(() => expect(saved.length).toBe(1)); });
    expect(saved[0].name).toBe('Load-schedule.xlsx');
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(saved[0].bytes.buffer as ArrayBuffer);
    expect(back.worksheets.map((x) => x.name)).toEqual(['Sheet 1', 'DB-GF-01']);
    expect(back.getWorksheet('DB-GF-01')!.getCell('D2').value).toEqual({ formula: 'B2*C2/1000', result: 1.2 });
    expect(back.getWorksheet('DB-GF-01')!.getCell('D3').value).toEqual({ formula: 'XLOOKUP("L1",A2:A2,D2:D2)', result: 1.2 });
  });

  it('a file that is not an Excel workbook says so and changes nothing', async () => {
    const file = new File(['not a workbook'], 'notes.xlsx');
    if (!file.arrayBuffer) Object.defineProperty(file, 'arrayBuffer', { value: async () => new TextEncoder().encode('not a workbook').buffer });
    render(sampleProject);
    act(() => [...document.querySelectorAll<HTMLButtonElement>('.shx-tab')].find((t) => t.textContent === 'File')!.click());
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); await vi.waitFor(() => expect(status.length).toBe(1)); });
    expect(status[0]).toBe('notes.xlsx could not be opened as an Excel (.xlsx) file');
    expect(changes).toBe(0);
  });
});

describe('Sheets page — Link columns', () => {
  const office = () => book({
    A1: 'AL NOOR CONSULTANTS', A2: 'PANEL', B2: 'DB-GF', C2: 'FED FROM: SMDB-1',
    A5: 'CKT', B5: 'PH', C5: 'DESCRIPTION', D5: 'LOAD (W)', E5: 'MCB (A)', F5: 'CABLE (mm²)', G5: 'EARTH (mm²)', H5: 'LENGTH (m)', I5: 'ROUTE', J5: 'REMARKS'
  });
  const panel = () => document.querySelector<HTMLElement>('.shl');
  const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('.shl button')].find((b) => b.textContent?.startsWith(text))!;
  const choose = (label: string, value: string) => act(() => {
    const sel = document.querySelector<HTMLSelectElement>(`.shl select[aria-label="${label}"]`)!;
    sel.value = value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const open = () => { press('Electrical'); press('Link columns'); };
  const linkIt = () => { open(); choose('Template use', 'linked'); act(() => button('Suggest links').click()); choose('Board', 'DB-GF1'); };
  const data = templateData(sampleProject, 'DB-GF1');

  it('the Electrical tab opens and has the link tools; Apply to project waits for something typed', () => {
    render(sampleProject);
    press('Electrical');
    expect(tool('Link columns').getAttribute('aria-pressed')).toBe('false');
    expect(tool('Show linked cells').getAttribute('aria-pressed')).toBe('true');
    expect(tool('Apply to project').disabled).toBe(true);
    expect(tool('Refresh from project').disabled).toBe(true);
    expect(tool('Add circuit').disabled).toBe(true);
    expect([...document.querySelectorAll<HTMLButtonElement>('.shx-tab')].filter((t) => t.disabled).map((t) => t.textContent)).toEqual(['Formulas', 'Data', 'Review']);
  });

  it('Link columns opens and closes the panel', () => {
    render(sampleProject);
    open();
    expect(panel()!.textContent).toContain('This sheet is not linked to the project.');
    expect(document.querySelector<HTMLSelectElement>('.shl select[aria-label="Template use"]')!.value).toBe('output');
    expect(tool('Link columns').getAttribute('aria-pressed')).toBe('true');
    expect(button('Use the placeholders')).toBeUndefined();
    act(() => document.querySelector<HTMLButtonElement>('.shl button[aria-label="Close"]')!.click());
    expect(panel()).toBeNull();
    expect(changes).toBe(0);
  });

  it('starts a new output template safely and validates it for Excel and PDF', () => {
    render(office());
    open();
    act(() => button('Suggest links').click());
    choose('Board', 'DB-GF1');
    expect(last.sheets!.sheets[0].link!.mode).toBe('output');
    expect(panel()!.querySelector('[aria-label="Template check"]')!.textContent).toContain('Ready for Excel and PDF output.');
    expect(tool('Apply to project').disabled).toBe(true);
    expect(tool('Apply to project').title).toBe('Output-only template');
    click('C6'); type('Changed');
    expect(status[status.length - 1]).toBe('C6 is filled from the project (output-only template).');
    expect(td('C6').textContent).toBe(String(data.rows[0]['row.room']));
  });

  it('Suggest links, then a board, fills the sheet from the project', () => {
    render(office());
    linkIt();
    expect(td('B2').textContent).toBe('DB-GF1');
    expect(td('C2').textContent).toBe(`FED FROM: ${data.fields['board.fedFrom']}`);
    expect(td('A6').textContent).toBe(String(data.rows[0]['row.ref']));
    expect(td(`A${5 + data.rows.length}`).textContent).toBe(String(data.rows[data.rows.length - 1]['row.ref']));
    expect(panel()!.textContent).toContain('Needed to build the board and the SLD');
    expect(td('B2').className).toContain('shx-lk');
    expect(td('A6').className).toContain('shx-lk'); // a cell of a linked column, inside the block
    expect(document.querySelector('.shx-grid th .shx-lkname')!.textContent).toBe('Circuit reference');
    expect(changes).toBe(2);
  });

  it('a cell the app fills or works out is refused with a message; an own column takes typing and keeps it', () => {
    render(office());
    linkIt();
    const before = changes;
    click('B2');
    type('X');
    expect(status[status.length - 1]).toBe('B2 is filled from the project (Board number).');
    expect(td('B2').textContent).toBe('DB-GF1');
    click('B2');
    gridKey('F2');
    expect(grid().querySelector('input')).toBeNull();
    expect(status[status.length - 1]).toBe('B2 is filled from the project (Board number).');
    click('B6');
    type('Y');
    expect(status[status.length - 1]).toBe('B6 is worked out by the app (Phase).');
    expect(td('B6').textContent).toBe(String(data.rows[0]['row.phase']));
    expect(changes).toBe(before);
    choose('Link of column I', 'own');
    click('I6');
    type('via riser');
    expect(last.sheets!.sheets[0].cells.I6).toBe('via riser');
    expect(td('I6').className).toContain('shx-own');
  });

  describe('typed values', () => {
    const waits = () => document.querySelector('.shx-note + .shx-note, .shx-main + .shx-note')?.textContent;
    const feederOf = (id: string) => last.feeders.find((f) => f.id === id)!;

    it('a typed value is marked and kept, the note counts it, and Apply to project is enabled', () => {
      render(office());
      linkIt();
      expect(tool('Apply to project').disabled).toBe(true);
      click('C6');
      type('Hall lights');
      expect(td('C6').textContent).toBe('Hall lights');
      expect(td('C6').className).toContain('shx-pend');
      expect(td('C6').title).toBe('Typed, not applied yet');
      expect(waits()).toBe('1 typed value waits for Apply to project.');
      expect(tool('Apply to project').disabled).toBe(false);
      expect(tool('Apply to project').title).toBe('Apply to project — 1 typed value');
      expect(feederOf('DB-GF1-R1').room).not.toBe('Hall lights');
    });

    it('Apply to project changes the project in one step and the marks go', () => {
      render(office());
      linkIt();
      click('C6'); type('Hall lights');
      click('E7'); type('16');
      const before = changes;
      press('Apply to project');
      expect(changes).toBe(before + 1);
      expect(feederOf('DB-GF1-R1').room).toBe('Hall lights');
      expect(feederOf('DB-GF1-Y1')).toMatchObject({ breakerRatingA: 16, manualSize: true });
      expect(document.querySelectorAll('.shx-pend').length).toBe(0);
      expect(waits()).toBeUndefined();
      expect(td('C6').textContent).toBe('Hall lights');
      expect(status[status.length - 1]).toBe('Applied to DB-GF1: 2 circuits changed, 0 added.');
      expect(last.sheets!.sheets[0].link!.pending).toBeUndefined();
    });

    it('a refused value is marked, reported and stays', () => {
      render(office());
      linkIt();
      click('F6'); type('3');
      expect(td('F6').className).toContain('shx-over');
      expect(td('F6').title).toBe('"3" is not a valid cable size');
      const before = changes;
      press('Apply to project');
      expect(changes).toBe(before);
      expect(status[status.length - 1]).toBe('Nothing applied: F6: "3" is not a valid cable size');
      expect(waits()).toBe('1 typed value waits for Apply to project.');
    });

    it('Refresh from project drops what was not applied', () => {
      render(office());
      linkIt();
      click('C6'); type('Hall lights');
      press('Refresh from project');
      expect(td('C6').textContent).toBe(String(data.rows[0]['row.room']));
      expect(document.querySelectorAll('.shx-pend').length).toBe(0);
      expect(status[status.length - 1]).toBe('Typed values that were not applied are removed.');
    });

    it('Add circuit, a description and a load, Apply: one more circuit on the board', () => {
      render(office());
      linkIt();
      const n = data.rows.length, count = last.feeders.length;
      press('Add circuit');
      expect(td(`C${6 + n}`).className).toContain('shx-act');
      type('New store');
      click(`D${6 + n}`); type('1500');
      expect(waits()).toBe('1 typed value waits for Apply to project.');
      press('Apply to project');
      expect(last.feeders.length).toBe(count + 1);
      expect(last.feeders.some((f) => f.boardId === 'DB-GF1' && f.room === 'New store')).toBe(true);
      expect(status[status.length - 1]).toBe('Applied to DB-GF1: 0 circuits changed, 1 added.');
      expect(document.querySelectorAll('.shx-pend').length).toBe(0);
    });
  });

  it('Add a sheet for every other DB adds a tab each; Remove the link brings back the unlinked state', () => {
    const base = office(), db = sampleProject.boards.find((b) => b.id === 'DB-GF1')!;
    const two: Project = { ...base, boards: [...base.boards, { ...db, id: 'DB-X1', name: 'Second DB' }, { ...db, id: 'DB-X2', name: 'Third DB' }] };
    render(two);
    linkIt();
    const others = linkBoards(two).length - 1;
    expect(others).toBe(2);
    act(() => button('Add a sheet for every other DB (2)').click());
    expect(document.querySelectorAll('.shx-sheets [role="tab"]').length).toBe(1 + others);
    expect(last.sheets!.sheets.slice(1).every((x) => x.link?.boardId && x.link.boardId !== 'DB-GF1')).toBe(true);
    expect(button('Add a sheet for every other DB (0)').disabled).toBe(true);
    act(() => button('Remove the link').click());
    expect(panel()!.textContent).toContain('This sheet is not linked to the project.');
    expect(last.sheets!.sheets[0].link).toBeUndefined();
  });

  it('with Show linked cells off the marks are gone', () => {
    render(office());
    linkIt();
    expect(document.querySelectorAll('.shx-lk').length).toBeGreaterThan(0);
    press('Show linked cells');
    expect(document.querySelectorAll('.shx-lk').length).toBe(0);
    expect(document.querySelectorAll('.shx-lkname').length).toBe(0);
    expect(tool('Show linked cells').getAttribute('aria-pressed')).toBe('false');
  });

  it('a sheet with no heading row says so', () => {
    render(book({ A1: 'notes' }));
    open();
    act(() => button('Suggest links').click());
    expect(status[status.length - 1]).toBe('No heading row found. Start with no links and pick the first circuit row.');
    expect(changes).toBe(0);
  });

  it('does not save a template until its repeating row has a mapped circuit field', () => {
    render(book({ A1: 'LOAD SCHEDULE' }));
    open();
    act(() => button('Start with no links').click());
    expect(panel()!.querySelector('[aria-label="Template check"]')!.textContent).toContain('Link at least one circuit field in the repeating row.');
    expect(button('Save as my format').disabled).toBe(true);
  });
});

describe('Sheets page — panel schedules', () => {
  const office = () => book({
    A1: 'AL NOOR CONSULTANTS', D1: 'PANEL SCHEDULE', A2: 'PANEL', B2: 'SMDB-GF', C2: 'FED FROM: MDB-1', D2: 'LOCATION: GROUND FLOOR',
    A4: 'SL NO', B4: 'FEEDER', C4: 'BREAKER TYPE', D4: 'RATING (A)', E4: 'CABLE SIZE (mm²)', F4: 'ECC (mm²)', G4: 'LENGTH (m)', H4: 'TCL (kW)', I4: 'MDL (kW)', J4: 'ROUTE', K4: 'REMARKS'
  });
  const aside = () => document.querySelector<HTMLElement>('aside[aria-label="Link columns"]')!;
  const button = (text: string) => [...aside().querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.startsWith(text))!;
  const choose = (label: string, value: string) => act(() => { const sel = aside().querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!; sel.value = value; sel.dispatchEvent(new Event('change', { bubbles: true })); });
  const open = () => { press('Electrical'); press('Link columns'); };
  const linkPanel = () => { open(); choose('This sheet is a', 'md'); choose('Template use', 'linked'); act(() => button('Suggest links').click()); choose('Board', 'SMDB-GF'); };
  const M = panelRowKeys(sampleProject, 'SMDB-GF').length;
  const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
  beforeEach(() => { vi.stubGlobal('confirm', vi.fn(() => true)); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('an unlinked sheet offers the two kinds; the placeholders button is for DB schedules only', () => {
    render(sampleProject);
    open();
    const sel = aside().querySelector<HTMLSelectElement>('select[aria-label="This sheet is a"]')!;
    expect([...sel.options].map((o) => [o.value, o.textContent])).toEqual([['db', 'DB schedule'], ['md', 'Panel schedule (MDB, SMDB, MCC)']]);
    expect(sel.value).toBe('db');
    expect(sel.disabled).toBe(false);
    render(book({ A5: '{{row.ref}}' }));
    expect(button('Use the placeholders')).toBeDefined();
    choose('This sheet is a', 'md');
    expect(button('Use the placeholders')).toBeUndefined();
  });

  it('Panel schedule, Suggest links and a board fill the sheet with the feeders; the column labels are the panel fields', () => {
    render(office());
    linkPanel();
    expect(td('B2').textContent).toBe('SMDB-GF');
    expect(td('C2').textContent).toBe('FED FROM: MDB-1');
    expect(td('B5').textContent).toBe('LIGHTING');
    expect(td('C5').textContent).toBe('MCCB');
    expect(td(`B${4 + M}`).textContent).toBe('DB-GF1 (VILLA GROUND FLOOR DB)');
    expect(document.querySelector('.shx-grid th .shx-lkname')!.textContent).toBe('Serial number');
    expect([...document.querySelectorAll('.shx-grid th .shx-lkname')].map((e) => e.textContent)).toContain('Feeder / circuit name');
    expect(aside().textContent).toContain('A feeder name on each row');
    expect(aside().textContent).toContain('Columns — row 5 repeats for every feeder');
    expect(aside().textContent).toContain('Optional: device, rating and cable. Left blank, the app sizes them by the rules.');
    expect(button('Add a sheet for every other panel (3)')).toBeDefined();
    expect(last.sheets!.sheets[0].link!.category).toBe('md');
  });

  it('Add feeder, a name and a load, Apply: one more feeder on the panel', () => {
    render(office());
    linkPanel();
    expect(tool('Add circuit')).toBeUndefined();
    const count = last.feeders.length;
    press('Add feeder');
    expect(td(`B${5 + M}`).className).toContain('shx-act');
    type('New pump');
    click(`H${5 + M}`); type('12');
    press('Apply to project');
    expect(last.feeders.length).toBe(count + 1);
    expect(last.feeders.some((f) => f.boardId === 'SMDB-GF' && f.name === 'New pump' && f.loadKw === 12)).toBe(true);
    expect(status[status.length - 1]).toContain('Applied to SMDB-GF');
    expect(document.querySelectorAll('.shx-pend').length).toBe(0);
  });

  it('changing the kind of a linked sheet asks first and clears the links; no question when nothing is linked', async () => {
    render(office());
    linkPanel();
    const asked = vi.mocked(window.confirm);
    choose('This sheet is a', 'db');
    await flush();
    expect(asked).toHaveBeenCalledWith('Change this sheet to a DB schedule?\n\nIts links are removed: the two have different fields.');
    expect(last.sheets!.sheets[0].link).toEqual({ category: 'db', mode: 'linked', cells: {}, firstRow: 5, rows: [], columns: {} });
    expect(aside().querySelector<HTMLSelectElement>('select[aria-label="This sheet is a"]')!.value).toBe('db');
    asked.mockClear();
    choose('This sheet is a', 'md');
    await flush();
    expect(asked).not.toHaveBeenCalled();
    expect(last.sheets!.sheets[0].link!.category).toBe('md');
  });

  it('answering no keeps the links', async () => {
    render(office());
    linkPanel();
    vi.mocked(window.confirm).mockReturnValue(false);
    choose('This sheet is a', 'db');
    await flush();
    expect(last.sheets!.sheets[0].link).toMatchObject({ category: 'md', boardId: 'SMDB-GF' });
    expect(aside().querySelector<HTMLSelectElement>('select[aria-label="This sheet is a"]')!.value).toBe('md');
  });
});

describe('Sheets page — Push to load schedule', () => {
  const opened = (extra: Record<string, string> = {}) => book({
    A1: 'PANEL SCHEDULE', A2: 'PANEL', B2: 'DB-NEW', C2: 'FED FROM: SMDB-GF',
    A5: 'CKT', B5: 'DESCRIPTION', C5: 'LOAD (W)', D5: 'MCB (A)', E5: 'CABLE (mm²)', F5: 'REMARKS',
    A6: 'R1', B6: 'Lights', C6: '1200', A7: 'Y1', B7: 'Sockets', C7: '2400', D7: '20', A8: 'B1', B8: 'Store', C8: '600', ...extra
  });
  const aside = () => document.querySelector<HTMLElement>('aside[aria-label="Link columns"]')!;
  const button = (text: string) => [...aside().querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === text)!;
  const boxText = () => aside().querySelector('[aria-label="Rows of this sheet"]')?.textContent;
  const boardSelect = () => aside().querySelector('select[aria-label="Board"]');
  const choose = (label: string, value: string) => act(() => { const sel = aside().querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!; sel.value = value; sel.dispatchEvent(new Event('change', { bubbles: true })); });
  const suggest = (kind?: string) => { press('Electrical'); press('Link columns'); if (kind) choose('This sheet is a', kind); choose('Template use', 'linked'); act(() => button('Suggest links from the headings').click()); };

  it('a sheet with rows of its own shows the box with the count, the panel line and the buttons, and no Board select', () => {
    render(opened());
    suggest();
    expect(boxText()).toContain('This sheet has 3 rows of its own');
    expect(boxText()).toContain('Panel DB-NEW is new, under SMDB-GF.');
    expect(boxText()).toContain('Push makes the panel and one circuit for each row. A size left blank is sized by the rules.');
    expect(button('Push to load schedule').disabled).toBe(false);
    expect(button('Push to load schedule').className).toContain('shl-go');
    expect(boardSelect()).toBeNull();
    expect(aside().textContent).not.toContain('Add a sheet for every other');
    expect(td('B2').textContent).toBe('DB-NEW');
  });

  it('says which panel it is: in the project, new with a missing board above, or new with none', () => {
    render(opened({ B2: 'DB-GF1' }));
    suggest();
    expect(boxText()).toContain('Panel DB-GF1 is in the project.');
    render(opened({ C2: 'FED FROM: SMDB-X' }));
    act(() => button('Suggest links from the headings').click());
    expect(boxText()).toContain('Panel DB-NEW is new. SMDB-X is not in the project and is made too.');
    render(opened({ C2: 'FED FROM: ' }));
    act(() => button('Suggest links from the headings').click());
    expect(boxText()).toContain('Panel DB-NEW is new, with no board above it.');
  });

  it('without a panel number the line says so and Push is off', () => {
    render(opened({ B2: '' }));
    suggest();
    expect(boxText()).toContain('Link the cell that holds the panel number to push them.');
    expect(button('Push to load schedule').disabled).toBe(true);
  });

  it('Push to load schedule changes the project once: the panel, its circuits and the status; the Board select comes back', () => {
    render(opened());
    suggest();
    const before = changes;
    act(() => button('Push to load schedule').click());
    expect(changes).toBe(before + 1);
    expect(last.boards.find((b) => b.id === 'DB-NEW')).toMatchObject({ upstreamId: 'SMDB-GF' });
    expect(last.feeders.filter((f) => f.boardId === 'DB-NEW' && f.phase).map((f) => f.id)).toEqual(['DB-NEW-R1', 'DB-NEW-Y1', 'DB-NEW-B1']);
    expect(status[status.length - 1]).toBe('Pushed to DB-NEW: 3 added, 0 updated. Made DB-NEW.');
    expect(boxText()).toBeUndefined();
    expect(aside().querySelector<HTMLSelectElement>('select[aria-label="Board"]')!.value).toBe('DB-NEW');
    expect(td('B6').textContent).toBe('Lights');
    expect(last.sheets!.sheets[0].link!.boardId).toBe('DB-NEW');
  });

  it('a row that fails is reported after the counts and stays', () => {
    render(opened({ B7: '', C7: '', D7: '16' }));
    suggest();
    act(() => button('Push to load schedule').click());
    expect(status[status.length - 1]).toBe('Pushed to DB-NEW: 2 added, 0 updated. Made DB-NEW. Not pushed: Row 7: give a description or a load');
    expect(last.sheets!.sheets[0].link!.added).toEqual([{ D: '16' }]);
  });

  it('Use as a template only leaves the pattern row blank and brings the Board select back', () => {
    render(opened());
    suggest();
    const projectBefore = last;
    act(() => button('Use as a template only').click());
    expect(boxText()).toBeUndefined();
    expect(boardSelect()).not.toBeNull();
    const cells = last.sheets!.sheets[0].cells;
    expect([cells.A6, cells.B6, cells.C6, cells.A7, cells.B7, cells.A8]).toEqual([undefined, undefined, undefined, undefined, undefined, undefined]);
    expect(cells.B5).toBe('DESCRIPTION');
    expect(last.sheets!.sheets[0].link!.rows).toEqual([]);
    expect(last.boards).toBe(projectBefore.boards);
  });

  it('a panel schedule shows the target line, Push to load schedule and its own hint', () => {
    render(opened());
    suggest('md');
    expect(boxText()).toContain('This sheet has 3 rows of its own');
    expect(boxText()).toContain('Push makes the panel and one feeder for each row. A row that names a panel (SMDB-1, DB-GF) makes that panel under it; its load comes from its own schedule. A size left blank is sized by the rules.');
    expect(boxText()).toContain('Panel DB-NEW is new, under SMDB-GF.');
    expect(button('Push to load schedule').disabled).toBe(false);
    expect(button('Use as a template only')).toBeDefined();
    expect(boardSelect()).toBeNull();
  });

  it('a panel schedule whose Fed from is not a panel says it is a main panel', () => {
    render(opened({ C2: 'FED FROM: DEWA' }));
    suggest('md');
    expect(boxText()).toContain('Panel DB-NEW is new, a main panel. "DEWA" is not read as a panel.');
  });
});

describe('Sheets page — My formats', () => {
  const office = () => book({
    A1: 'AL NOOR CONSULTANTS', A2: 'PANEL', B2: 'DB-GF', C2: 'FED FROM: SMDB-1',
    A5: 'CKT', B5: 'PH', C5: 'DESCRIPTION', D5: 'LOAD (W)', E5: 'MCB (A)', F5: 'CABLE (mm²)', G5: 'EARTH (mm²)', H5: 'LENGTH (m)', I5: 'ROUTE', J5: 'REMARKS'
  });
  const aside = (label: string) => document.querySelector<HTMLElement>(`aside[aria-label="${label}"]`);
  const btn = (label: string, text: string, exact = false) => [...(aside(label)?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find((b) => (exact ? b.textContent === text : b.textContent?.startsWith(text)))!;
  const choose = (label: string, aria: string, value: string) => act(() => {
    const sel = aside(label)!.querySelector<HTMLSelectElement>(`select[aria-label="${aria}"]`)!;
    sel.value = value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const linkIt = (p: Project = office()) => { render(p); press('Electrical'); press('Link columns'); act(() => btn('Link columns', 'Suggest links').click()); choose('Link columns', 'Board', 'DB-GF1'); };
  const nameRow = (name: string) => { act(() => btn('Link columns', 'Save as my format').click()); act(() => { aside('Link columns')!.querySelector<HTMLInputElement>('input[aria-label="Format name"]')!.value = name; }); };
  const template = () => ({ ...newSheet(), link: { category: 'db' as const, cells: {}, firstRow: 6, rows: [], columns: { A: 'row.ref', B: 'row.room' } } });
  const seed = (...names: string[]) => saveFormats(names.reduce((l, n) => withFormat(l, n, template()).list, [] as ReturnType<typeof loadFormats>));
  const data = templateData(sampleProject, 'DB-GF1');
  beforeEach(() => { localStorage.removeItem(FORMATS_KEY); savedText.length = 0; });
  afterEach(() => { localStorage.removeItem(FORMATS_KEY); savedText.length = 0; vi.restoreAllMocks(); });

  it('Save as my format stores the layout without its board and reports it; Escape closes the name row', () => {
    linkIt();
    nameRow('Office DB');
    expect(aside('Link columns')!.querySelector<HTMLInputElement>('input[aria-label="Format name"]')).not.toBeNull();
    act(() => btn('Link columns', 'Save', true).click());
    expect(loadFormats().map((f) => f.name)).toEqual(['Office DB']);
    expect(loadFormats()[0].sheet.link).not.toHaveProperty('boardId');
    expect(status[status.length - 1]).toBe('Format "Office DB" saved. It is in My formats for every project.');
    nameRow('office db');
    act(() => btn('Link columns', 'Save', true).click());
    expect(loadFormats()).toHaveLength(1);
    expect(status[status.length - 1]).toBe('Format "office db" updated.');
    act(() => btn('Link columns', 'Save as my format').click());
    act(() => { aside('Link columns')!.querySelector('input[aria-label="Format name"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(aside('Link columns')!.querySelector('input[aria-label="Format name"]')).toBeNull();
    nameRow('   ');
    act(() => btn('Link columns', 'Save', true).click());
    expect(status[status.length - 1]).toBe('Give the format a name.');
    expect(aside('Link columns')!.querySelector('input[aria-label="Format name"]')).not.toBeNull();
    expect(changes).toBe(2);
  });

  it('PDF paper is A4 landscape until another is chosen; the choice is kept on the sheet and saved with the format', () => {
    linkIt();
    const paper = () => aside('Link columns')!.querySelector<HTMLSelectElement>('select[aria-label="PDF paper"]')!;
    expect(paper().value).toBe('A4');
    expect([...paper().options].map((o) => o.textContent)).toEqual(['A4 landscape', 'A4 portrait', 'A3 landscape', 'A3 portrait']);
    expect(last.sheets!.sheets[0]).not.toHaveProperty('paper');
    choose('Link columns', 'PDF paper', 'A3');
    expect(last.sheets!.sheets[0].paper).toBe('A3');
    expect(paper().value).toBe('A3');
    nameRow('Office DB');
    act(() => btn('Link columns', 'Save', true).click());
    expect(loadFormats()[0].sheet.paper).toBe('A3');
    choose('Link columns', 'PDF paper', 'A4');
    expect(last.sheets!.sheets[0]).not.toHaveProperty('paper');
  });

  it('My formats lists a saved format, and Add sheet adds a tab on the chosen board', () => {
    seed('Office DB');
    linkIt();
    press('My formats');
    expect(aside('Link columns')).toBeNull();
    expect(aside('My formats')!.textContent).toContain('Office DB');
    expect(aside('My formats')!.textContent).toContain('DB schedule · saved');
    expect(btn('My formats', 'Add sheet', true).disabled).toBe(true);
    choose('My formats', 'Board for Office DB', 'DB-GF1');
    act(() => btn('My formats', 'Add sheet', true).click());
    expect(document.querySelectorAll('.shx-sheets [role="tab"]').length).toBe(2);
    expect(status[status.length - 1]).toBe('Sheet DB-GF1 added from "Office DB".');
    expect(document.querySelector('.shx-sheets [aria-selected="true"]')!.textContent).toBe('DB-GF1');
    expect(td('A6').textContent).toBe(String(data.rows[0]['row.ref']));
  });

  it('exports one portable format package without a board target or project edits', async () => {
    seed('Office DB');
    render(sampleProject);
    press('Electrical'); press('My formats');
    await act(async () => { btn('My formats', 'Export…', true).click(); await vi.waitFor(() => expect(savedText).toHaveLength(1)); });
    expect(savedText[0]).toMatchObject({ name: 'Office-DB.lvds-format', ext: 'lvds-format' });
    const exported = scheduleFormatFromFileText(savedText[0].text);
    expect(exported.name).toBe('Office DB');
    expect(exported.sheet.link).toMatchObject({ mode: 'output', rows: [] });
    expect(exported.sheet.link).not.toHaveProperty('boardId');
    expect(status[status.length - 1]).toBe('Saved Office-DB.lvds-format');
  });

  it('imports a valid format package as output-only', async () => {
    const incoming = withFormat([], 'Shared DB', { ...template(), link: { ...template().link!, mode: 'linked', boardId: 'DB-GF1' } }).list[0];
    const text = scheduleFormatFileText(incoming), file = new File([text], 'Shared.lvds-format', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: async () => text });
    render(sampleProject);
    press('Electrical'); press('My formats');
    const input = aside('My formats')!.querySelector<HTMLInputElement>('input[aria-label="Schedule format file"]')!;
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); await vi.waitFor(() => expect(loadFormats()).toHaveLength(1)); });
    expect(loadFormats()[0]).toMatchObject({ name: 'Shared DB', sheet: { link: { mode: 'output', rows: [] } } });
    expect(loadFormats()[0].sheet.link).not.toHaveProperty('boardId');
    expect(aside('My formats')!.textContent).toContain('Shared DB');
    expect(status[status.length - 1]).toBe('Format "Shared DB" imported. It is Output only.');
  });

  it('sets a format compatibility and office default without changing the project', () => {
    seed('Office DB');
    render(sampleProject);
    press('Electrical'); press('My formats');
    const compatibility = aside('My formats')!.querySelector<HTMLSelectElement>('select[aria-label="Compatibility for Office DB"]')!;
    expect(compatibility.value).toBe('');
    act(() => { compatibility.value = 'authority:builtin-dewa'; compatibility.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(loadFormats()[0]).toMatchObject({ name: 'Office DB', authorityId: 'builtin-dewa', version: 2 });
    expect(loadFormats()[0]).not.toHaveProperty('defaultFor');
    const defaultButton = [...block('Office DB').querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Default: DBs')!;
    act(() => defaultButton.click());
    expect(loadFormats()[0].defaultFor).toEqual(['db']);
    expect(changes).toBe(0);
    expect(status[status.length - 1]).toBe('"Office DB" is the DEWA default for DBs.');
  });

  it('Add a sheet for every DB without one adds the rest in one step', () => {
    seed('Office DB');
    const base = office(), db = sampleProject.boards.find((b) => b.id === 'DB-GF1')!;
    linkIt({ ...base, boards: [...base.boards, { ...db, id: 'DB-X1', name: 'Second DB' }, { ...db, id: 'DB-X2', name: 'Third DB' }] });
    press('My formats');
    const before = changes;
    act(() => btn('My formats', 'Add a sheet for every DB without one (2)').click());
    expect(changes).toBe(before + 1);
    expect(last.sheets!.sheets.map((s) => s.link?.boardId)).toEqual(['DB-GF1', 'DB-X1', 'DB-X2']);
    expect(btn('My formats', 'Add a sheet for every DB without one (0)').disabled).toBe(true);
  });

  it('Rename reports a taken name and keeps the input; a free name is saved', () => {
    seed('Alpha', 'Beta');
    render(sampleProject);
    press('Electrical'); press('My formats');
    const betaBlock = [...aside('My formats')!.querySelectorAll<HTMLElement>('.shl-needs')].find((b) => b.textContent?.startsWith('Beta'))!;
    act(() => [...betaBlock.querySelectorAll('button')].find((b) => b.textContent === 'Rename')!.click());
    const input = () => aside('My formats')!.querySelector<HTMLInputElement>('input[aria-label="New name for Beta"]')!;
    act(() => { input().value = 'alpha'; });
    act(() => [...input().parentElement!.querySelectorAll('button')].find((b) => b.textContent === 'Save')!.click());
    expect(status[status.length - 1]).toBe('Another format has this name.');
    expect(input()).not.toBeNull();
    act(() => { input().value = 'Gamma'; });
    act(() => [...input().parentElement!.querySelectorAll('button')].find((b) => b.textContent === 'Save')!.click());
    expect(loadFormats().map((f) => f.name)).toEqual(['Alpha', 'Gamma']);
    expect(aside('My formats')!.textContent).toContain('Gamma');
  });

  it('Delete asks first and removes the format', async () => {
    seed('Alpha', 'Beta');
    render(sampleProject);
    press('Electrical'); press('My formats');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const del = () => [...aside('My formats')!.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Delete')!;
    await act(async () => { del().click(); await Promise.resolve(); });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0]).toContain('Delete the format "Alpha"?');
    expect(loadFormats()).toHaveLength(2);
    await act(async () => { del().click(); await vi.waitFor(() => expect(loadFormats()).toHaveLength(1)); });
    expect(loadFormats().map((f) => f.name)).toEqual(['Beta']);
    expect(aside('My formats')!.textContent).not.toContain('Alpha');
  });

  it('opening My formats closes Link columns and the other way round; a new project has none yet', () => {
    render(sampleProject);
    press('Electrical'); press('Link columns');
    expect(aside('Link columns')!.textContent).not.toContain('Use one of my formats');
    press('My formats');
    expect(aside('Link columns')).toBeNull();
    expect(tool('My formats').getAttribute('aria-pressed')).toBe('true');
    expect(aside('My formats')!.textContent).toContain('No formats yet. Link a sheet to a board, then press Save as my format in Link columns.');
    press('Link columns');
    expect(aside('My formats')).toBeNull();
    expect(aside('Link columns')).not.toBeNull();
  });

  it('the unlinked state offers Use one of my formats only when one is saved', () => {
    seed('Alpha');
    render(sampleProject);
    press('Electrical'); press('Link columns');
    act(() => btn('Link columns', 'Use one of my formats').click());
    expect(aside('Link columns')).toBeNull();
    expect(aside('My formats')!.textContent).toContain('Alpha');
  });
  const panelTemplate = () => ({ ...newSheet(), link: { category: 'md' as const, cells: {}, firstRow: 6, rows: [], columns: { A: 'row.sl', B: 'row.name' } } });
  const seedBoth = () => saveFormats(withFormat(withFormat([], 'Alpha', template()).list, 'Office panel', panelTemplate()).list);
  const top = () => aside('My formats')!.querySelector<HTMLElement>('.shl-needs')!;
  const block = (name: string) => [...aside('My formats')!.querySelectorAll<HTMLElement>('.shl-needs')].find((d) => d.firstElementChild?.textContent === name)!;
  const chip = (name: string, text: string) => [...block(name).querySelectorAll<HTMLButtonElement>('button[aria-pressed]')].find((b) => b.textContent === text)!;
  const label = (text: string) => aside('My formats')!.querySelector<HTMLButtonElement>(`button[aria-label="${text}"]`)!;

  it('lists each format with its kind, and offers the chips of its kind', () => {
    seedBoth();
    render(sampleProject);
    press('Electrical'); press('My formats');
    expect(block('Alpha').textContent).toContain('DB schedule · saved');
    expect(block('Office panel').textContent).toContain('Panel schedule · saved');
    expect([...block('Alpha').querySelectorAll('button[aria-pressed]')].map((b) => b.textContent)).toEqual(['Default: DBs', 'DBs']);
    expect([...block('Office panel').querySelectorAll('button[aria-pressed]')].map((b) => b.textContent)).toEqual(['Default: SMDBs', 'Default: MDBs', 'Default: MCCs', 'SMDBs', 'MDBs', 'MCCs']);
    expect(block('Alpha').textContent).toContain('Use for this project\'s');
    expect(btn('My formats', 'Add a sheet for every DB without one (1)')).toBeDefined();
    expect(btn('My formats', 'Add a sheet for every panel without one (4)')).toBeDefined();
  });

  it('the top box has four lines: General, then the format chosen with a chip each way, and the General button takes it away', () => {
    seedBoth();
    render(sampleProject);
    press('Electrical'); press('My formats');
    expect(top().textContent).toContain("This project's schedules use");
    for (const p of ['DBs', 'SMDBs', 'MDBs', 'MCCs']) expect(top().textContent).toContain(p);
    expect(top().textContent!.match(/General/g)).toHaveLength(4);
    expect(label('Use General for SMDBs')).toBeNull();
    expect(chip('Office panel', 'SMDBs').getAttribute('aria-pressed')).toBe('false');
    act(() => chip('Office panel', 'SMDBs').click());
    expect(changes).toBe(1);
    expect(last.scheduleFormats!.smdb).toMatchObject({ name: 'Office panel' });
    expect(Object.keys(last.scheduleFormats!)).toEqual(['smdb']);
    expect(status[status.length - 1]).toBe('SMDBs of this project use "Office panel".');
    expect(chip('Office panel', 'SMDBs').getAttribute('aria-pressed')).toBe('true');
    expect(chip('Office panel', 'MDBs').getAttribute('aria-pressed')).toBe('false');
    expect(top().textContent!.match(/General/g)).toHaveLength(3);
    expect(top().textContent).toContain('Office panel');
    act(() => chip('Office panel', 'SMDBs').click()); // pressing a pressed chip goes back to General
    expect(changes).toBe(2);
    expect(last).not.toHaveProperty('scheduleFormats');
    expect(status[status.length - 1]).toBe("SMDBs of this project use the app's own table.");
    act(() => chip('Alpha', 'DBs').click());
    expect(last.scheduleFormats!.db).toMatchObject({ name: 'Alpha' });
    expect(status[status.length - 1]).toBe('DBs of this project use "Alpha".');
    act(() => label('Use General for DBs').click());
    expect(changes).toBe(4);
    expect(last).not.toHaveProperty('scheduleFormats');
    expect(status[status.length - 1]).toBe("DBs of this project use the app's own table.");
  });

  it('says when the library format was changed after the project took its copy, and updates that copy', () => {
    seedBoth();
    render(sampleProject);
    press('Electrical'); press('My formats');
    act(() => chip('Office panel', 'MCCs').click());
    expect(aside('My formats')!.textContent).not.toContain('Changed in My formats since this project took its copy.');
    saveFormats(loadFormats().map((f) => (f.name === 'Office panel' ? { ...f, sheet: { ...f.sheet, link: { ...f.sheet.link!, firstRow: 9 } } } : f)));
    press('My formats'); press('My formats');
    expect(aside('My formats')!.textContent).toContain('Changed in My formats since this project took its copy.');
    expect(label("Update the project's copy for SMDBs")).toBeNull();
    act(() => label("Update the project's copy for MCCs").click());
    expect(last.scheduleFormats!.mcc!.sheet.link!.firstRow).toBe(9);
    expect(status[status.length - 1]).toBe('This project\'s copy of "Office panel" is updated.');
    expect(aside('My formats')!.textContent).not.toContain('Changed in My formats since this project took its copy.');
  });

  it('openSheetId shows that sheet, and a later tab click is not undone', () => {
    const two: Project = { ...sampleProject, sheets: { sheets: [{ ...newSheet(), id: 'S1', name: 'One' }, { ...newSheet(), id: 'S2', name: 'Two' }, { ...newSheet(), id: 'S3', name: 'Three' }] } };
    const show = (id?: string) => act(() => root.render(<SheetsPage project={two} onChange={() => {}} onStatus={() => {}} openSheetId={id} />));
    const selected = () => document.querySelector('.shx-sheets [aria-selected="true"]')!.textContent;
    show('S2');
    expect(selected()).toBe('Two');
    act(() => document.querySelectorAll<HTMLButtonElement>('.shx-sheets [role="tab"]')[0].click());
    expect(selected()).toBe('One');
    show('S2');
    expect(selected()).toBe('One');
    show('S3');
    expect(selected()).toBe('Three');
    show('S9');
    expect(selected()).toBe('Three');
  });
});
