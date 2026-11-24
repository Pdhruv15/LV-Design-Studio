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
    tool: 'none', onTool: vi.fn(), onOpen: vi.fn(), onSave: vi.fn(), onSaveDwg: vi.fn(), onClose: vi.fn(), onDelete: noop, hasSelection: false, onLayers: noop, layersOn: true, hasDrawing: true,
    file: { plans: [{ label: 'Ground floor · gf.dwg', title: 'Open gf.dwg', onClick: vi.fn() }], level: 'Ground floor', levelTitle: 'The level', levels: [{ label: 'Ground floor', title: '', onClick: noop }], unit: 'mm', unitTitle: 'The units', units: [{ label: 'Millimetres ✓', title: '', onClick: noop }] },
    onRoles: noop, rolesOn: false, onAddFound: noop, onSchedules: noop, onPlaceBoard: noop, placingBoard: false, onCoverage: noop, coverageOn: false, copyLevels: [], onWireAll: noop, onTags: noop, tagsOn: false,
    onCommand: vi.fn(), onLayoutCmd: vi.fn(), onLabels: vi.fn(), onProps: vi.fn(), onLayerManager: vi.fn(), onSetProps: vi.fn(), info: INFO, ...over
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
/** Every tool shown, by name (icons only: its name for screen readers; with labels: the name under it). */
const names = () => [...document.querySelectorAll('#ribbon-tools button')].map((b) => b.getAttribute('aria-label') ?? b.querySelector('span')?.textContent).filter((x): x is string => !!x);
const DRAFTING = ['Draw', 'Modify', 'Blocks', 'Layers', 'Properties', 'Measure and view'];
const ELEC = 'Electrical, ELV & sheets';
const ANNOTATE = ['Text', 'Dimensions', 'Leaders and tags', 'Markup'];
/** The drawing's layers as the page tells the ribbon: two drawn layers, one frozen; nothing picked. */
const INFO = { blocks: ['DB-A', 'DB-B'], layers: [{ name: 'LV-SKETCH', color: '#ffffff', on: true, freeze: false, lock: false }, { name: 'E-POWER', color: '#00ffff', on: false, freeze: false, lock: true }, { name: 'E-OLD', on: true, freeze: true, lock: false }], current: 'LV-SKETCH', picked: 0, props: {} };
/** A split tool's arrow, then an item of its list. */
const fromList = (tool: string, item: string) => { click(document.querySelector(`#ribbon-tools button[title="${tool}: more options"]`)!); click([...document.querySelectorAll('[role="menuitem"], [role="menuitemradio"]')].find((b) => b.textContent === item)!); };
const click = (b: Element) => act(() => { (b as HTMLButtonElement).click(); });
const fileButton = () => document.querySelector('.ribbon-file > button') as HTMLButtonElement;
const items = () => [...document.querySelectorAll('[role="menu"][aria-label="File"] > button, [role="menu"][aria-label="File"] > .ribbon-file-sub > button')].map((b) => b.querySelector('span')!.textContent);
const item = (label: string) => [...document.querySelectorAll('[role="menuitem"]')].find((b) => (b.querySelector('span')?.textContent ?? b.textContent) === label) as HTMLButtonElement;

describe('Design CAD ribbon: sub-tabs by use', () => {
  it('opens on Drafting the first time, then on the sub-tab used last; a running tool shows its sub-tab', () => {
    show();
    expect(selected()).toBe('LVCAD');
    pick(ELEC);
    expect(localStorage.getItem('lvds.cadSub')).toBe('elec');
    act(() => root.unmount());
    root = createRoot(host);
    const again = show();
    expect(selected()).toBe(ELEC);
    again.rerender({ tool: 'text' });
    expect(selected()).toBe('Annotate'); // Text is on Annotate, the sub-tab beside LVCAD
    again.rerender({ tool: 'line' });
    expect(selected()).toBe('LVCAD');
    again.rerender({ tool: 'tray' });
    expect(selected()).toBe(ELEC);
    localStorage.setItem('lvds.cadSub', 'page'); // a sub-tab of v2.053: the one with the sheet set now
    act(() => root.unmount());
    root = createRoot(host);
    show();
    expect(selected()).toBe(ELEC);
    pick('Annotate');
    expect(localStorage.getItem('lvds.cadSub')).toBe('annotate');
  });

  it('has the drafting panels in the order the user chose, Annotate on its own sub-tab; with labels the panels take six sub-tabs; each tool is on one', () => {
    const { rerender } = show();
    expect(['Draw', 'Measure and view'].map(tools)).toEqual([['Line', 'Polyline', 'Circle', 'Arc', 'Hatch', 'Rectangle', 'Polygon', 'Ellipse'],
      ['Distance', 'Area', 'Room area', 'Inspect', 'Zoom extents', 'Drafting settings']]);
    expect(group('Annotate')).toBeNull(); // the LVCAD row had grown wider than a laptop's window
    pick('Annotate');
    expect(['Text', 'Dimensions', 'Leaders and tags', 'Markup'].map(tools)).toEqual([['Text', 'Text style'], ['Dimension', 'Dimension style', 'Update', 'Dimension layer', 'Linear', 'Continue', 'Dimension styles'],
      ['Multileader', 'Multileader style', 'Add leader', 'Align', 'Room tag', 'Tag all rooms', 'Keynote'], ['Revision cloud', 'North arrow']]);
    expect(document.querySelector('.ribbon')!.className).toContain('small-named'); // named beside their icons, as on LVCAD
    const look = (subTabs: string[]) => {
      const seen: string[] = [];
      const panels: Record<string, (string | null)[]> = {};
      for (const label of subTabs) { pick(label); panels[label] = groups(); seen.push(...names()); }
      expect(seen.filter((x, i) => seen.indexOf(x) !== i)).toEqual([]); // no tool twice
      return { panels, seen };
    };
    const shown = look(['LVCAD', 'Annotate', ELEC, 'Output']);
    expect(shown.panels).toEqual({ LVCAD: DRAFTING, Annotate: ANNOTATE, [ELEC]: ['Rooms', 'Cables and boards', 'Devices', 'Level', 'Edit devices', 'Wiring', 'Reference', 'Sheet set'], Output: ['Layout', 'Plot', 'Publish', 'Export'] });
    expect(shown.seen).not.toContain('Object snap'); // the status bar's toggles stay on the status bar
    rerender({ labels: true });
    const all = look(['LVCAD', 'Annotate', 'Layers & properties', 'Electrical & ELV', 'Sheets', 'Layout', 'Output']);
    expect(all.panels).toEqual({
      LVCAD: ['Draw', 'Modify', 'Blocks'], Annotate: ANNOTATE, 'Layers & properties': ['Layers', 'Properties', 'Measure and view'],
      'Electrical & ELV': ['Rooms', 'Cables and boards', 'Devices', 'Level', 'Edit devices', 'Wiring'], Sheets: ['Reference', 'Sheet set'], Layout: ['Layout'], Output: ['Plot', 'Publish', 'Export']
    });
    expect([...all.seen].sort()).toEqual([...shown.seen].sort()); // the same tools, only arranged otherwise
    // The place is kept: Layers & properties with labels is Drafting as shown, and back.
    pick('Layers & properties');
    rerender({ labels: false });
    expect(selected()).toBe('LVCAD');
    rerender({ labels: true });
    expect(selected()).toBe('Layers & properties');
  });

  it('moves whole panels, keeps the order with Show labels and resets it', () => {
    const onPanelOrder = vi.fn();
    const { rerender } = show({ onPanelOrder });
    const layers = group('Layers');
    expect((layers.querySelector('.ribbon-caption') as HTMLElement).draggable).toBe(true);
    click(layers.querySelector('[aria-label="Move Layers panel left"]')!);
    const order = onPanelOrder.mock.calls[0][0] as string[];
    rerender({ panelOrder: order });
    expect(groups()).toEqual(['Draw', 'Modify', 'Layers', 'Blocks', 'Properties', 'Measure and view']);

    rerender({ panelOrder: order, labels: true });
    pick('Layers & properties');
    expect(groups()).toEqual(['Layers', 'Properties', 'Measure and view']);
    const reset = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Reset order') as HTMLButtonElement;
    expect(reset.disabled).toBe(false);
    click(reset);
    expect(onPanelOrder).toHaveBeenLastCalledWith([]);
  });

  it('runs each tool\'s command; a tool\'s other forms are under its arrow, the panel\'s less used tools under its caption', () => {
    const { cad } = show();
    click(tool('Offset'));
    expect(cad.onTool).toHaveBeenLastCalledWith('offset');
    for (const [t, id] of [['Extend', 'extend'], ['Chamfer', 'chamfer'], ['Break', 'break'], ['Join', 'join'], ['Polygon', 'polygon'], ['Distance', 'dist'], ['Area', 'area'], ['Room area', 'room']]) {
      click(tool(t));
      expect(cad.onTool, t).toHaveBeenLastCalledWith(id);
    }
    // The other forms of Circle and Arc are under their arrows.
    for (const [t, form, id] of [['Circle', '2 points', 'circle2p'], ['Circle', '3 points', 'circle3p'], ['Circle', 'Centre, diameter', 'circled'], ['Arc', 'Start, centre, end', 'arcsce']]) {
      fromList(t, form);
      expect(cad.onTool, form).toHaveBeenLastCalledWith(id);
    }
    click(tool('Ellipse'));
    expect(cad.onTool).toHaveBeenLastCalledWith('ellipse');
    // Annotate: Keynote and Revision cloud; the other forms of Text and Dimension under their arrows.
    pick('Annotate');
    for (const [t, id] of [['Keynote', 'keynote'], ['Revision cloud', 'revcloud'], ['Multileader', 'mleader'], ['Add leader', 'mleaderadd'], ['Align', 'mleaderalign'], ['Room tag', 'rtag'], ['Tag all rooms', 'rtall'], ['North arrow', 'north']]) {
      click(tool(t));
      expect(cad.onTool, t).toHaveBeenLastCalledWith(id);
    }
    for (const [t, form, id] of [['Text', 'Notes (MT)', 'mtext'], ['Text', 'Numbered text (TCOUNT)', 'tcount'], ['Text', 'Justify (TJ)', 'tjust'], ['Text', 'Copy words (TCOPY)', 'tcopy'], ['Linear', 'Aligned (DAL)', 'dimal'], ['Linear', 'Angular (DAN)', 'dimang'], ['Linear', 'Radius (DRA)', 'dimrad'], ['Linear', 'Diameter (DDI)', 'dimdia'], ['Continue', 'Baseline (DBA)', 'dimbase'],
      ['Multileader', 'Leader (LE)', 'leader'], ['Multileader', 'Add leader (MLEADERADD)', 'mleaderadd'], ['Multileader', 'Remove leader (MLEADERREMOVE)', 'mleaderremove'], ['Multileader', 'Collect (MLC)', 'mleadercollect']]) {
      fromList(t, form);
      expect(cad.onTool, form).toHaveBeenLastCalledWith(id);
    }
    fromList('Multileader', 'Multileader style… (MLS)');
    expect(cad.onCommand).toHaveBeenLastCalledWith('MLEADERSTYLE');
    for (const t of ['Text style', 'Dimension styles']) click(tool(t));
    expect(cad.onCommand).toHaveBeenLastCalledWith('DIMSTYLE');
    pick('LVCAD');
    for (const t of ['Inspect', 'Zoom extents', 'Drafting settings']) click(tool(t));
    for (const t of ['Off', 'Freeze', 'Lock', 'Isolate', 'Make current', 'All on', 'Thaw all', 'Unlock', 'Unisolate']) click(tool(t));
    click(document.querySelector('button[title="More layers tools: Layer roles, New layer, Layers panel"]')!);
    click(item('New layer'));
    pick(ELEC);
    click(tool('Attach'));
    click(tool('Clip'));
    expect((cad.onCommand as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])).toEqual(['MLEADERSTYLE', 'STYLE', 'DIMSTYLE', 'LIST', 'FIT', 'DSETTINGS', 'LAYOFF', 'LAYFRZ', 'LAYLCK', 'LAYISO', 'LAYMCUR', 'LAYON', 'LAYTHW', 'LAYULK', 'LAYUNISO', 'LAYER N', 'XATTACH', 'XCLIP']);
    pick('Output');
    const layout = tool('New layout');
    expect(layout.getAttribute('aria-haspopup')).toBe('menu');
    click(layout);
    expect([...document.querySelectorAll('[role="menuitem"]')].map((b) => b.querySelector('span')?.textContent ?? b.textContent)).toEqual(['New layout', 'From template…', 'From another drawing…', 'Lighting layout', 'Power layout', 'ELV layout', 'Containment layout']);
    for (const [label, cmd] of [['New layout', 'LAYOUT'], ['From template…', 'LAYOUT T'], ['From another drawing…', 'LAYOUT I'], ['Power layout', 'LAYOUT POWER']]) {
      if (label !== 'New layout') click(tool('New layout'));
      click(item(label));
      expect(cad.onLayoutCmd, label).toHaveBeenLastCalledWith(cmd);
    }
    expect(tool('Plot').disabled).toBe(true); // no layout or sheet open
    expect(tool('Page setup').disabled).toBe(true); // nor a layout showing
    expect(tool('Save as template').disabled).toBe(true);
    expect(tool('Layout manager').disabled).toBe(false); // a drawing is open: the manager needs no layout showing
  });

  it('shows the current layer and lists the drawn layers to make another current (not a frozen one)', () => {
    const { cad } = show();
    const list = document.querySelector('.ribbon-layer') as HTMLButtonElement;
    expect(list.querySelector('.nm')!.textContent).toBe('LV-SKETCH');
    click(list);
    const rows = [...document.querySelectorAll('[role="menu"][aria-label="Layers"] [role="menuitemradio"]')] as HTMLButtonElement[];
    expect(rows.map((b) => [b.textContent, b.getAttribute('aria-checked'), b.disabled])).toEqual([['LV-SKETCH', 'true', false], ['E-POWER', 'false', false], ['E-OLD', 'false', true]]);
    click(rows[1]);
    expect(cad.onCommand).toHaveBeenLastCalledWith('CLAYER E-POWER');
    click(list);
    click(item('Layer palette… (LM)'));
    expect(cad.onLayerManager).toHaveBeenCalledTimes(1);
  });

  it('sets the colour, linetype and lineweight of new objects, or of the objects picked; the palette from beside the caption', () => {
    const { cad, rerender } = show();
    const lt = document.querySelector('select[aria-label="Linetype of new objects"]') as HTMLSelectElement;
    expect(lt.value).toBe('');
    act(() => { lt.value = 'dashed'; lt.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(cad.onSetProps).toHaveBeenLastCalledWith({ lt: 'dashed' });
    rerender({ info: { ...INFO, picked: 2, props: { lw: 'varies', lt: 'center' } } });
    const lw = document.querySelector('select[aria-label="Lineweight of the 2 objects picked"]') as HTMLSelectElement;
    expect(lw.value).toBe('__varies');
    expect((document.querySelector('select[aria-label="Linetype of the 2 objects picked"]') as HTMLSelectElement).value).toBe('center');
    act(() => { lw.value = ''; lw.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(cad.onSetProps).toHaveBeenLastCalledWith({ lw: undefined }); // ByLayer
    const launch = document.querySelector('.ribbon-launch') as HTMLButtonElement;
    expect(launch.getAttribute('aria-pressed')).toBe('false');
    click(launch);
    expect(cad.onProps).toHaveBeenCalledTimes(1);
  });
});

describe('Design CAD ribbon: the Hatch strip\'s place', () => {
  it('while Hatch or Edit hatch runs the tools row is an empty host for the strip, with a Hatch tab; the panels come back after', () => {
    const s = show({ tool: 'none' });
    expect(document.getElementById('cad-hatch-strip-host')).toBeNull();
    expect(document.getElementById('ribbon-tools')).not.toBeNull();
    for (const t of ['hatch', 'hatchedit'] as const) {
      s.rerender({ tool: t });
      const host = document.getElementById('cad-hatch-strip-host')!;
      expect(host).not.toBeNull();
      expect(host.className).toContain('ribbon-tools'); // the same row, so the page does not jump
      expect(host.children).toHaveLength(0);
      expect(document.getElementById('ribbon-tools')).toBeNull();
      expect(document.querySelector('.ribbon-file')).toBeNull();
      const tabLabel = document.querySelector('.ribbon-subtabs [role="tab"][aria-selected="true"]')!;
      expect(tabLabel.textContent).toBe('Hatch');
      expect(tabLabel.className).toContain('hatch-strip-tab');
    }
    s.rerender({ tool: 'none' });
    expect(document.getElementById('cad-hatch-strip-host')).toBeNull();
    expect(document.getElementById('ribbon-tools')).not.toBeNull();
    expect(document.querySelector('.ribbon-file')).not.toBeNull();
  });

  it('is not taken over on another page, or by another tool', () => {
    const s = show({ tool: 'hatch' }, { view: 'dashboard' });
    expect(document.getElementById('cad-hatch-strip-host')).toBeNull();
    s.rerender({ tool: 'line' }, { view: 'cad' });
    expect(document.getElementById('cad-hatch-strip-host')).toBeNull();
  });
});

describe('Design CAD ribbon: the main tools named, every tool\'s name on hover', () => {
  it('shows a tool\'s name, command and what it does after a short rest, and hides it when the mouse leaves', () => {
    vi.useFakeTimers();
    show();
    const offset = tool('Offset');
    expect(offset.textContent).toBe('Offset'); // a small tool on Drafting: its name beside the icon
    expect(tool('Line').textContent).toBe('Line'); // a main tool: its name under it
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

  it('keeps the dimension form used last on Linear and Continue, ticked under their arrows', () => {
    const { rerender } = show();
    pick('Annotate');
    expect(tool('Linear')).toBeTruthy();
    rerender({ tool: 'dimrad' });
    expect(tool('Linear')).toBeNull();
    expect(tool('Radius').className).toContain('on');
    rerender({ tool: 'none' });
    expect(tool('Radius').className).not.toContain('on'); // still Radius once it ends
    click(document.querySelector('#ribbon-tools button[title="Radius: more options"]')!);
    const rows = [...document.querySelectorAll('[role="menuitemradio"]')].map((b) => [b.textContent, b.getAttribute('aria-checked')]);
    expect(rows).toEqual([['Linear (DLI)', 'false'], ['Aligned (DAL)', 'false'], ['Angular (DAN)', 'false'], ['Radius (DRA)', 'true'], ['Diameter (DDI)', 'false']]);
    rerender({ tool: 'dimbase' });
    expect(tool('Baseline')).toBeTruthy();
    expect(tool('Continue')).toBeNull();
  });

  it('lists the dimension styles: the current one for new dimensions, or the style of those picked to give them another', () => {
    const { cad, rerender } = show({ info: { ...INFO, dimStyles: { names: ['Standard', 'LV 1:100'], current: 'LV 1:100' } } });
    pick('Annotate');
    const list = () => group('Dimensions').querySelector('.ribbon-layer') as HTMLButtonElement;
    expect(list().querySelector('.nm')!.textContent).toBe('LV 1:100');
    expect(tool('Update').disabled).toBe(true); // no dimensions picked
    click(list());
    click([...document.querySelectorAll('[aria-label="Dimension styles"] [role="menuitemradio"]')][0]);
    expect(cad.onCommand).toHaveBeenLastCalledWith('DIMSTYLE R Standard');
    rerender({ info: { ...INFO, picked: 2, dimStyles: { names: ['Standard', 'LV 1:100'], current: 'LV 1:100', picked: 'varies' } } });
    expect(list().querySelector('.nm')!.textContent).toBe('varies');
    click(list());
    expect(document.querySelector('[aria-label="Dimension styles"] .hd')!.textContent).toBe('The dimensions picked');
    click([...document.querySelectorAll('[aria-label="Dimension styles"] [role="menuitemradio"]')][1]);
    expect(cad.onCommand).toHaveBeenLastCalledWith('DIMSTYLE A LV 1:100');
    click(tool('Update'));
    expect(cad.onCommand).toHaveBeenLastCalledWith('DIMSTYLE A');
    click(list());
    click(item('Dimension style… (D)'));
    expect(cad.onCommand).toHaveBeenLastCalledWith('DIMSTYLE');
  });

  it('lists the layers new dimensions can go on: LV-ANNO as before, the current layer, or a drawn layer', () => {
    const { cad, rerender } = show();
    pick('Annotate');
    const list = () => group('Dimensions').querySelectorAll('.ribbon-layer')[1] as HTMLButtonElement;
    expect(list().querySelector('.nm')!.textContent).toBe('LV-ANNO');
    click(list());
    const rows = () => [...document.querySelectorAll('[aria-label="Dimension layer"] [role="menuitemradio"]')] as HTMLButtonElement[];
    expect(rows().map((b) => [b.textContent, b.getAttribute('aria-checked')])).toEqual([['Use current (LV-SKETCH)', 'false'], ['LV-ANNO', 'true'],
      ...INFO.layers.map((l) => [l.name, 'false'])]);
    click(rows()[0]);
    expect(cad.onCommand).toHaveBeenLastCalledWith('DIMLAYER .');
    rerender({ info: { ...INFO, dimLayer: '.' } });
    expect(list().querySelector('.nm')!.textContent).toBe('Use current');
    click(list());
    click(rows().find((b) => b.textContent === 'E-POWER')!);
    expect(cad.onCommand).toHaveBeenLastCalledWith('DIMLAYER E-POWER');
  });

  it('shows the current multileader style under Multileader and lists the styles to make another current', () => {
    const { cad } = show({ info: { ...INFO, mleaderStyles: { names: ['Standard', 'Circuit'], current: 'Standard' } } });
    pick('Annotate');
    const list = group('Leaders and tags').querySelector('.ribbon-layer') as HTMLButtonElement;
    expect(list.querySelector('.nm')!.textContent).toBe('Standard');
    click(list);
    const rows = [...document.querySelectorAll('[role="menu"][aria-label="Multileader styles"] [role="menuitemradio"]')] as HTMLButtonElement[];
    expect(rows.map((b) => [b.textContent, b.getAttribute('aria-checked')])).toEqual([['Standard', 'true'], ['Circuit', 'false']]);
    click(rows[1]);
    expect(cad.onCommand).toHaveBeenLastCalledWith('CMLEADERSTYLE Circuit');
    click(list);
    click(item('Multileader style… (MLS)'));
    expect(cad.onCommand).toHaveBeenLastCalledWith('MLEADERSTYLE');
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

  it('Show labels names every tool; three small tools to a column either way', () => {
    const { cad, rerender } = show();
    const box = document.querySelector('.ribbon-labels input') as HTMLInputElement;
    expect(box.checked).toBe(false);
    act(() => { box.click(); });
    expect(cad.onLabels).toHaveBeenLastCalledWith(true);
    rerender({ labels: true });
    const cols = () => [...group('Modify').querySelectorAll('.ribbon-stack')].map((c) => [...c.querySelectorAll('button')].filter((b) => !b.classList.contains('ribbon-split-arrow')).map((b) => b.getAttribute('aria-label') ?? b.querySelector('span')?.textContent));
    expect(cols()).toEqual([['Move', 'Copy', 'Stretch'], ['Rotate', 'Mirror', 'Scale'], ['Trim', 'Extend', 'Break'], ['Fillet', 'Chamfer', 'Join'], ['Offset', 'Array', 'Explode'], ['Erase']]);
    expect(group('Modify').querySelector('button[title^="Offset (O)"]')).not.toBeNull();
    rerender({ labels: false });
    expect(cols()).toEqual([['Move', 'Copy', 'Stretch'], ['Rotate', 'Mirror', 'Scale'], ['Trim', 'Extend', 'Break'], ['Fillet', 'Chamfer', 'Join'], ['Offset', 'Array', 'Explode'], ['Erase']]);
    expect(group('Modify').querySelector('button[title^="Offset (O)"]')).toBeNull(); // the app's own tooltip instead
  });
});

describe('Design CAD ribbon: File', () => {
  const sub = (label: string) => document.querySelector(`[role="menu"][aria-label="${label}"]`);
  const subItems = (label: string) => [...sub(label)!.querySelectorAll('button')].map((b) => b.textContent);
  const hover = (label: string) => act(() => { item(label).dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });

  it('holds New, Open, Close, Save, Save As, Export and Publish; greyed with no drawing but New, Open and Publish', () => {
    const { cad } = show({ hasDrawing: false, onNew: vi.fn(), onSaveAs: vi.fn(), onExport: vi.fn(), onPublish: vi.fn(), onCloseOthers: vi.fn() });
    click(fileButton());
    expect(items()).toEqual(['New', 'Open', 'Close', 'Save', 'Save As…', 'Export', 'Publish…']);
    const off = ['Close', 'Save', 'Save As…', 'Export'];
    for (const label of items()) expect(item(label!).disabled, label!).toBe(off.includes(label!));
    click(item('New'));
    expect(cad.onNew).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="menu"][aria-label="File"]')).toBeNull();
  });

  it('runs what is picked and closes; Open, Close and Export are lists beside it; Esc closes it, not the command', () => {
    const { cad } = show({ reopen: { label: 'Reopen gf.dwg', title: 'Open it again', onClick: vi.fn() }, onSaveAs: vi.fn(), onExport: vi.fn(), onPublish: vi.fn(), onCloseOthers: vi.fn() });
    click(fileButton());
    hover('Open');
    expect(subItems('Open')).toEqual(['Drawing file… (DWG / DXF)', 'Reopen gf.dwg', 'Ground floor · gf.dwg']);
    click(item('Ground floor · gf.dwg'));
    expect(cad.file.plans![0].onClick).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="menu"][aria-label="File"]')).toBeNull();
    click(fileButton());
    hover('Close');
    expect(subItems('Close')).toEqual(['This drawing', 'All drawings', 'All but this one']);
    click(item('All drawings'));
    expect(cad.onCommand).toHaveBeenLastCalledWith('CLOSEALL');
    click(fileButton()); hover('Close'); click(item('All but this one'));
    expect(cad.onCloseOthers).toHaveBeenCalledTimes(1);
    click(fileButton()); click(item('Save'));
    expect(cad.onSave).toHaveBeenCalledTimes(1);
    click(fileButton()); click(item('Save As…'));
    expect(cad.onSaveAs).toHaveBeenCalledTimes(1);
    click(fileButton()); click(item('Publish…'));
    expect(cad.onPublish).toHaveBeenCalledTimes(1);
    click(fileButton());
    hover('Export');
    expect(subItems('Export')).toEqual(['PDF of this view…', 'PDF of this layout…', 'Image (PNG)…', 'Selected objects as DXF…', 'Device list (Excel)…', 'Cable route lengths (Excel)…', 'Block attributes (Excel)…']);
    expect(item('PDF of this layout…').disabled).toBe(true); // no layout tab showing
    click(item('Device list (Excel)…'));
    expect(cad.onExport).toHaveBeenLastCalledWith('devices');
    click(fileButton());
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => { document.dispatchEvent(esc); });
    expect(esc.defaultPrevented).toBe(true);
    expect(document.querySelector('[role="menu"][aria-label="File"]')).toBeNull();
  });
});

describe('Design CAD ribbon: sheets and layouts', () => {
  it('Output: plot and publish one sheet or many, and export; the project-wide tools work with no sheet open', () => {
    const output = { onPlot: vi.fn(), onSetups: vi.fn(), onPrinters: vi.fn(), onPens: vi.fn(), onBatch: vi.fn(), onRegister: vi.fn() };
    const pens = vi.fn();
    show({}, { view: 'drawings', output, sheets: sheets({ ui: sheetUi({ actions: { current: { ...NO_SHEET_ACTIONS, pens } } }) }) });
    pick('Output');
    expect(selected()).toBe('Output');
    for (const [l, f] of [['Plot', output.onPlot], ['Page setups', output.onSetups], ['Printers', output.onPrinters], ['Batch plot', output.onBatch], ['Register', output.onRegister], ['Pen tables', pens]] as const) {
      click(tool(l));
      expect(f, l).toHaveBeenCalledOnce();
    }
    act(() => root.unmount());
    root = createRoot(host);
    show({}, { view: 'drawings', output, sheets: sheets({ open: false }) });
    pick('Output');
    expect(tool('Plot').disabled).toBe(true);
    for (const l of ['Page setups', 'Pen tables', 'Printers', 'Batch plot', 'Register']) expect(tool(l).disabled, l).toBe(false);
    click(tool('Pen tables'));
    expect(output.onPens).toHaveBeenCalledOnce();
  });

  it('Output in model space: the drawing\'s view plotted and saved as PDF, DXF and DWG through Save As, its layouts published', () => {
    const output = { onPlot: vi.fn(), onSetups: vi.fn(), onPrinters: vi.fn(), onPens: vi.fn(), onBatch: vi.fn(), onRegister: vi.fn() };
    const { cad, rerender } = show({ onExport: vi.fn(), onSaveAs: vi.fn(), onPublish: vi.fn() }, { output });
    pick('Output');
    for (const l of ['Plot', 'PDF']) { click(tool(l)); expect(cad.onExport, l).toHaveBeenLastCalledWith('pdfView'); }
    click(tool('DXF'));
    expect(cad.onSaveAs).toHaveBeenCalledOnce();
    click(tool('DWG'));
    expect(cad.onSaveDwg).toHaveBeenCalledOnce();
    click(tool('Publish'));
    expect(cad.onPublish).toHaveBeenCalledOnce();
    click(tool('Pen tables'));
    expect(output.onPens).toHaveBeenCalledOnce();
    expect([tool('Preview').disabled, output.onPlot.mock.calls.length]).toEqual([true, 0]);
    rerender({ inLayout: true }); // a layout tab: Plot with its page setup
    click(tool('Plot'));
    expect(output.onPlot).toHaveBeenCalledOnce();
    rerender({ inLayout: false, hasDrawing: false }); // nothing open
    for (const l of ['Plot', 'Publish', 'PDF', 'DXF', 'DWG', 'Layout manager']) expect(tool(l).disabled, l).toBe(true);
    for (const l of ['Page setups', 'Pen tables', 'Printers', 'Batch plot', 'Register']) expect(tool(l).disabled, l).toBe(false);
  });

  it('opens the active sheet PDF preview in the desktop app', () => {
    const previewPdf = vi.fn();
    vi.stubGlobal('lvds', { files: { pdfBytes: vi.fn() } });
    try {
      show({}, { view: 'drawings', sheets: sheets({ ui: sheetUi({ actions: { current: { ...NO_SHEET_ACTIONS, previewPdf } } }) }) });
      pick('Output');
      expect(tool('Preview').disabled).toBe(false);
      click(tool('Preview'));
      expect(previewPdf).toHaveBeenCalledOnce();
    } finally { vi.unstubAllGlobals(); }
  });

  it('on the sheets pages: every sheet tool on the sheets\' sub-tab, and LVCAD goes back to the drawing; with labels, Sheets and Annotate', () => {
    const onView = vi.fn();
    const { rerender } = show({}, { view: 'drawings', onView, sheets: sheets({ ui: sheetUi({ tool: 'cloud' }) }) });
    expect(selected()).toBe(ELEC);
    expect(groups()).toEqual(['Markup', 'On panels', 'Sheet', 'Sheet set']);
    pick('Output');
    expect(groups()).toEqual(['Plot', 'Publish', 'Export']);
    expect(tool('Publish').className).toContain('stale');
    for (const l of ['PDF', 'DXF', 'DWG']) expect(tool(l).disabled, l).toBe(false);
    pick(ELEC);
    expect(tool('Cloud').getAttribute('aria-pressed')).toBe('true');
    expect(tool('Panel cloud').disabled).toBe(false);
    expect(tool('Delete').disabled).toBe(true); // nothing selected
    expect(tool('Side by side').disabled).toBe(false);
    rerender({ labels: true });
    expect(selected()).toBe('Sheets');
    expect(groups()).toEqual(['Sheet', 'Sheet set']);
    pick('Annotate');
    expect(groups()).toEqual(['Markup', 'On panels']); // drawing on a sheet is its markup
    rerender({ labels: false });
    expect(selected()).toBe(ELEC);
    expect(onView).not.toHaveBeenCalled();
    pick('LVCAD');
    expect(onView).toHaveBeenLastCalledWith('cad'); // the drafting sub-tab shows the drawing
  });

  it('greys the sheet tools with no sheet open, and keeps panel tools to system SLD sheets', () => {
    show({}, { view: 'drawings', sheets: sheets({ open: false }) });
    expect(tool('All sheets').disabled).toBe(false);
    for (const l of ['Cloud', 'Colour']) expect(tool(l).disabled, l).toBe(true);
    pick('Output');
    for (const l of ['Plot', 'Publish', 'Pen tables', 'DWG']) expect(tool(l).disabled, l).toBe(true);
    pick(ELEC);
    act(() => root.unmount());
    root = createRoot(host);
    show({}, { view: 'drawings', sheets: sheets({ kind: 'earthing' }) });
    expect(tool('Panel cloud').disabled).toBe(true);
  });

  it('on a layout: the paper\'s markup on Annotate, the drawing\'s annotation in the model; layouts and viewports beside the sheet set', () => {
    const { rerender } = show({ inLayout: true, onPaper: true }, { sheets: sheets({ open: false, kind: 'plan' }) });
    expect(groups()).toEqual(DRAFTING.filter((g) => g !== 'Blocks')); // blocks are the model's
    pick('Annotate');
    expect(groups()).toEqual(['Markup']);
    expect(tool('Cloud').disabled).toBe(false);
    rerender({ onPaper: false }); // working in the model through a viewport
    expect(groups()).toEqual(ANNOTATE);
    pick('LVCAD');
    expect(groups()).toEqual(DRAFTING);
    pick(ELEC);
    expect(groups().slice(-2)).toEqual(['Reference', 'Sheet set']); // the layout tools are on Output
    pick('Output');
    expect(groups()).toEqual(['Layout', 'Layout viewports', 'Plot', 'Publish', 'Export']);
    rerender({ labels: true, onPaper: true });
    pick('Sheets');
    expect(groups()).toEqual(['Reference', 'Sheet set']);
    pick('Layout');
    expect(groups()).toEqual(['Layout', 'Layout viewports']);
    pick('Output');
    expect(groups()).toEqual(['Plot', 'Publish', 'Export']); // with labels they have their own sub-tab
    pick('LVCAD');
    expect(groups()).toEqual(['Draw', 'Modify']);
    pick('Annotate');
    expect(groups()).toEqual(['Markup']);
  });

  it('a window too narrow for the row folds its panels from the right, one at a time, each to one tool named for it', () => {
    vi.useFakeTimers();
    let wide = 2900;
    const SHUT = 'button[aria-label$=": its tools"], button[title$=": its tools"]';
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) { return this.id === 'ribbon-tools' ? wide - (this.querySelectorAll(SHUT).length * 300) : 0; });
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) { return this.id === 'ribbon-tools' ? 1600 : 0; });
    const { cad, rerender } = show({ inLayout: true });
    pick('Output');
    const shut = () => [...document.querySelectorAll(SHUT)].map((b) => b.getAttribute('aria-label') ?? b.textContent);
    expect(shut()).toEqual(['Layout: its tools', 'Layout viewports: its tools', 'Plot: its tools', 'Publish: its tools', 'Export: its tools']);
    // One tool with the panel's name under its icon, no caption under it; the panel's tools on hover.
    expect(group('Layout viewports').querySelector('.ribbon-caption')).toBeNull();
    expect(tool('Layout viewports: its tools').textContent).toBe('Layout viewports');
    act(() => { tool('Layout viewports: its tools').dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
    act(() => { vi.advanceTimersByTime(400); });
    expect(document.querySelector('#ribbon-tip')!.textContent).toBe('Layout viewportsIts tools: Viewport, Arrange, Legend, Notes, Scale, Lock, Fit, Copy, Align, Maximise, Frame prints, Clip');
    // A tool that only opens a list is there as its list.
    click(tool('Layout: its tools'));
    expect([...document.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent)).toEqual(['New layout: New layout', 'New layout: From template…', 'New layout: From another drawing…', 'New layout: Lighting layout', 'New layout: Power layout', 'New layout: ELV layout', 'New layout: Containment layout', 'Page setup', 'Save as template', 'Layout manager']);
    click(item('New layout: Power layout'));
    expect(cad.onLayoutCmd).toHaveBeenLastCalledWith('LAYOUT POWER');
    wide = 1500;
    act(() => { window.dispatchEvent(new Event('resize')); });
    expect(shut()).toEqual([]);
    // A window made narrower with none folded: measured anew, so the panels fold (they keep their width, never squeezed).
    wide = 2900;
    act(() => { window.dispatchEvent(new Event('resize')); });
    expect(shut()).toHaveLength(5);
    // With labels: the panel's name on the button and under it.
    wide = 2000;
    pick(ELEC);
    rerender({ labels: true });
    expect(selected()).toBe('Electrical & ELV');
    expect(shut()).toEqual(['Edit devices', 'Wiring']);
    expect(group('Wiring').querySelector('.ribbon-caption')!.textContent).toBe('Wiring');
    click(document.querySelector('button[title="Wiring: its tools"]')!);
    expect([...document.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent)).toEqual(['Wire circuits', 'Wire one', 'Tags']);
  });
});

describe('Output: layout, viewports, plot, publish, export', () => {
  const cmds = (cad: Cad) => (cad.onLayoutCmd as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
  it('reads Layout, Layout viewports, Plot, Publish, Export on a layout; the model has no viewports; the sheets pages only the last three', () => {
    show();
    pick('Output');
    expect(groups()).toEqual(['Layout', 'Plot', 'Publish', 'Export']);
    act(() => root.unmount()); root = createRoot(host);
    show({ inLayout: true });
    pick('Output');
    expect(groups()).toEqual(['Layout', 'Layout viewports', 'Plot', 'Publish', 'Export']);
    // Every tool of Output is named, the small ones beside their icons (it fits a 1,366 px window: 1,281 px).
    expect(document.querySelector('.ribbon')!.className).toContain('small-named');
    expect([...group('Layout viewports').querySelectorAll('button')].map((b) => b.querySelector('span')?.textContent).filter(Boolean)).toEqual(['Viewport', 'Arrange', 'Legend', 'Notes', 'Scale', 'Lock', 'Fit', 'Copy', 'Align', 'Maximise', 'Frame prints', 'Clip']);
    act(() => root.unmount()); root = createRoot(host);
    show({}, { sheets: sheets({ open: false, kind: 'plan' }), view: 'drawings' });
    pick('Output');
    expect(groups()).toEqual(['Plot', 'Publish', 'Export']);
  });

  it('Layout: Page setup, Save as template and Layout manager run their commands; the viewport tools run theirs', () => {
    const { cad } = show({ inLayout: true });
    pick('Output');
    expect(tool('Page setup').disabled).toBe(false);
    click(tool('Page setup')); click(tool('Save as template')); click(tool('Layout manager'));
    expect(tools('Layout viewports')).toEqual(['Viewport', 'Arrange', 'Legend', 'Notes', 'Scale', 'Lock', 'Fit', 'Copy', 'Align', 'Maximise', 'Frame prints', 'Clip']);
    for (const t of ['Fit', 'Copy', 'Maximise', 'Frame prints', 'Clip', 'Viewport', 'Legend', 'Notes', 'Lock']) click(tool(t));
    click(tool('Align')); click(item('Side by side'));
    click(tool('Align')); click(item('Stacked'));
    expect(cmds(cad)).toEqual(['PAGESETUP', 'LAYOUT S', 'LAYOUTMANAGER', 'VPFIT', 'VPCOPY', 'VPMAX', 'VPFRAME', 'VPCLIP', 'MV', 'LEGEND', 'NOTES', 'VPLOCK', 'VPALIGN H', 'VPALIGN V']);
  });

  it('Arrange lists the nine arrangements; Scale lists the project\'s scales and the scale list', () => {
    const { cad, rerender } = show({ inLayout: true });
    pick('Output');
    click(tool('Arrange'));
    const labels = [...document.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent);
    expect(labels).toHaveLength(9);
    expect(labels[0]).toBe('Single');
    click(item('Two: side by side'));
    expect(cad.onLayoutCmd).toHaveBeenLastCalledWith('VPORTS 2V');
    click(tool('Scale'));
    expect([...document.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent)).toEqual(['1:20', '1:50', '1:100', '1:200', '1:500', '1:1000', 'Scale list…']);
    click(item('Scale list…'));
    expect(cad.onLayoutCmd).toHaveBeenLastCalledWith('SCALELISTEDIT');
    rerender({ info: { ...INFO, scales: [50, 75, 100] } });
    click(tool('Scale'));
    expect([...document.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent)).toEqual(['1:50', '1:75', '1:100', 'Scale list…']);
    click(item('1:75'));
    expect(cad.onLayoutCmd).toHaveBeenLastCalledWith('VPSCALE 75');
  });

  it('Lock and Frame prints show the viewport picked', () => {
    const { rerender } = show({ inLayout: true, info: { ...INFO, vp: { locked: true, frame: false } } });
    pick('Output');
    expect([tool('Lock'), tool('Frame prints')].map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    rerender({ info: { ...INFO, vp: { locked: false, frame: true } } });
    expect([tool('Lock'), tool('Frame prints')].map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
  });
});

describe('Draw order (S7 of the Design CAD 2D gap plan)', () => {
  it('lists Draw order\'s entries under Modify ▾ after a separator; each runs its command', () => {
    const { cad } = show();
    click(document.querySelector('button[title^="More modify tools"]')!);
    const items = () => [...document.querySelectorAll('[role="menuitem"]')] as HTMLButtonElement[];
    expect(items().map((b) => b.textContent)).toEqual(['Quick select…', 'Draw order: Bring to front', 'Draw order: Send to back', 'Draw order: Above object', 'Draw order: Under object', 'Draw order: Text to front (TEXTTOFRONT)']);
    expect(document.querySelectorAll('.ribbon-split-menu hr')).toHaveLength(1);
    click(items()[2]);
    expect(cad.onCommand).toHaveBeenLastCalledWith('DRAWORDER B');
    click(document.querySelector('button[title^="More modify tools"]')!);
    click(items()[5]);
    expect(cad.onCommand).toHaveBeenLastCalledWith('TEXTTOFRONT');
  });
});

describe('Points (S8 of the Design CAD 2D gap plan)', () => {
  it('lists Point, Divide, Measure out and Point style… under Draw ▾', () => {
    const { cad } = show();
    click(document.querySelector('button[title^="More draw tools"]')!);
    const items = () => [...document.querySelectorAll('[role="menuitem"]')] as HTMLButtonElement[];
    expect(items().map((b) => b.textContent)).toEqual(['Point', 'Divide', 'Measure out', 'Point style…']);
    click(items()[0]);
    expect(cad.onTool).toHaveBeenLastCalledWith('point');
    click(document.querySelector('button[title^="More draw tools"]')!);
    click(items()[2]);
    expect(cad.onTool).toHaveBeenLastCalledWith('measure');
    click(document.querySelector('button[title^="More draw tools"]')!);
    click(items()[3]);
    expect(cad.onCommand).toHaveBeenLastCalledWith('PTYPE');
  });
});

describe('Blocks (S9 of the Design CAD 2D gap plan)', () => {
  it('has a Blocks panel between Modify and Layers with Create, which opens the Block definition', () => {
    const { cad } = show();
    expect(tools('Blocks')).toEqual(['Insert', 'Create', 'Attribute']);
    click(tool('Attribute'));
    expect(cad.onCommand).toHaveBeenLastCalledWith('ATTDEF');
    click(document.querySelector('button[title^="More blocks tools"]')!);
    click([...document.querySelectorAll('[role="menuitem"]')].find((b) => b.textContent === 'Edit attributes')!);
    expect(cad.onCommand).toHaveBeenLastCalledWith('EATTEDIT');
    click(tool('Insert'));
    expect(cad.onCommand).toHaveBeenLastCalledWith('INSERT');
    fromList('Insert', 'DB-A');
    expect(cad.onCommand).toHaveBeenLastCalledWith('-INSERT DB-A');
    fromList('Insert', 'More blocks…');
    expect(cad.onCommand).toHaveBeenLastCalledWith('INSERT');
    click(tool('Create'));
    expect(cad.onCommand).toHaveBeenLastCalledWith('BLOCK');
  });
});

describe('Design CAD ribbon: Devices and Level', () => {
  const tip = (name: string) => tool(name).getAttribute('data-tip-text')!;
  const arrow = (name: string) => document.querySelector(`#ribbon-tools button[title="${name}: more options"]`) as HTMLButtonElement;
  const rows = () => [...document.querySelectorAll('.ribbon-split-menu button[role^="menuitem"]')] as HTMLButtonElement[];
  const row = (label: string) => rows().find((b) => b.textContent!.startsWith(label))!;
  const gallery = () => document.querySelector('[role="dialog"][aria-label="Devices"]') as HTMLElement | null;
  const shownNames = () => [...gallery()!.querySelectorAll('button span')].map((x) => x.textContent);
  const headings = () => [...gallery()!.querySelectorAll('.cad-pal-h')].map((x) => x.textContent);

  it('holds the tools of a whole room in Devices and those of the whole level in Level, the small ones named', () => {
    show();
    pick(ELEC);
    expect(tools('Devices')).toEqual(['Add device', 'Fill room', 'Light room', 'Room devices', 'Emergency']);
    expect(tools('Level')).toEqual(['Coverage', 'Copy to level']);
    for (const name of ['Room devices', 'Emergency', 'Coverage', 'Copy to level']) expect(tool(name).querySelector('span')?.textContent).toBe(name);
    expect(group('Rooms').querySelector('button[aria-label="Trace"] span')).toBeNull(); // a small tool of another panel stays icon only
  });

  it("chooses Fill room's device on its arrow and starts FILL from the main button", () => {
    const onFill = vi.fn(), onTool = vi.fn();
    show({ onFill, onTool, fillDevice: 'access-point' });
    pick(ELEC);
    click(tool('Fill room'));
    expect(onTool).toHaveBeenCalledWith('fill');
    click(arrow('Fill room'));
    expect(document.querySelector('.ribbon-split-menu .hd')!.textContent).toBe('Fill with');
    expect(rows().slice(0, 4).map((b) => b.textContent)).toEqual(['Smoke detector10.6 m', 'Heat detector7.5 m', 'Wi-Fi access point17.0 m', 'Ceiling speaker6.0 m']);
    expect(rows().filter((b) => b.getAttribute('aria-checked') === 'true').map((b) => b.textContent)).toEqual(['Wi-Fi access point17.0 m']);
    click(row('Heat detector'));
    expect(onFill).toHaveBeenCalledWith('heat-detector');
  });

  it("chooses Coverage's system on its arrow and switches it off there", () => {
    const onCoverage = vi.fn(), onCoverageOf = vi.fn();
    show({ onCoverage, onCoverageOf, coverageOn: true, coverageSystem: 'cctv' });
    pick(ELEC);
    click(tool('Coverage'));
    expect(onCoverage).toHaveBeenCalled();
    click(arrow('Coverage'));
    expect(rows().map((b) => b.textContent)).toEqual(['Fire alarm', 'CCTV', 'Data and Wi-Fi', 'Public address', 'Off']);
    expect(rows().filter((b) => b.getAttribute('aria-checked') === 'true').map((b) => b.textContent)).toEqual(['CCTV']);
    click(row('Data and Wi-Fi'));
    expect(onCoverageOf).toHaveBeenCalledWith('ict');
    click(arrow('Coverage'));
    click(row('Off'));
    expect(onCoverageOf).toHaveBeenCalledWith(null);
  });

  it('says why a greyed tool of these panels is greyed', () => {
    const { rerender } = show({ hasDrawing: false });
    pick(ELEC);
    expect(tip('Add device').startsWith('Not available: open a drawing first.')).toBe(true);
    expect(tip('Coverage').startsWith('Not available: open a drawing first.')).toBe(true);
    rerender({ hasDrawing: true, copyWhy: 'the project has no other level' });
    expect(tip('Copy to level').startsWith('Not available: the project has no other level.')).toBe(true);
    expect(tip('Add device').startsWith('Not available')).toBe(false);
  });

  it("opens Add device's gallery on its arrow: Recent, the groups, Find, a click picks one", () => {
    const onDevice = vi.fn();
    show({ onDevice, recentDevices: ['s13t', 'ltg'] });
    pick(ELEC);
    click(arrow('Add device'));
    expect(gallery()!.querySelector('input[aria-label="Find a device"]')).not.toBeNull();
    expect(headings()).toEqual(['Recent', 'Lighting', 'Sockets', 'Switches', 'Equipment', 'Boards', 'Boxes', 'ELV']);
    const recent = [...gallery()!.querySelectorAll('.cad-gallery-list button')].slice(0, 2).map((b) => b.getAttribute('title'));
    expect(recent).toEqual(['Twin socket', 'Light']);
    const find = gallery()!.querySelector('input') as HTMLInputElement;
    const type = (v: string) => act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(find, v); find.dispatchEvent(new Event('input', { bubbles: true })); });
    type('sock');
    expect(headings()).toEqual(['Sockets']);
    expect(shownNames().every((n) => /sock/i.test(n!))).toBe(true);
    click([...gallery()!.querySelectorAll('button')].find((b) => b.textContent === 'Twin socket')!);
    expect(onDevice).toHaveBeenCalledWith('s13t');
    expect(gallery()).toBeNull();
  });

  it('takes the device placed last on Enter in an empty Find box', () => {
    const onDevice = vi.fn();
    show({ onDevice, recentDevices: ['s13t', 'ltg'] });
    pick(ELEC);
    click(arrow('Add device'));
    act(() => { gallery()!.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    expect(onDevice).toHaveBeenCalledWith('s13t');
  });

  it('picks the first match on Enter, and has no arrow without a way to choose', () => {
    const onDevice = vi.fn();
    show({ onDevice });
    pick(ELEC);
    click(arrow('Add device'));
    const find = gallery()!.querySelector('input') as HTMLInputElement;
    act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(find, 'camera'); find.dispatchEvent(new Event('input', { bubbles: true })); });
    act(() => { find.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    expect(onDevice).toHaveBeenCalledWith('camera');
    act(() => root.unmount());
    root = createRoot(host);
    show();
    pick(ELEC);
    expect(arrow('Add device')).toBeNull();
  });
});
