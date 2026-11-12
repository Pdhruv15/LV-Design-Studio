// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Ribbon, { type RibbonActions, type RibbonTab } from './Ribbon';
import { DEFAULT_LAYERS } from '../diagram/annotations';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Schedule = NonNullable<RibbonActions['schedule']>;
const noop = () => {};
const scheduleActions = (over: Partial<Schedule> = {}): Schedule => ({
  grid: true, onAddCircuit: vi.fn(), onAddSpare: vi.fn(), row: undefined, onFillDown: vi.fn(), onEditRow: vi.fn(), onDeleteRow: vi.fn(),
  canBalance: true, imbalancePct: 12, onBalance: vi.fn(), onCopy: vi.fn(), onPaste: vi.fn(), exporting: false, onExport: vi.fn(), ...over
});
const actions = (over: Partial<RibbonActions> = {}): RibbonActions => ({
  view: 'load-schedule', onView: noop, tool: 'select', onTool: noop, boardId: 'DB-GF1', selectedFeederId: null, selection: { kind: 'board', id: 'DB-GF1' },
  onAddFeeder: noop, onAddBoard: noop, onBoardProperties: noop, onEditSelected: noop, onDeleteSelected: noop, onExportDss: noop, onSettings: noop,
  onUndo: noop, onRedo: noop, canUndo: false, canRedo: false, onRun: noop, staleCount: 0,
  onNew: noop, onSave: noop, onSaveAs: noop, onAnonymizedSample: noop, onProfile: noop, onChooseFolder: noop, folderLabel: 'Folder: Projects',
  dirty: false, recent: [], onOpenRecent: noop, dbIssues: 0, inboxCount: 0,
  onBom: noop, hasPriceList: false, stage: 'detailed', nextStage: 'ifc', ifcIssued: false, onAdvanceStage: noop, route: 'from-ifc', onRoute: noop, onConceptReport: noop,
  ...over
});

let root: Root;
beforeEach(() => { localStorage.clear(); root = createRoot(document.body.appendChild(document.createElement('div'))); });
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; vi.restoreAllMocks(); });

/** The Load schedule tab with these schedule actions (none: without them); returns the actions given. */
function show(schedule: Partial<Schedule> | null = {}, over: Partial<RibbonActions> = {}, tab: RibbonTab = 'schedule') {
  const s = schedule ? scheduleActions(schedule) : undefined;
  act(() => root.render(<Ribbon tab={tab} onTab={noop} a={actions({ schedule: s, ...over })} />));
  return s!;
}
const click = (el: Element) => act(() => (el as HTMLElement).click());
const row = () => document.getElementById('ribbon-tools')!;
const onRow = () => [...row().children].filter((c) => c.matches('.ribbon-group[role="group"]')).map((g) => g.getAttribute('aria-label'));
const group = (caption: string) => document.querySelector(`.ribbon-group[role="group"][aria-label="${caption}"]`)!;
const names = (caption: string) => [...group(caption).querySelectorAll('button:not(.ribbon-split-arrow)')].map((b) => b.querySelector('span')!.textContent);
const tool = (name: string) => [...row().querySelectorAll<HTMLButtonElement>('.ribbon-group button:not(.ribbon-split-arrow)')].find((b) => b.querySelector('span')?.textContent === name)!;
const arrow = (name: string) => tool(name).closest('.ribbon-split')!.querySelector<HTMLButtonElement>('.ribbon-split-arrow')!;
const items = () => [...document.querySelectorAll<HTMLButtonElement>('.ribbon-split-menu button')];
const item = (label: string) => items().find((b) => b.textContent === label)!;
const more = () => row().querySelector<HTMLButtonElement>('.ribbon-group.more > button') ?? null;
const sub = (name: string) => tool(name).querySelector('.ribbon-sub')?.textContent;
const NEW_TOOLS = ['Add circuit', 'Spare', 'Fill down', 'Edit', 'Delete', 'Balance phases', 'Copy', 'Paste', 'Export'];

describe('the Load schedule tab', () => {
  it('has seven groups: Run, Schedule, Circuits and loads, Rows, Balance, Copy and undo, Output', () => {
    show();
    expect(onRow()).toEqual(['Run', 'Schedule', 'Circuits and loads', 'Rows', 'Balance', 'Copy and undo', 'Output']);
    expect(names('Run')).toEqual(['Run']);
    expect(names('Schedule')).toEqual(['Load schedule', 'Board', 'Enclosure']);
    expect(names('Circuits and loads')).toEqual(['Add circuit', 'Spare', 'Add load']);
    expect(names('Rows')).toEqual(['Fill down', 'Edit', 'Delete']);
    expect(names('Balance')).toEqual(['Balance phases']);
    expect(names('Copy and undo')).toEqual(['Copy', 'Paste', 'Undo', 'Redo']);
    expect(names('Output')).toEqual(['Export']);
    // Fill down, Edit and Delete in one column; Copy and Paste, then Undo and Redo, in two.
    expect([...group('Rows').querySelectorAll('.ribbon-stack')].map((c) => c.children.length)).toEqual([3]);
    expect([...group('Copy and undo').querySelectorAll('.ribbon-stack')].map((c) => c.children.length)).toEqual([2, 2]);
    expect(more()).toBeNull(); // nothing under More on a wide window
  });

  it('shows what is out of date under Run, as the SLD tab does', () => {
    show({}, { staleCount: 3 });
    expect(sub('Run')).toBe('3 out of date');
    show();
    expect(sub('Run')).toBeUndefined();
  });

  it('adds a circuit, or a 3-phase circuit from the list', () => {
    const s = show();
    click(tool('Add circuit'));
    expect(s.onAddCircuit).toHaveBeenLastCalledWith();
    click(arrow('Add circuit'));
    expect(items().map((b) => b.textContent)).toEqual(['Circuit', '3-phase circuit']);
    click(item('3-phase circuit'));
    expect(s.onAddCircuit).toHaveBeenLastCalledWith(true);
    expect(items()).toEqual([]);
    click(arrow('Add circuit'));
    click(item('Circuit'));
    expect(s.onAddCircuit).toHaveBeenLastCalledWith();
    expect(s.onAddCircuit).toHaveBeenCalledTimes(3);
  });

  it('adds a spare way, a space, and the 3-phase ones', () => {
    const s = show();
    click(tool('Spare'));
    expect(s.onAddSpare).toHaveBeenLastCalledWith('spare');
    click(arrow('Spare'));
    expect(items().map((b) => b.textContent)).toEqual(['Spare', 'Space', '3-phase spare', '3-phase space']);
    expect(item('3-phase spare').previousElementSibling?.tagName).toBe('HR'); // a line above the 3-phase pair
    click(item('Space'));
    expect(s.onAddSpare).toHaveBeenLastCalledWith('space');
    click(arrow('Spare')); click(item('3-phase spare'));
    expect(s.onAddSpare).toHaveBeenLastCalledWith('spare', true);
    click(arrow('Spare')); click(item('3-phase space'));
    expect(s.onAddSpare).toHaveBeenLastCalledWith('space', true);
  });

  it('keeps Add load as it was', () => {
    const onAddFeeder = vi.fn();
    show({}, { onAddFeeder });
    click(tool('Add load'));
    expect(onAddFeeder).toHaveBeenLastCalledWith({ loadType: 'general' });
    click(arrow('Add load'));
    click(item('Motor'));
    expect(onAddFeeder).toHaveBeenLastCalledWith({ loadType: 'motor', powerFactor: 0.86, demandFactor: 1 });
    show(null);
    expect(tool('Add load').disabled).toBe(false);
  });

  it('fills down, and edits or deletes the circuit of the active row, greyed until there is one', () => {
    let s = show();
    click(tool('Fill down'));
    expect(s.onFillDown).toHaveBeenCalledTimes(1);
    expect(tool('Fill down').title).toContain('Ctrl/⌘ D');
    for (const n of ['Edit', 'Delete']) { expect(tool(n).disabled, n).toBe(true); expect(tool(n).title, n).toBe('Click a circuit row on the schedule first'); }
    s = show({ row: 'Y3' });
    expect(tool('Edit').title).toContain('Edit circuit Y3');
    expect(tool('Delete').title).toBe('Delete circuit Y3');
    click(tool('Edit'));
    expect(s.onEditRow).toHaveBeenCalledTimes(1);
    click(tool('Delete'));
    expect(s.onDeleteRow).toHaveBeenCalledTimes(1);
  });

  it('balances the phases and shows the imbalance; greyed with fewer than two circuits', () => {
    let s = show({ imbalancePct: 27 });
    expect(sub('Balance phases')).toBe('27 % apart');
    click(tool('Balance phases'));
    expect(s.onBalance).toHaveBeenCalledTimes(1);
    expect(tool('Balance phases').title).toContain('Lighting circuits first');
    s = show({ canBalance: false, imbalancePct: 0 });
    expect(tool('Balance phases').disabled).toBe(true);
    expect(sub('Balance phases')).toBe('0 % apart');
    show({ canBalance: false, imbalancePct: undefined });
    expect(sub('Balance phases')).toBeUndefined();
  });

  it('copies, pastes, undoes and redoes', () => {
    const onUndo = vi.fn(), onRedo = vi.fn();
    let s = show({}, { onUndo, onRedo, canUndo: true });
    click(tool('Copy'));
    expect(s.onCopy).toHaveBeenCalledTimes(1);
    click(tool('Paste'));
    expect(s.onPaste).toHaveBeenCalledTimes(1);
    click(tool('Undo'));
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(tool('Redo').disabled).toBe(true);
    s = show({}, { onRedo, canRedo: true });
    click(tool('Redo'));
    expect(onRedo).toHaveBeenCalledTimes(1);
  });

  it('exports: Excel on the press, then the list', () => {
    const s = show();
    click(tool('Export'));
    expect(s.onExport).toHaveBeenLastCalledWith('excel');
    click(arrow('Export'));
    expect(items().map((b) => b.textContent)).toEqual(['Excel: this form', 'PDF: this form', 'CSV', 'Submission pack (Excel)', 'My Excel template…']);
    expect(item('Submission pack (Excel)').previousElementSibling?.tagName).toBe('HR');
    for (const [label, kind] of [['Excel: this form', 'excel'], ['PDF: this form', 'pdf'], ['CSV', 'csv'], ['Submission pack (Excel)', 'pack'], ['My Excel template…', 'template']] as const) {
      if (!items().length) click(arrow('Export'));
      click(item(label));
      expect(s.onExport, label).toHaveBeenLastCalledWith(kind);
    }
    expect(s.onExport).toHaveBeenCalledTimes(6);
  });

  it('says Exporting… and greys Export while one runs', () => {
    show({ exporting: true });
    expect(sub('Export')).toBe('Exporting…');
    expect(tool('Export').disabled).toBe(true);
    show();
    expect(sub('Export')).toBeUndefined();
    expect(tool('Export').disabled).toBe(false);
  });

  it('greys every new tool away from the Load schedule page (the Enclosure page)', () => {
    show(null, { view: 'enclosure' });
    for (const n of NEW_TOOLS) { expect(tool(n).disabled, n).toBe(true); expect(tool(n).title, n).toBe('On the Load schedule page'); }
    expect(arrow('Export').disabled).toBe(true);
    for (const n of ['Run', 'Load schedule', 'Board', 'Enclosure', 'Add load']) expect(tool(n).disabled, n).toBe(false);
  });

  it('greys the grid tools on the other forms, and keeps Export; CSV and the template are DB-only', () => {
    show({ grid: false, row: undefined });
    for (const n of ['Add circuit', 'Spare', 'Fill down', 'Edit', 'Delete', 'Balance phases', 'Copy', 'Paste']) { expect(tool(n).disabled, n).toBe(true); expect(tool(n).title, n).toBe('On the DB load schedule form'); }
    expect(sub('Balance phases')).toBeUndefined();
    expect(tool('Export').disabled).toBe(false);
    click(tool('Export'));
    click(arrow('Export'));
    expect(item('PDF: this form').disabled).toBe(false);
    expect(item('Submission pack (Excel)').disabled).toBe(false);
    expect(item('CSV').disabled).toBe(true);
    expect(item('My Excel template…').disabled).toBe(true);
    expect(tool('Undo').disabled).toBe(true); // Undo and Redo follow the project history, not the form
    show({ grid: false }, { canUndo: true });
    expect(tool('Undo').disabled).toBe(false);
  });
});

describe('the Load schedule tab on a narrow window', () => {
  /** A row that needs 400 px and 200 px for each group on it, in a window `width` wide. */
  let width = 2400;
  beforeEach(() => {
    width = 2400;
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) { return this.id === 'ribbon-tools' ? 400 + [...this.children].filter((c) => c.matches('.ribbon-group[role="group"]')).length * 200 : 0; });
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) { return this.id === 'ribbon-tools' ? width : 0; });
  });
  const resize = (w: number) => act(() => { width = w; window.dispatchEvent(new Event('resize')); });
  const under = () => [...document.querySelectorAll('.ribbon-over > .ribbon-group')].map((g) => g.getAttribute('aria-label'));

  it('moves Output, Copy and undo, Balance and Rows under More, from the right, and brings them back', () => {
    show();
    expect(onRow()).toHaveLength(7);
    expect(more()).toBeNull();
    resize(1500); // room for five
    expect(onRow()).toEqual(['Run', 'Schedule', 'Circuits and loads', 'Rows', 'Balance']);
    expect(more()!.title).toBe('More tools: Copy and undo, Output');
    click(more()!);
    expect(under()).toEqual(['Copy and undo', 'Output']);
    expect(document.querySelector('.ribbon-over-list')).toBeNull(); // no list of other tools on this tab
    resize(2400);
    expect(onRow()).toHaveLength(7);
    expect(more()).toBeNull();
  });

  it('never moves the first three groups', () => {
    show();
    resize(900);
    expect(onRow()).toEqual(['Run', 'Schedule', 'Circuits and loads']);
    click(more()!);
    expect(under()).toEqual(['Rows', 'Balance', 'Copy and undo', 'Output']);
  });

  it('works the tools under More, and puts the panel away after one, keeping it while a list is open', () => {
    const s = show();
    resize(900);
    click(more()!);
    click(tool('Balance phases'));
    expect(s.onBalance).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.ribbon-over')).toBeNull();
    click(more()!);
    click(arrow('Export'));
    expect(document.querySelector('.ribbon-over')).not.toBeNull();
    click(item('CSV'));
    expect(s.onExport).toHaveBeenLastCalledWith('csv');
    click(more()!);
    click(tool('Fill down'));
    expect(s.onFillDown).toHaveBeenCalledTimes(1);
  });

  it('measures again when the imbalance or an export is written on the row', () => {
    show({ imbalancePct: 5 });
    expect(onRow()).toHaveLength(7);
    width = 1500; // the row is now too wide, though nothing resized the window
    show({ imbalancePct: 6 });
    expect(onRow()).toHaveLength(5);
  });

  it('keeps the SLD tab\'s overflow, with its list of other tools', () => {
    show({}, { sld: { fails: 0, warns: 0, onCheck: noop, onArm: noop, onHvSupply: noop, system: true, layers: DEFAULT_LAYERS, onLayers: noop, colorBy: 'none', onColorBy: noop, supply: 'normal', onSupply: noop, hasGenerator: false, outages: [], canCopy: false, onCopy: noop, canPaste: false, onPaste: noop, onFit: noop, onExport: noop }, view: 'design' }, 'sld');
    expect(onRow()).toHaveLength(9);
    resize(1900);
    expect(onRow()).toHaveLength(7);
    expect(more()!.title).toBe('More tools: View, Output and the other tools');
    click(more()!);
    expect(under()).toEqual(['View', 'Output']);
    expect(document.querySelector('.ribbon-over-list')).not.toBeNull();
  });
});
