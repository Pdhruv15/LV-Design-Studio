// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Ribbon, { type RibbonActions, type RibbonTab } from './Ribbon';
import { DEFAULT_LAYERS } from '../diagram/annotations';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Sld = NonNullable<RibbonActions['sld']>;
const noop = () => {};
const sldActions = (over: Partial<Sld> = {}): Sld => ({
  fails: 0, warns: 0, onCheck: vi.fn(), onArm: vi.fn(), onHvSupply: vi.fn(), system: true,
  layers: DEFAULT_LAYERS, onLayers: vi.fn(), colorBy: 'none', onColorBy: vi.fn(), supply: 'normal', onSupply: vi.fn(), hasGenerator: false, outages: [],
  canCopy: false, onCopy: vi.fn(), canPaste: false, onPaste: vi.fn(), onFit: vi.fn(), onExport: vi.fn(), ...over
});
const actions = (over: Partial<RibbonActions> = {}): RibbonActions => ({
  view: 'design', onView: noop, tool: 'select', onTool: noop, boardId: 'MDB-1', selectedFeederId: null, selection: { kind: 'board', id: 'MDB-1' },
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

/** The SLD tab with these SLD actions (none: without them) and other actions; returns the SLD actions given. */
function show(sld: Partial<Sld> | null = {}, over: Partial<RibbonActions> = {}, tab: RibbonTab = 'sld') {
  const s = sld ? sldActions(sld) : undefined;
  act(() => root.render(<Ribbon tab={tab} onTab={noop} a={actions({ sld: s, ...over })} />));
  return s!;
}
const click = (el: Element) => act(() => (el as HTMLElement).click());
const row = () => document.getElementById('ribbon-tools')!;
/** The groups on the row, left to right (not those under More). */
const onRow = () => [...row().children].filter((c) => c.matches('.ribbon-group[role="group"]')).map((g) => g.getAttribute('aria-label'));
const group = (caption: string) => document.querySelector(`.ribbon-group[role="group"][aria-label="${caption}"]`)!;
const names = (caption: string) => [...group(caption).querySelectorAll('button:not(.ribbon-split-arrow)')].map((b) => b.querySelector('span')!.textContent);
const tool = (name: string) => [...row().querySelectorAll<HTMLButtonElement>('.ribbon-group button:not(.ribbon-split-arrow)')].find((b) => b.querySelector('span')?.textContent === name)!;
const arrow = (name: string) => tool(name).closest('.ribbon-split')!.querySelector<HTMLButtonElement>('.ribbon-split-arrow')!;
const items = () => [...document.querySelectorAll<HTMLButtonElement>('.ribbon-split-menu button')];
const item = (label: string) => items().find((b) => b.textContent === label)!;
const more = () => row().querySelector<HTMLButtonElement>('.ribbon-group.more > button')!;

describe('the SLD tab', () => {
  it('keeps its five groups first and adds Results, Copy and undo, View and Output after them', () => {
    show();
    expect(onRow()).toEqual(['Run and check', 'Canvas', 'Boards', 'Equipment', 'Selection', 'Results', 'Copy and undo', 'View', 'Output']);
    expect(names('Run and check')).toEqual(['Run', 'Check']);
    expect(names('Canvas')).toEqual(['SLD', 'Sheets', 'Select', 'Pan']);
    expect(names('Boards')).toEqual(['Boards', 'Board', 'Schedule', 'Enclosure']);
    expect(names('Equipment')).toEqual(['Supply', 'Add load', 'Devices']);
    expect(names('Selection')).toEqual(['Edit', 'Delete']);
    expect(names('Results')).toEqual(['Values', 'Colour by', 'Scenario']);
    expect(names('Copy and undo')).toEqual(['Copy', 'Paste', 'Undo', 'Redo']);
    // Copy and Paste in one column, Undo and Redo in the next.
    expect([...group('Copy and undo').querySelectorAll('.ribbon-stack')].map((c) => c.children.length)).toEqual([2, 2]);
    expect(names('View')).toEqual(['Fit']);
    expect(names('Output')).toEqual(['Export']);
  });

  it('shows what is out of date under Run and what fails under Check, which goes to the next circuit', () => {
    let s = show({ fails: 2, warns: 5 }, { staleCount: 3 });
    expect(tool('Run').querySelector('.ribbon-sub')!.textContent).toBe('3 out of date');
    expect(tool('Check').querySelector('.ribbon-sub')!.textContent).toBe('2 fail');
    click(tool('Check'));
    expect(s.onCheck).toHaveBeenCalledTimes(1);
    s = show({ warns: 5 });
    expect(tool('Run').querySelector('.ribbon-sub')).toBeNull();
    expect(tool('Check').querySelector('.ribbon-sub')!.textContent).toBe('5 to check');
    expect(tool('Check').disabled).toBe(false);
    show();
    expect(tool('Check').disabled).toBe(true);
    expect(tool('Check').title).toBe('Every circuit is within limits');
    expect(tool('Check').querySelector('.ribbon-sub')).toBeNull();
  });

  it('offers the equipment library\'s supply items under Supply and its devices under Devices', () => {
    const s = show();
    click(tool('Supply'));
    expect(s.onArm).toHaveBeenLastCalledWith({ kind: 'transformer' }, 'Transformer');
    click(arrow('Supply'));
    expect(items().map((b) => b.textContent)).toEqual(['Transformer', 'Meter cabinet', 'Bus coupler / tie', 'Generator + ATS', 'Generator + interlocked ACBs', 'HV supply and RMUs…']);
    click(item('Generator + interlocked ACBs'));
    expect(s.onArm).toHaveBeenLastCalledWith({ kind: 'generator', changeover: 'ACB' }, 'Generator + interlocked ACBs');
    expect(items()).toEqual([]);
    click(arrow('Supply'));
    click(item('HV supply and RMUs…'));
    expect(s.onHvSupply).toHaveBeenCalledTimes(1);
    click(tool('Devices'));
    expect(items().map((b) => b.textContent)).toEqual(['ACB', 'MCCB', 'MCB', 'Isolator', 'kWh meter', 'CT metering', 'Earth leakage (RCD)', 'Local isolator', 'Surge protection (SPD)', 'Power meter (PMU) to BMS', 'Capacitor bank']);
    click(item('Capacitor bank'));
    expect(s.onArm).toHaveBeenLastCalledWith({ kind: 'capacitor' }, 'Capacitor bank');
  });

  it('shows each result setting beside its name; Values stays open while ticking, the other lists close on a choice', () => {
    const s = show({ colorBy: 'vd', outages: ['MDB-2'] });
    expect(tool('Values').textContent).toBe('Values3 shown');
    expect(tool('Colour by').textContent).toBe('Colour byVoltage drop');
    expect(tool('Scenario').textContent).toBe('ScenarioNormal');
    click(tool('Values'));
    expect(items().map((b) => `${b.textContent}:${b.getAttribute('aria-checked')}`)).toEqual(['Current (A):true', 'Bus voltage:true', 'Voltage drop:true', 'Fault current:false', 'Power factor:false', 'Loading %:false']);
    click(item('Fault current'));
    expect(s.onLayers).toHaveBeenLastCalledWith({ ...DEFAULT_LAYERS, fault: true });
    expect(items()).toHaveLength(6); // still open for the next tick
    click(tool('Colour by'));
    expect(item('Voltage drop').getAttribute('aria-checked')).toBe('true');
    click(item('Fault duty'));
    expect(s.onColorBy).toHaveBeenLastCalledWith('fault');
    expect(items()).toEqual([]);
    click(tool('Scenario'));
    expect(items().map((b) => b.textContent)).toEqual(['Normal supply', 'On generator (mains lost)', 'Transformer of MDB-2 failed']);
    expect(item('On generator (mains lost)').disabled).toBe(true); // no generator in the project
    click(item('Transformer of MDB-2 failed'));
    expect(s.onSupply).toHaveBeenLastCalledWith('outage:MDB-2');
    show({ supply: 'outage:MDB-2', outages: ['MDB-2'] });
    expect(tool('Scenario').textContent).toBe('ScenarioMDB-2 transformer out');
    show({ supply: 'generator', hasGenerator: true });
    expect(tool('Scenario').textContent).toBe('ScenarioOn generator');
  });

  it('greys the result lists and Fit away from the system diagram', () => {
    show({ system: false });
    for (const name of ['Values', 'Colour by', 'Scenario', 'Fit']) { expect(tool(name).disabled, name).toBe(true); expect(tool(name).title, name).toBe('On the system diagram'); }
    expect(tool('Export').disabled).toBe(false); // Export shows the system diagram first
  });

  it('copies, pastes, undoes, redoes, fits and exports', () => {
    const onUndo = vi.fn(), onRedo = vi.fn(), onExportDss = vi.fn();
    let s = show({ canCopy: true }, { onUndo, onRedo, canUndo: true, onExportDss });
    expect(tool('Paste').disabled).toBe(true);
    expect(tool('Paste').title).toBe('Copy a board first');
    expect(tool('Redo').disabled).toBe(true);
    click(tool('Copy'));
    expect(s.onCopy).toHaveBeenCalledTimes(1);
    click(tool('Undo'));
    expect(onUndo).toHaveBeenCalledTimes(1);
    click(tool('Fit'));
    expect(s.onFit).toHaveBeenCalledTimes(1);
    click(tool('Export'));
    expect(s.onExport).toHaveBeenCalledTimes(1);
    click(arrow('Export'));
    expect(items().map((b) => b.textContent)).toEqual(['Drawing: SVG, DXF, DWG or PDF…', 'OpenDSS (.dss)']);
    click(item('OpenDSS (.dss)'));
    expect(onExportDss).toHaveBeenCalledTimes(1);
    s = show({ canCopy: true, canPaste: true, copied: 'SMDB-2' }, { onRedo, canRedo: true });
    expect(tool('Paste').title).toContain('Paste SMDB-2 on MDB-1');
    click(tool('Paste'));
    expect(s.onPaste).toHaveBeenCalledTimes(1);
    click(tool('Redo'));
    expect(onRedo).toHaveBeenCalledTimes(1);
    show({ copied: 'SMDB-2' });
    expect(tool('Copy').disabled).toBe(true);
    expect(tool('Paste').title).toBe('Select the board to paste it on');
  });

  it('keeps the other tools under More; the OpenDSS export is under Export', () => {
    const onView = vi.fn();
    show({}, { onView });
    click(more());
    const list = [...document.querySelectorAll<HTMLButtonElement>('.ribbon-menu [role="menuitem"]')];
    expect(list.map((b) => b.textContent)).toEqual(['Load flow (OpenDSS / pandapower)', 'Quick calcs', 'Calculation report', 'Project settings']);
    click(list[2]);
    expect(onView).toHaveBeenLastCalledWith('report');
    expect(document.querySelector('.ribbon-menu')).toBeNull();
  });

  it('greys its own tools without the SLD actions', () => {
    show(null);
    for (const name of ['Check', 'Supply', 'Devices', 'Values', 'Colour by', 'Scenario', 'Copy', 'Paste', 'Fit', 'Export']) expect(tool(name).disabled, name).toBe(true);
    for (const name of ['Run', 'SLD', 'Select', 'Boards', 'Board', 'Add load', 'Edit', 'Delete']) expect(tool(name).disabled, name).toBe(false);
  });

  it('leaves the Load schedule tab with its own Run and Add load', () => {
    show({ fails: 2 }, { staleCount: 3 }, 'schedule');
    expect(onRow()).toEqual(['Run', 'Schedule', 'Equipment']);
    expect(names('Run')).toEqual(['Run']);
    expect(tool('Run').querySelector('.ribbon-sub')).toBeNull();
    expect(names('Equipment')).toEqual(['Add load']);
  });
});

describe('the SLD tab on a narrow window', () => {
  /** A row that needs 400 px and 200 px for each group on it, in a window `width` wide. */
  let width = 2400;
  beforeEach(() => {
    width = 2400;
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) { return this.id === 'ribbon-tools' ? 400 + [...this.children].filter((c) => c.matches('.ribbon-group[role="group"]')).length * 200 : 0; });
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) { return this.id === 'ribbon-tools' ? width : 0; });
  });
  const resize = (w: number) => act(() => { width = w; window.dispatchEvent(new Event('resize')); });
  const under = () => [...document.querySelectorAll('.ribbon-over > .ribbon-group')].map((g) => g.getAttribute('aria-label'));

  it('moves the groups that do not fit under More, from the right, and brings them back on a wide one', () => {
    show();
    expect(onRow()).toHaveLength(9);
    resize(1900); // room for seven
    expect(onRow()).toEqual(['Run and check', 'Canvas', 'Boards', 'Equipment', 'Selection', 'Results', 'Copy and undo']);
    expect(more().title).toBe('More tools: View, Output and the other tools');
    click(more());
    expect(under()).toEqual(['View', 'Output']);
    expect([...document.querySelectorAll('.ribbon-over-list [role="menuitem"]')].map((b) => b.textContent)).toEqual(['Load flow (OpenDSS / pandapower)', 'Quick calcs', 'Calculation report', 'Project settings']);
    resize(2400);
    expect(onRow()).toHaveLength(9);
    expect(more().title).toBe('More tools');
  });

  it('never moves the five groups the tab has always had', () => {
    show();
    resize(900);
    expect(onRow()).toEqual(['Run and check', 'Canvas', 'Boards', 'Equipment', 'Selection']);
    click(more());
    expect(under()).toEqual(['Results', 'Copy and undo', 'View', 'Output']);
  });

  it('puts the panel away when a tool in it is used, and keeps it while a list is open or a value is ticked', () => {
    const s = show();
    resize(900);
    click(more());
    click(tool('Values'));
    expect(document.querySelector('.ribbon-over')).not.toBeNull();
    click(item('Power factor'));
    expect(s.onLayers).toHaveBeenLastCalledWith({ ...DEFAULT_LAYERS, pf: true });
    expect(document.querySelector('.ribbon-over')).not.toBeNull();
    click(tool('Colour by'));
    click(item('Voltage drop'));
    expect(s.onColorBy).toHaveBeenLastCalledWith('vd');
    expect(document.querySelector('.ribbon-over')).toBeNull();
    click(more());
    click(tool('Fit'));
    expect(s.onFit).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.ribbon-over')).toBeNull();
  });
});
