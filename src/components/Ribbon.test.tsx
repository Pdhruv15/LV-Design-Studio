import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Ribbon, { CAPTIONS, type RibbonActions, type RibbonTab } from './Ribbon';
import { NO_SHEET_ACTIONS, type SheetUi } from './sld/sheetUi';

const noop = () => {};
const actions = (over: Partial<RibbonActions> = {}): RibbonActions => ({
  view: 'dashboard', onView: noop, tool: 'select', onTool: noop, boardId: 'MDB-1', selectedFeederId: null, selection: null,
  onAddFeeder: noop, onAddBoard: noop, onBoardProperties: noop, onEditSelected: noop, onDeleteSelected: noop, onExportDss: noop, onSettings: noop,
  onUndo: noop, onRedo: noop, canUndo: false, canRedo: false, onRun: noop, staleCount: 0,
  onNew: noop, onSave: noop, onSaveAs: noop, onAnonymizedSample: noop, onProfile: noop, onChooseFolder: noop, folderLabel: 'Folder: Projects',
  dirty: false, recent: [{ file: 'a.lvds', name: 'Villa', when: 'today' }], onOpenRecent: noop, dbIssues: 0, inboxCount: 0,
  onBom: noop, hasPriceList: false, stage: 'detailed', nextStage: 'ifc', ifcIssued: false, onAdvanceStage: noop, route: 'from-ifc', onRoute: noop, onConceptReport: noop,
  ...over
});
const render = (tab: RibbonTab, over: Partial<RibbonActions> = {}) => renderToStaticMarkup(<Ribbon tab={tab} onTab={noop} a={actions(over)} />);
const TABS = Object.keys(CAPTIONS) as RibbonTab[];

describe('Ribbon', () => {
  it('puts Project first, then the everyday work, one Stages tab, what comes out, and Standards at the far end', () => {
    const html = render('sld');
    const order = [...html.matchAll(/id="ribbon-tab-(\w+)"/g)].map((m) => m[1]);
    expect(order).toEqual(['home', 'schedule', 'sld', 'cad', 'stages', 'reports', 'cost', 'standards']);
    // Dividers between the kinds of tab, and Standards pushed to the far end.
    expect(html.split('class="tab-sep"').length - 1).toBe(3);
    expect(html).toMatch(/id="ribbon-tab-cost".*?<span class="sp"><\/span><button id="ribbon-tab-standards"/s);
    expect(html).toContain('Add load');
    expect(render('schedule')).toContain('Load schedule');
    expect(render('schedule')).toContain('Add load');
  });

  it('shows the four stages as sub-tabs of Stages, numbered in order, and no others', () => {
    const subTabs = (html: string) => [...(/role="tablist" aria-label="Stages">(.*?)<\/div>/s.exec(html)?.[1] ?? '').matchAll(/id="ribbon-tab-(\w+)"/g)].map((m) => m[1]);
    for (const stage of ['concept', 'schematic', 'detailed', 'issue'] as const) {
      const html = render(stage);
      expect(subTabs(html), stage).toEqual(['concept', 'schematic', 'detailed', 'issue']);
      expect(html, stage).toMatch(/id="ribbon-tab-stages"[^>]*aria-selected="true"/);
      expect(html, stage).toMatch(new RegExp(`id="ribbon-tab-${stage}"[^>]*aria-selected="true"`));
    }
    expect(render('detailed')).toMatch(/>1 Concept<.*>2 Schematic<.*>3 Detailed design<.*>4 Tender and IFC</s);
    for (const tab of ['home', 'schedule', 'sld', 'reports', 'cost', 'standards'] as const) expect(render(tab), tab).not.toContain('ribbon-subtabs');
    expect(render('cad')).not.toContain('aria-label="Stages"'); // Design CAD keeps its own sub-tabs
    expect(render('sld')).toMatch(/id="ribbon-tab-stages"[^>]*aria-selected="false"/);
  });

  it('gives Detailed design only its own tools; the SLD tools and More are on the SLD tab', () => {
    const detailed = render('detailed');
    for (const label of ['Run', 'Selection', 'Voltage drop', 'Earthing', 'Protection', 'Issue detailed']) expect(detailed, label).toContain(`>${label}<`);
    for (const label of ['SLD', 'Sheets', 'Select', 'Pan', 'Boards', 'Board', 'Schedule', 'Enclosure', 'Add load', 'Edit', 'Delete', 'More']) expect(detailed, label).not.toContain(`<span>${label}</span>`);
    expect(detailed).not.toContain('ribbon-selected');
    const sld = render('sld');
    for (const label of ['Run', 'SLD', 'Sheets', 'Select', 'Pan', 'Boards', 'Board', 'Schedule', 'Enclosure', 'Add load', 'Edit', 'Delete', 'More']) expect(sld, label).toContain(`<span>${label}</span>`);
    expect(sld).toContain('ribbon-selected');
  });

  it('captions every group on every tab', () => {
    for (const tab of TABS) {
      const html = render(tab);
      const groups = (html.match(/class="ribbon-group( more)?"/g) ?? []).length;
      const captions = html.split('class="ribbon-caption"').length - 1;
      expect(captions, tab).toBe(groups);
    }
  });

  it('uses icons, not Unicode glyphs, in its chrome', () => {
    for (const tab of TABS) expect(render(tab, { dirty: true, dbIssues: 2 }), tab).not.toMatch(/[▾●⚠✕✓▶]/);
  });

  it('shows unsaved changes and database issues in words', () => {
    expect(render('home', { dirty: true })).toContain('unsaved');
    expect(render('standards', { dbIssues: 2 })).toContain('2 to check');
  });

  it('has ELV systems and the inbox on the Schematic tab, with what is waiting in words', () => {
    const html = render('schematic', { inboxCount: 1 });
    expect(html).toContain('ELV systems');
    expect(html).toContain('1 to review');
    expect(render('schematic')).not.toContain('to review');
  });

  it('marks the current design stage with a badge, separate from the tab selected', () => {
    const html = render('home', { stage: 'schematic' });
    expect(html.split('class="stage-now"').length - 1).toBe(1);
    expect(html).toMatch(/id="ribbon-tab-stages"[^>]*aria-selected="false"[^>]*>.*?class="stage-now"/);
    expect(html).toMatch(/id="ribbon-tab-home"[^>]*aria-selected="true"/);
    // On a stage: on Stages and on the project's stage, whichever stage is showing.
    const other = render('concept', { stage: 'schematic' });
    expect(other.split('class="stage-now"').length - 1).toBe(2);
    expect(other).toMatch(/id="ribbon-tab-schematic"[^>]*aria-selected="false"[^>]*>2 Schematic<span class="stage-now"/);
    expect(other).toMatch(/id="ribbon-tab-concept"[^>]*aria-selected="true"[^>]*>1 Concept<\/button>/);
    // Tender and IFC are one sub-tab.
    for (const stage of ['tender', 'ifc'] as const) expect(render('issue', { stage }), stage).toMatch(/>4 Tender and IFC<span class="stage-now"/);
  });

  it('links the tabs to the tools they show', () => {
    expect(render('home').split('aria-controls="ribbon-tools"').length - 1).toBe(8);
    const html = render('detailed');
    expect(html.split('aria-controls="ribbon-tools"').length - 1).toBe(12); // with the four stages
    expect(html).toContain('id="ribbon-tools"');
    expect(html).toContain('aria-label="3 Detailed design tools"');
  });

  it('shows Design CAD as Plan (engineering) and Draw (drafting) over the same drawing', () => {
    const html = render('cad');
    expect(html).toContain('ribbon-subtabs');
    for (const c of ['File', 'Rooms', 'Cables and boards', 'Devices', 'Measure', 'View']) expect(html).toContain(`aria-label="${c}"`);
    for (const c of ['Draw', 'Modify', 'Annotate']) expect(html).not.toContain(`aria-label="${c}"`);
    expect(render('home')).not.toContain('ribbon-subtabs');
  });

  it('has Close in the File group of Design CAD, after Save DWG and off while no drawing is open', () => {
    const cad = (hasDrawing: boolean) => ({ hasDrawing, file: { plans: [], level: 'Ground', levelTitle: '', levels: [], unit: 'mm', unitTitle: '', units: [] }, copyLevels: [] }) as unknown as RibbonActions['cad'];
    const close = (html: string) => html.match(/<button[^>]*title="Close this drawing[^>]*>/)?.[0];
    const html = render('cad', { view: 'cad', cad: cad(true) });
    expect(html.indexOf('>Close<')).toBeGreaterThan(html.indexOf('>Save DWG<'));
    expect(close(html)).toBeDefined();
    expect(close(html)).not.toContain('disabled');
    expect(close(render('cad', { view: 'cad', cad: cad(false) }))).toContain('disabled');
    expect(render('cad', { view: 'drawings', cad: cad(true), sheets: { tab: 'layout', open: false, onTab: noop } })).not.toContain('>Close<'); // on Plan and Draw, not on Sheets
  });

  it('has a Sheets sub-tab in Design CAD for the sheets pages, with the register tabs', () => {
    const html = render('cad', { view: 'drawings', sheets: { tab: 'layout', open: false, onTab: noop } });
    expect(html).toMatch(/aria-selected="true"[^>]*>Sheets</);
    for (const label of ['All sheets', 'Layout', 'Title block', 'Issues']) expect(html).toContain(`>${label}<`);
    expect(html).not.toContain('>Save DWG<'); // floor-plan tools stay on Plan and Draw
    expect(render('cad', { view: 'cad' })).not.toContain('>All sheets<');
  });

  it('opens the sheets from the SLD tabs', () => {
    for (const tab of ['schematic', 'sld'] as const) expect(render(tab), tab).toContain('in Design CAD → Sheets');
  });

  describe('with a sheet open in Design CAD → Sheets', () => {
    const ui = (over: Partial<SheetUi> = {}): SheetUi => ({ tool: 'select', setTool: noop, color: 'black', setColor: noop, size: 3.5, setSize: noop, selId: null, setSelId: noop,
      zoom: 'fit', setZoom: noop, pct: '64 %', setPct: noop, side: false, setSide: noop, actions: { current: NO_SHEET_ACTIONS }, ...over });
    const sheets = (over: Partial<NonNullable<RibbonActions['sheets']>> = {}): RibbonActions['sheets'] => ({ tab: 'sheets', open: true, onTab: noop, ui: ui(), kind: 'system',
      publish: { label: 'Rev C…', title: 'Changed since Rev B was issued', changed: true }, legend: { on: true, shown: true }, onLegend: noop, ...over });
    /** The opening tag of the ribbon button labelled `label`. */
    const button = (html: string, label: string) => html.match(new RegExp(`<button[^>]*>(?:(?!</button>).)*?<span>${label}</span>`))?.[0].match(/^<button[^>]*>/)?.[0] ?? '';

    it('has the markup, style, view and issue tools in the ribbon', () => {
      const html = render('cad', { view: 'drawings', sheets: sheets({ ui: ui({ tool: 'cloud' }) }) });
      for (const g of ['Markup', 'On panels', 'Style', 'Issue and export']) expect(html).toContain(`aria-label="${g}"`);
      expect(button(html, 'Cloud')).toContain('aria-pressed="true"');
      expect(button(html, 'Panel cloud')).not.toContain('disabled');
      expect(html).toContain('<span class="ribbon-sub">Black</span>'); // new markups are black
      expect(html).toContain('<span class="ribbon-sub">Rev C…</span>');
      expect(button(html, 'Publish')).toContain('stale');
      for (const l of ['Fit', 'PDF', 'DXF', 'DWG', 'Side by side']) expect(button(html, l), l).not.toContain('disabled');
      expect(button(html, 'Delete')).toContain('disabled'); // nothing selected
    });

    it('keeps panel tools to system SLD sheets, and greys the sheet tools with no sheet open', () => {
      expect(button(render('cad', { view: 'drawings', sheets: sheets({ kind: 'earthing' }) }), 'Panel cloud')).toContain('disabled');
      const none = render('cad', { view: 'drawings', sheets: sheets({ open: false }) });
      for (const l of ['Cloud', 'Colour', 'Fit', 'Publish', 'DWG']) expect(button(none, l), l).toContain('disabled');
      expect(button(none, 'All sheets')).not.toContain('disabled');
    });
  });
});

