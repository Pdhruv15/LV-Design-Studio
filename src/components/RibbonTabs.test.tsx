// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Ribbon, { CAPTIONS, tabForView, type RibbonActions, type RibbonTab } from './Ribbon';
import type { MainView } from '../views';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const noop = () => {};
const actions = (over: Partial<RibbonActions> = {}): RibbonActions => ({
  view: 'dashboard', onView: noop, tool: 'select', onTool: noop, boardId: 'MDB-1', selectedFeederId: null, selection: { kind: 'board', id: 'MDB-1' },
  onAddFeeder: noop, onAddBoard: noop, onBoardProperties: noop, onEditSelected: noop, onDeleteSelected: noop, onExportDss: noop, onSettings: noop,
  onUndo: noop, onRedo: noop, canUndo: false, canRedo: false, onRun: noop, staleCount: 0,
  onNew: noop, onSave: noop, onSaveAs: noop, onAnonymizedSample: noop, onProfile: noop, onChooseFolder: noop, folderLabel: 'Folder: Projects',
  dirty: false, recent: [], onOpenRecent: noop, dbIssues: 0, inboxCount: 0,
  onBom: noop, hasPriceList: false, stage: 'detailed', nextStage: 'ifc', ifcIssued: false, onAdvanceStage: noop, route: 'from-ifc', onRoute: noop, onConceptReport: noop,
  ...over
});

let root: Root;
let chosen: RibbonTab[];
beforeEach(() => { localStorage.clear(); chosen = []; root = createRoot(document.body.appendChild(document.createElement('div'))); });
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; });

function Host({ start, over }: { start: RibbonTab; over?: Partial<RibbonActions> }) {
  const [tab, setTab] = useState(start);
  return <Ribbon tab={tab} onTab={(t) => { chosen.push(t); setTab(t); }} a={actions(over)} />;
}
const show = (start: RibbonTab, over?: Partial<RibbonActions>) => act(() => root.render(<Host start={start} over={over} />));
const tab = (id: string) => document.getElementById(`ribbon-tab-${id}`) as HTMLButtonElement;
const click = (el: HTMLElement) => act(() => el.click());
const key = (el: HTMLElement, k: string) => act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); });
const selected = (list: string) => document.querySelector(`[role="tablist"][aria-label="${list}"] [aria-selected="true"]`)?.id.replace('ribbon-tab-', '');

describe('the Stages tab', () => {
  it('opens on the stage the project is at', () => {
    for (const [stage, sub] of [['concept', 'concept'], ['schematic', 'schematic'], ['detailed', 'detailed'], ['tender', 'issue'], ['ifc', 'issue']] as const) {
      show('home', { stage });
      click(tab('stages'));
      expect(chosen[chosen.length - 1], stage).toBe(sub);
      expect(selected('Stages'), stage).toBe(sub);
      click(tab('home')); // back, for the next stage
    }
  });

  it('stays on the stage showing when it is clicked again, and goes back to the project\'s stage from another tab', () => {
    show('detailed');
    click(tab('concept'));
    expect(selected('Stages')).toBe('concept');
    click(tab('stages'));
    expect(selected('Stages')).toBe('concept');
    click(tab('sld'));
    expect(document.querySelector('[aria-label="Stages"]')).toBeNull();
    click(tab('stages'));
    expect(selected('Stages')).toBe('detailed');
  });

  it('shows each stage\'s tools from its sub-tab', () => {
    show('detailed');
    expect(document.getElementById('ribbon-tools')!.textContent).toContain('Voltage drop');
    click(tab('schematic'));
    expect(chosen).toEqual(['schematic']);
    expect(document.getElementById('ribbon-tools')!.textContent).toContain('Busbar riser');
    expect(document.getElementById('ribbon-tools')!.textContent).not.toContain('Voltage drop');
  });

  it('keeps the arrow keys on the tabs of a row, past the dividers', () => {
    show('cad');
    tab('cad').focus();
    key(tab('cad'), 'ArrowRight');
    expect(chosen).toEqual(['detailed']); // Stages, on the project's stage
    expect(document.activeElement).toBe(tab('stages'));
    key(tab('stages'), 'ArrowRight');
    expect(chosen[chosen.length - 1]).toBe('reports');
    expect(document.activeElement).toBe(tab('reports'));
    key(tab('reports'), 'End');
    expect(document.activeElement).toBe(tab('standards'));
    key(tab('standards'), 'ArrowRight'); // round to the first
    expect(chosen[chosen.length - 1]).toBe('home');
    expect(document.activeElement).toBe(tab('home'));
    key(tab('home'), 'ArrowLeft');
    expect(document.activeElement).toBe(tab('standards'));
  });

  it('moves between the stages with the arrow keys', () => {
    show('detailed');
    tab('detailed').focus();
    key(tab('detailed'), 'ArrowRight');
    expect(chosen).toEqual(['issue']);
    expect(document.activeElement).toBe(tab('issue'));
    key(tab('issue'), 'ArrowRight');
    expect(chosen[chosen.length - 1]).toBe('concept');
    key(tab('concept'), 'End');
    expect(chosen[chosen.length - 1]).toBe('issue');
    key(tab('issue'), 'Home');
    expect(chosen[chosen.length - 1]).toBe('concept');
    expect(document.getElementById('ribbon-tab-stages')!.tabIndex).toBe(0); // the row's stop while a stage shows
  });

  it('drops down with its sub-tabs while the ribbon is collapsed, and stays open when a stage is chosen', () => {
    localStorage.setItem('lvds.ribbonCollapsed', '1');
    show('home');
    expect(document.getElementById('ribbon-tools')).toBeNull();
    click(tab('stages'));
    expect(document.getElementById('ribbon-tools')).not.toBeNull();
    expect(selected('Stages')).toBe('detailed');
    click(tab('concept'));
    expect(document.getElementById('ribbon-tools')!.textContent).toContain('Load assessment');
    click(tab('stages')); // Stages again puts it away
    expect(document.getElementById('ribbon-tools')).toBeNull();
    expect(document.querySelector('[aria-label="Stages"]')).toBeNull();
  });
});

describe('which tab a tool leaves you on', () => {
  /** Every page the tools of a tab open, from a click on each. */
  function pagesFrom(t: RibbonTab): MainView[] {
    const pages: MainView[] = [];
    act(() => root.render(<Ribbon tab={t} onTab={noop} a={actions({ onView: (v) => pages.push(v) })} />));
    for (const b of document.querySelectorAll<HTMLButtonElement>('#ribbon-tools .ribbon-group button:not(.ribbon-split-arrow):not([aria-haspopup])')) if (!b.disabled) act(() => b.click());
    return pages;
  }

  it('stays on the tab, except for the pages listed: nothing lands on a tab without its tools', () => {
    const leaves: string[] = [];
    for (const t of Object.keys(CAPTIONS) as RibbonTab[]) for (const v of new Set(pagesFrom(t))) if (tabForView(v, t) !== t) leaves.push(`${t}: ${v} → ${tabForView(v, t)}`);
    expect(leaves.sort()).toEqual([
      'concept: cad → cad',
      'home: cad → cad',
      'reports: drawings → cad',
      'reports: load-schedule → schedule',
      'schematic: drawings → cad',
      'sld: drawings → cad',
      'sld: load-schedule → schedule'
    ]);
  });

  it('brings the page of an SLD tool back to the SLD tab from Detailed design', () => {
    expect(tabForView('design', 'detailed')).toBe('sld');
    expect(tabForView('panels', 'detailed')).toBe('sld');
    expect(tabForView('enclosure', 'detailed')).not.toBe('detailed');
  });
});
