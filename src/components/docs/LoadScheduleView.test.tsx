// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LoadScheduleView from './LoadScheduleView';
import type { RibbonActions } from '../Ribbon';
import type { Project } from '../../types';
import { EMPTY_DATABASE } from '../../database/database';
import { sampleProject } from '../../data/sampleProject';
import { scheduleCircuits } from '../../calc/loadSchedule';
import { spareWaysOf } from '../../model/spareWays';
import { safeFileName, saveBinary, saveCsv, savePdf } from '../../util/files';

vi.mock('../../util/files', async (real) => ({
  ...await real<typeof import('../../util/files')>(),
  saveBinary: vi.fn(async () => 'Saved'), saveCsv: vi.fn(async () => 'Saved'), savePdf: vi.fn(async () => 'Saved')
}));
vi.mock('../../docs/formWorkbook', async (real) => ({
  ...await real<typeof import('../../docs/formWorkbook')>(),
  buildFormWorkbook: vi.fn(() => ({})), workbookBytes: vi.fn(async () => new Uint8Array(1))
}));
vi.mock('../../docs/sheetPdf', async (real) => ({ ...await real<typeof import('../../docs/sheetPdf')>(), workbookHtml: vi.fn(() => '<p>form</p>') }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Schedule = NonNullable<RibbonActions['schedule']>;
const BOARD = 'DB-GF1';
let shown = BOARD;
let root: Root;
let latest: Project;
let published: Schedule | undefined;
let publishes = 0;
const status = vi.fn();

function Harness() {
  const [p, setP] = useState(sampleProject);
  latest = p;
  return <LoadScheduleView project={p} boardId={shown} db={EMPTY_DATABASE} onBoard={() => {}} onChange={setP} onStatus={status} onSettings={() => {}}
    onSchedule={(s) => { published = s; publishes++; }} />;
}
const mount = () => act(() => root.render(<Harness />));
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const last = <T,>(l: T[]) => l[l.length - 1];
const circuits = () => scheduleCircuits(latest, BOARD);
const buttons = () => [...document.querySelectorAll('button')].map((b) => b.textContent!.trim());
/** The Room inputs of the circuit rows, top row first (the row numbers of the grid). */
const rooms = () => [...document.querySelectorAll<HTMLInputElement>('table.ls input[placeholder="Room"][data-cell]')].sort((a, b) => +a.dataset.cell!.split(':')[0] - +b.dataset.cell!.split(':')[0]);
const press = (el: Element, over: Partial<MouseEventInit> = {}) => act(() => { el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, ...over })); window.dispatchEvent(new MouseEvent('mouseup')); });
/** The first two Room cells selected, top to bottom. */
const selectTwo = () => { const [a, b] = rooms(); press(a); press(b, { shiftKey: true }); return [a, b]; };

beforeEach(() => {
  root = createRoot(document.body.appendChild(document.createElement('div')));
  shown = BOARD; published = undefined; publishes = 0; status.mockClear();
  for (const f of [saveBinary, saveCsv, savePdf]) vi.mocked(f).mockClear();
  vi.stubGlobal('confirm', vi.fn(() => true));
});
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; vi.unstubAllGlobals(); });

describe('Load schedule page and the ribbon', () => {
  it('no longer has the buttons that moved to the ribbon, and keeps the rest', () => {
    mount();
    const names = buttons();
    for (const gone of ['Add circuit', 'Add 3-phase circuit', 'Spare', 'Space', 'Balance phases', 'Export Excel', 'Export PDF', 'Export CSV', 'Submission pack (Excel)', 'My Excel template…']) expect(names).not.toContain(gone);
    expect(document.querySelector('.ls-spare-add')).toBeNull();
    expect(document.querySelector('.ls-actions')!.textContent).toMatch(/Excel keys.*Phase load \(W\).*imbalance/);
    expect(document.querySelector('select[aria-label="DB"]')).not.toBeNull();
    expect(document.querySelectorAll('table.ls .icon-btn').length).toBeGreaterThan(0); // the row bins stay
  });

  it('publishes what the ribbon needs, and again only when those values change', () => {
    mount();
    expect(published).toMatchObject({ grid: true, row: undefined, canBalance: true, exporting: false });
    expect(published!.imbalancePct).toBeTypeOf('number');
    expect(document.querySelector('.ls-actions b.ok, .ls-actions b.warn')!.textContent).toBe(`${published!.imbalancePct}%`);
    const first = publishes;
    expect(first).toBeLessThan(4); // not once per render
    press(rooms()[0]);
    expect(publishes).toBeLessThan(first + 3);
    const before = publishes;
    act(() => root.render(<Harness />)); // a render with the same values
    expect(publishes).toBe(before);
    act(() => root.unmount());
    expect(published).toBeUndefined(); // the page going away clears it
    root = createRoot(document.body.appendChild(document.createElement('div')));
  });

  it('adds a circuit, a 3-phase circuit, a spare and a space', () => {
    mount();
    const n = circuits().length;
    act(() => published!.onAddCircuit());
    expect(circuits()).toHaveLength(n + 1);
    expect(last(circuits()).phase).not.toBe('RYB');
    act(() => published!.onAddCircuit(true));
    expect(circuits()).toHaveLength(n + 2);
    expect(last(circuits()).phase).toBe('RYB');
    const board = () => latest.boards.find((b) => b.id === BOARD)!;
    act(() => published!.onAddSpare('spare'));
    act(() => published!.onAddSpare('space'));
    expect(spareWaysOf(board()).map((s) => `${s.kind}:${s.phase === 'RYB'}`)).toEqual(['spare:false', 'space:false']);
    act(() => published!.onAddSpare('spare', true));
    act(() => published!.onAddSpare('space', true));
    expect(spareWaysOf(board()).slice(2).map((s) => `${s.kind}:${s.phase === 'RYB'}`)).toEqual(['spare:true', 'space:true']);
    expect(status).toHaveBeenLastCalledWith(expect.stringMatching(/^Added a TP space to DB-GF1/));
  });

  it('balances the phases', () => {
    mount();
    const before = latest;
    act(() => published!.onBalance());
    expect(latest).not.toBe(before);
    expect(latest.feeders.map((f) => f.id).sort()).toEqual(before.feeders.map((f) => f.id).sort());
  });

  it('opens the edit dialog and deletes after asking, for the row of the active cell, which a click elsewhere keeps', async () => {
    mount();
    expect(published!.row).toBeUndefined();
    act(() => published!.onEditRow()); // no active row: nothing
    expect(document.querySelector('.circuit-edit')).toBeNull();
    const top = rooms()[1]; // the room of the second circuit row
    act(() => top.focus());
    const ref = published!.row!;
    expect(ref).toMatch(/^[RYB]\d+$/);
    act(() => top.blur()); // focus moves to a ribbon button
    expect(published!.row).toBe(ref);
    act(() => published!.onEditRow());
    expect(document.querySelector('.circuit-edit')).not.toBeNull();
    // Delete: the same question as the row's bin.
    const n = circuits().length;
    await act(async () => { published!.onDeleteRow(); await Promise.resolve(); });
    expect(window.confirm).toHaveBeenCalledWith(`Delete circuit ${ref}?`);
    expect(circuits()).toHaveLength(n - 1);
  });

  it('does not delete when the question is declined', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    mount();
    act(() => rooms()[0].focus());
    const n = circuits().length;
    await act(async () => { published!.onDeleteRow(); await Promise.resolve(); });
    expect(circuits()).toHaveLength(n);
  });

  it('fills down the selection as Ctrl+D does', () => {
    mount();
    const [a, b] = selectTwo();
    expect(a.value).not.toBe(b.value);
    act(() => published!.onFillDown());
    const byButton = rooms().map((r) => r.value);
    expect(byButton[1]).toBe(byButton[0]);
    // The key, from the same start.
    act(() => root.unmount());
    root = createRoot(document.body.appendChild(document.createElement('div')));
    mount();
    const [, d] = selectTwo();
    act(() => { d.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', ctrlKey: true, bubbles: true })); });
    expect(rooms().map((r) => r.value)).toEqual(byButton);
  });

  it('pastes the clipboard through the grid, and says what to press when the clipboard cannot be read', async () => {
    mount();
    const [a] = selectTwo();
    act(() => a.blur());
    vi.stubGlobal('navigator', { clipboard: { readText: vi.fn(async () => 'AAA\nBBB') } });
    await act(async () => { published!.onPaste(); await Promise.resolve(); await Promise.resolve(); });
    expect(rooms().slice(0, 2).map((r) => r.value)).toEqual(['AAA', 'BBB']);
    status.mockClear();
    vi.stubGlobal('navigator', { clipboard: { readText: vi.fn(async () => { throw new DOMException('denied', 'NotAllowedError'); }) } });
    await act(async () => { published!.onPaste(); await Promise.resolve(); await Promise.resolve(); });
    expect(status).toHaveBeenLastCalledWith('Paste: press Ctrl/⌘ V on the schedule');
    status.mockClear();
    vi.stubGlobal('navigator', {});
    await act(async () => { published!.onPaste(); await Promise.resolve(); await Promise.resolve(); });
    expect(status).toHaveBeenLastCalledWith('Paste: press Ctrl/⌘ V on the schedule');
  });

  it('copies the selection to the clipboard', () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    mount();
    selectTwo();
    act(() => published!.onCopy());
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(String((writeText.mock.calls[0] as unknown[])[0]).split('\n')).toHaveLength(2);
  });

  it('starts each kind of export, and says so while one runs', async () => {
    mount();
    let finish!: () => void;
    vi.mocked(saveBinary).mockImplementationOnce(() => new Promise<string>((r) => { finish = () => r('Saved'); }));
    act(() => published!.onExport('excel'));
    await flush();
    expect(published!.exporting).toBe(true);
    expect(vi.mocked(saveBinary).mock.calls[0][0]).toBe(`${safeFileName(`${sampleProject.name} ${BOARD} load schedule`)}.xlsx`);
    await act(async () => { finish(); await Promise.resolve(); await Promise.resolve(); });
    expect(published!.exporting).toBe(false);
    await act(async () => { published!.onExport('pack'); await Promise.resolve(); await Promise.resolve(); });
    expect(String(vi.mocked(saveBinary).mock.calls[1][0])).toContain('submission-forms');
    await act(async () => { published!.onExport('pdf'); await Promise.resolve(); });
    expect(vi.mocked(savePdf).mock.calls[0][0]).toBe(`${BOARD}-load-schedule.pdf`); // the DB schedule PDF
    await act(async () => { published!.onExport('csv'); await Promise.resolve(); });
    expect(vi.mocked(saveCsv)).toHaveBeenCalledTimes(1);
    act(() => published!.onExport('template'));
    await flush();
    expect(document.body.textContent).toContain('No template chosen yet');
  });

  it('prints the form on screen as the form PDF on the other forms, and turns the DB-only tools off', async () => {
    shown = sampleProject.boards.find((b) => !b.upstreamId)!.id; // a main board opens on its connected load & MD form
    mount();
    expect(document.body.textContent).toContain('Connected load, maximum demand');
    expect(published).toMatchObject({ grid: false, row: undefined });
    await act(async () => { published!.onExport('pdf'); await Promise.resolve(); await Promise.resolve(); });
    expect(String(vi.mocked(savePdf).mock.calls[0][0])).toContain('connected-load-MD.pdf');
    expect(vi.mocked(saveBinary)).not.toHaveBeenCalled();
  });
});
