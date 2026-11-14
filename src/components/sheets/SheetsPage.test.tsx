// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import SheetsPage from './SheetsPage';

const saved: { name: string; bytes: Uint8Array }[] = [];
vi.mock('../../util/files', async (orig) => ({ ...(await orig<typeof import('../../util/files')>()), saveBinary: async (name: string, bytes: Uint8Array) => { saved.push({ name, bytes }); return `Saved ${name}`; } }));
import { sampleProject } from '../../data/sampleProject';
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
    for (const label of ['Apply to project', 'Sort', 'Filter', 'Find', 'Copy format']) expect(tool(label).disabled).toBe(true);
    expect(tool('Apply to project').title).toBe('Comes in a later stage');
    expect([...document.querySelectorAll<HTMLButtonElement>('.shx-tab')].filter((t) => t.disabled).map((t) => t.textContent)).toEqual(['Electrical', 'Formulas', 'Data', 'Review']);
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
