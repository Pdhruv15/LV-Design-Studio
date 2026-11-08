// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Ribbon, { type RibbonActions } from './Ribbon';
import { NO_SHEET_ACTIONS, type SheetUi } from './sld/sheetUi';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement;
beforeEach(() => { localStorage.clear(); host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; vi.restoreAllMocks(); vi.useRealTimers(); });

const noop = () => {};
type Cad = NonNullable<RibbonActions['cad']>;
const BASE = {
  view: 'cad', onView: noop, tool: 'select', onTool: noop, boardId: 'MDB-1', selectedFeederId: null, selection: null,
  onAddFeeder: noop, onAddBoard: noop, onBoardProperties: noop, onEditSelected: noop, onDeleteSelected: noop, onExportDss: noop, onSettings: noop,
  onUndo: noop, onRedo: noop, canUndo: false, canRedo: false, onRun: noop, staleCount: 0,
  onNew: noop, onSave: noop, onSaveAs: noop, onAnonymizedSample: noop, onProfile: noop, onChooseFolder: noop, folderLabel: 'Folder: Projects',
  dirty: false, recent: [], onOpenRecent: noop, dbIssues: 0, inboxCount: 0,
  onBom: noop, hasPriceList: false, stage: 'detailed', nextStage: 'ifc', ifcIssued: false, onAdvanceStage: noop, route: 'from-ifc', onRoute: noop, onConceptReport: noop
};
const sheetUi = (over: Partial<SheetUi> = {}): SheetUi => ({ tool: 'select', setTool: noop, color: 'black', setColor: noop, size: 3.5, setSize: noop, selId: null, setSelId: noop,
  zoom: 'fit', setZoom: noop, pct: '64 %', setPct: noop, side: false, setSide: noop, actions: { current: NO_SHEET_ACTIONS }, ...over });
const sheets = (over: Partial<NonNullable<RibbonActions['sheets']>> = {}): RibbonActions['sheets'] => ({ tab: 'sheets', open: true, onTab: noop, ui: sheetUi(), kind: 'system',
  publish: { label: 'Rev C…', title: 'Changed since Rev B was issued', changed: true }, legend: { on: true, shown: true }, onLegend: noop, ...over });

/** The ribbon on Design CAD with a drawing open; `over` changes Design CAD's actions, `a` the rest. */
function show(over: Partial<Cad> = {}, a: Partial<RibbonActions> = {}) {
  const cad = {
    tool: 'none', onTool: vi.fn(), onOpen: vi.fn(), onSave: vi.fn(), onSaveDwg: vi.fn(), onClose: vi.fn(), onDelete: noop, hasSelection: false, onFit: noop, onLayers: noop, layersOn: true, hasDrawing: true,
    file: { plans: [{ label: 'Ground floor · gf.dwg', title: 'Open gf.dwg', onClick: vi.fn() }], level: 'Ground floor', levelTitle: 'The level', levels: [{ label: 'Ground floor', title: '', onClick: noop }], unit: 'mm', unitTitle: 'The units', units: [{ label: 'Millimetres ✓', title: '', onClick: noop }] },
    onRoles: noop, rolesOn: false, onAddFound: noop, onSchedules: noop, onPlaceBoard: noop, placingBoard: false, onCoverage: noop, coverageOn: false, copyLevels: [], onWireAll: noop, onTags: noop, tagsOn: false,
    onCommand: vi.fn(), onLayoutCmd: vi.fn(), onLabels: vi.fn(), onToggle: vi.fn(), toggles: { snap: false, osnap: true, ortho: false, grid: false, dyn: true }, onProps: vi.fn(), onHistory: vi.fn(), ...over
  } as Cad;
  let props = { ...BASE, cad, ...a } as unknown as RibbonActions;
  act(() => root.render(<Ribbon tab="cad" onTab={noop} a={props} />));
  return { cad, rerender: (more: Partial<Cad> = {}, moreA: Partial<RibbonActions> = {}) => { props = { ...props, ...moreA, cad: { ...props.cad!, ...more } }; act(() => root.render(<Ribbon tab="cad" onTab={noop} a={props} />)); } };
}
const tab = (label: string) => [...document.querySelectorAll('[aria-label="Design CAD"] [role="tab"]')].find((b) => b.textContent === label) as HTMLButtonElement;
const pick = (label: string) => act(() => { tab(label).click(); });
const selected = () => document.querySelector('[aria-label="Design CAD"] [aria-selected="true"]')!.textContent;
/** The groups shown, in order, and the tools (their names) in one. */
const groups = () => [...document.querySelectorAll('#ribbon-tools > [role="group"]')].sort((x, y) => Number((x as HTMLElement).style.order) - Number((y as HTMLElement).style.order)).map((g) => g.getAttribute('aria-label'));
const group = (name: string) => document.querySelector(`[role="group"][aria-label="${name}"]`) as HTMLElement;
const tools = (name: string) => [...group(name).querySelectorAll('button[aria-label]')].map((b) => b.getAttribute('aria-label'));
const tool = (name: string) => document.querySelector(`#ribbon-tools button[aria-label="${name}"]`) as HTMLButtonElement;
const click = (b: Element) => act(() => { (b as HTMLButtonElement).click(); });
const fileButton = () => document.querySelector('.ribbon-file > button') as HTMLButtonElement;
const items = () => [...document.querySelectorAll('[role="menu"][aria-label="File"] > button, [role="menu"][aria-label="File"] > .ribbon-file-sub > button')].map((b) => b.querySelector('span')!.textContent);
const item = (label: string) => [...document.querySelectorAll('[role="menuitem"]')].find((b) => (b.querySelector('span')?.textContent ?? b.textContent) === label) as HTMLButtonElement;

describe('Design CAD ribbon: sub-tabs by use', () => {
  it('opens on Draw the first time, then on the sub-tab used last; a running tool shows its sub-tab', () => {
    show();
    expect(selected()).toBe('Draw');
    pick('Modify');
    expect(localStorage.getItem('lvds.cadSub')).toBe('modify');
    act(() => root.unmount());
    root = createRoot(host);
    const again = show();
    expect(selected()).toBe('Modify');
    again.rerender({ tool: 'tray' });
    expect(selected()).toBe('Electrical & ELV');
    again.rerender({ tool: 'text' });
    expect(selected()).toBe('Annotate');
  });

  it('Draw has the tools that create geometry, Modify those that change it; each tool is on one sub-tab', () => {
    show();
    expect(['Lines', 'Curves', 'Fill'].map(tools)).toEqual([['Line', 'Polyline', 'Rectangle'], ['Circle', 'Arc'], ['Hatch']]);
    pick('Modify');
    expect(tools('Transform')).toEqual(['Move', 'Copy', 'Rotate', 'Mirror', 'Scale', 'Stretch']);
    expect(tools('Shape')).toEqual(['Trim', 'Extend', 'Offset', 'Fillet', 'Chamfer', 'Break', 'Join', 'Explode']);
    const seen: string[] = [];
    const panels: Record<string, (string | null)[]> = {};
    for (const label of ['Draw', 'Modify', 'Annotate', 'Insert', 'Layers', 'View', 'Page setup', 'Tools', 'Electrical & ELV']) {
      pick(label);
      panels[label] = groups();
      seen.push(...[...document.querySelectorAll('#ribbon-tools button[aria-label]')].map((b) => b.getAttribute('aria-label')!));
    }
    expect(seen.filter((x, i) => seen.indexOf(x) !== i)).toEqual([]); // no tool twice
    expect(panels).toEqual({
      Draw: ['Lines', 'Curves', 'Fill'], Modify: ['Transform', 'Shape', 'Pattern', 'Erase', 'Properties'], Annotate: ['Text', 'Dimensions', 'Leaders', 'Marks'], Insert: ['Reference'],
      Layers: ['Layers', 'Visibility', 'Roles'], View: ['Navigate', 'Palettes', 'Display'], 'Page setup': ['Sheet set', 'Layouts'], Tools: ['Measure'],
      'Electrical & ELV': ['Rooms', 'Cables and boards', 'Devices', 'Edit devices', 'Wiring']
    });
  });

  it('runs each tool\'s command; a tool with only a list opens it from the whole button', () => {
    const { cad } = show();
    pick('Modify');
    click(tool('Offset'));
    expect(cad.onTool).toHaveBeenLastCalledWith('offset');
    click(tool('Extend'));
    expect(cad.onTool).toHaveBeenLastCalledWith('extend');
    pick('Annotate');
    click(tool('Text style'));
    click(tool('Dimension style'));
    pick('Insert');
    click(tool('Attach'));
    click(tool('Clip'));
    pick('Layers');
    click(tool('New layer'));
    click(tool('Isolate'));
    click(tool('Unisolate'));
    expect((cad.onCommand as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])).toEqual(['STYLE', 'DIMSTYLE', 'XATTACH', 'XCLIP', 'LAYER N', 'LAYISO', 'LAYUNISO']);
    pick('View');
    click(tool('Grid'));
    click(tool('Dynamic input'));
    expect((cad.onToggle as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])).toEqual(['grid', 'dyn']);
    expect(tool('Object snap').getAttribute('aria-pressed')).toBe('true');
    click(tool('Properties'));
    click(tool('Command history'));
    expect([cad.onProps, cad.onHistory].map((f) => (f as ReturnType<typeof vi.fn>).mock.calls.length)).toEqual([1, 1]);
    pick('Page setup');
    const layout = tool('New layout');
    expect(layout.getAttribute('aria-haspopup')).toBe('menu');
    click(layout);
    click(item('Power layout'));
    expect(cad.onLayoutCmd).toHaveBeenLastCalledWith('LAYOUT POWER');
    expect(tool('Page setup').disabled).toBe(true); // a layout's: open a layout tab first
  });
});

describe('Design CAD ribbon: icons only, the name on hover', () => {
  it('shows a tool\'s name, command and what it does after a short rest, and hides it when the mouse leaves', () => {
    vi.useFakeTimers();
    show();
    pick('Modify');
    const offset = tool('Offset');
    expect(offset.textContent).toBe(''); // the icon only
    act(() => { offset.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
    act(() => { vi.advanceTimersByTime(399); });
    expect(document.querySelector('#ribbon-tip')).toBeNull();
    act(() => { vi.advanceTimersByTime(1); });
    const tip = document.querySelector('#ribbon-tip')!;
    expect(tip.getAttribute('role')).toBe('tooltip');
    expect(tip.querySelector('b')!.textContent).toBe('Offset (O)');
    expect(tip.textContent).toBe('Offset (O)The distance on the right, click the object, then the side; a tray is copied as a tray of the same width and route');
    expect(offset.getAttribute('aria-describedby')).toBe('ribbon-tip');
    act(() => { offset.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })); });
    expect(document.querySelector('#ribbon-tip')).toBeNull();
  });

  it('shows the tooltip of a greyed tool too; running along the icons, the next shows at once', () => {
    vi.useFakeTimers();
    show({ hasDrawing: false });
    const line = tool('Line'), pline = tool('Polyline');
    expect(line.disabled).toBe(true); // no drawing open
    act(() => { line.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
    act(() => { vi.advanceTimersByTime(400); });
    expect(document.querySelector('#ribbon-tip b')!.textContent).toBe('Line (L)');
    act(() => { line.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: pline })); });
    act(() => { pline.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: line })); });
    expect(document.querySelector('#ribbon-tip b')!.textContent).toBe('Polyline (PL)'); // no wait
    act(() => { pline.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })); });
    act(() => { vi.advanceTimersByTime(600); }); // a pause: the next waits again
    act(() => { line.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
    expect(document.querySelector('#ribbon-tip')).toBeNull();
    act(() => { vi.advanceTimersByTime(400); });
    expect(document.querySelector('#ribbon-tip b')!.textContent).toBe('Line (L)');
  });

  it('Show labels puts each name under its icon, three small tools to a column (two with icons only)', () => {
    const { cad, rerender } = show();
    const box = document.querySelector('.ribbon-labels input') as HTMLInputElement;
    expect(box.checked).toBe(false);
    act(() => { box.click(); });
    expect(cad.onLabels).toHaveBeenLastCalledWith(true);
    rerender({ labels: true });
    pick('Modify');
    const cols = [...group('Shape').querySelectorAll('.ribbon-stack')].map((c) => [...c.querySelectorAll('button span')].map((s) => s.textContent));
    expect(cols).toEqual([['Trim', 'Extend', 'Offset'], ['Fillet', 'Chamfer', 'Break'], ['Join', 'Explode']]);
    expect(group('Shape').querySelector('button[title^="Offset (O)"]')).not.toBeNull();
    rerender({ labels: false });
    expect([...group('Shape').querySelectorAll('.ribbon-stack')].map((c) => c.querySelectorAll('button').length)).toEqual([2, 2, 2, 2]);
  });
});

describe('Design CAD ribbon: File', () => {
  it('holds open, the plans of each level, save, close and close all, and the level and units; greyed with no drawing', () => {
    show({ hasDrawing: false });
    click(fileButton());
    expect(items()).toEqual(['Open…', 'Plans of each level', 'Save DXF', 'Save DWG', 'Close', 'Close all', 'Level: Ground floor', 'Units: mm']);
    const off = ['Save DXF', 'Save DWG', 'Close', 'Close all', 'Level: Ground floor', 'Units: mm'];
    for (const label of items()) expect(item(label!).disabled, label!).toBe(off.includes(label!));
  });

  it('runs what is picked and closes; the plans and units are lists beside it; Esc closes it, not the command', () => {
    const { cad } = show({ reopen: { label: 'Reopen gf.dwg', title: 'Open it again', onClick: vi.fn() } });
    click(fileButton());
    expect(items()).toContain('Reopen gf.dwg');
    click(item('Close all'));
    expect(cad.onCommand).toHaveBeenLastCalledWith('CLOSEALL');
    expect(document.querySelector('[role="menu"][aria-label="File"]')).toBeNull();
    click(fileButton());
    act(() => { item('Plans of each level').dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
    click(item('Ground floor · gf.dwg'));
    expect(cad.file.plans![0].onClick).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="menu"][aria-label="File"]')).toBeNull();
    click(fileButton());
    click(item('Units: mm'));
    expect(document.querySelector('[role="menu"][aria-label="Units: mm"]')!.textContent).toBe('Millimetres ✓');
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => { document.dispatchEvent(esc); });
    expect(esc.defaultPrevented).toBe(true);
    expect(document.querySelector('[role="menu"][aria-label="File"]')).toBeNull();
  });
});

describe('Design CAD ribbon: sheets and layouts', () => {
  it('on the sheets pages: Page setup has the sheet set and export, Annotate the markup, View the sheet\'s view', () => {
    const onView = vi.fn();
    show({}, { view: 'drawings', onView, sheets: sheets({ ui: sheetUi({ tool: 'cloud' }) }) });
    expect(selected()).toBe('Page setup');
    expect(groups()).toEqual(['Sheet set', 'Plot', 'Issue and export']);
    expect(tool('Publish').className).toContain('stale');
    for (const l of ['PDF', 'DXF', 'DWG']) expect(tool(l).disabled, l).toBe(false);
    pick('Annotate');
    expect(groups()).toEqual(['Markup', 'On panels']);
    expect(tool('Cloud').getAttribute('aria-pressed')).toBe('true');
    expect(tool('Panel cloud').disabled).toBe(false);
    expect(tool('Delete').disabled).toBe(true); // nothing selected
    pick('View');
    expect(groups()).toEqual(['Sheet']);
    expect(tool('Side by side').disabled).toBe(false);
    expect(onView).not.toHaveBeenCalled();
    pick('Draw');
    expect(onView).toHaveBeenLastCalledWith('cad'); // a drafting sub-tab shows the drawing
  });

  it('greys the sheet tools with no sheet open, and keeps panel tools to system SLD sheets', () => {
    show({}, { view: 'drawings', sheets: sheets({ open: false }) });
    expect(tool('All sheets').disabled).toBe(false);
    for (const l of ['Publish', 'DWG']) expect(tool(l).disabled, l).toBe(true);
    pick('Annotate');
    for (const l of ['Cloud', 'Colour']) expect(tool(l).disabled, l).toBe(true);
    act(() => root.unmount());
    root = createRoot(host);
    show({}, { view: 'drawings', sheets: sheets({ kind: 'earthing' }) });
    pick('Annotate');
    expect(tool('Panel cloud').disabled).toBe(true);
  });

  it('on a layout: Page setup has its layouts and viewports; on the paper Annotate has its markup, in the model the drawing\'s', () => {
    const { rerender } = show({ inLayout: true, onPaper: true }, { sheets: sheets({ open: false, kind: 'plan' }) });
    pick('Page setup');
    expect(groups()).toEqual(['Sheet set', 'Layouts', 'Viewports']);
    expect(tool('Page setup').disabled).toBe(false);
    pick('Annotate');
    expect(groups()).toEqual(['Markup']);
    expect(tool('Cloud').disabled).toBe(false);
    rerender({ onPaper: false }); // working in the model through a viewport
    expect(groups()).toEqual(['Text', 'Dimensions', 'Leaders', 'Marks']);
  });

  it('a window too narrow for the row folds its panels from the right, one at a time', () => {
    let wide = 2000;
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) { return this.id === 'ribbon-tools' ? wide - (this.querySelectorAll('button[title$=": its tools"]').length * 300) : 0; });
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) { return this.id === 'ribbon-tools' ? 1600 : 0; });
    show();
    pick('Electrical & ELV');
    const shut = () => [...document.querySelectorAll('button[title$=": its tools"]')].map((b) => b.textContent);
    expect(shut()).toEqual(['Edit devices ▾', 'Wiring ▾']);
    act(() => { (document.querySelector('button[title="Wiring: its tools"]') as HTMLButtonElement).click(); });
    expect([...document.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent)).toEqual(['Wire circuits', 'Wire one', 'Tags']);
    wide = 1500;
    act(() => { window.dispatchEvent(new Event('resize')); });
    expect(shut()).toEqual([]);
  });
});
