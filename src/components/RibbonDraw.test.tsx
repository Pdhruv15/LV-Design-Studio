// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Ribbon, { type RibbonActions } from './Ribbon';
import type { CadTool } from './cad/cadState';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; vi.restoreAllMocks(); });

const noop = () => {};
/** The ribbon on Design CAD with a Draw tool in use (the Draw sub-tab shows), every action a no-op. */
function show(tool: CadTool, onTool = vi.fn()) {
  const cad = { tool, onTool, hasDrawing: true, file: { plans: [], level: 'Ground', levelTitle: '', levels: [], unit: 'mm', unitTitle: '', units: [] }, copyLevels: [] };
  const a = {
    view: 'cad', onView: noop, tool: 'select', onTool: noop, boardId: 'MDB-1', selectedFeederId: null, selection: null,
    onAddFeeder: noop, onAddBoard: noop, onBoardProperties: noop, onEditSelected: noop, onDeleteSelected: noop, onExportDss: noop, onSettings: noop,
    onUndo: noop, onRedo: noop, canUndo: false, canRedo: false, onRun: noop, staleCount: 0,
    onNew: noop, onSave: noop, onSaveAs: noop, onAnonymizedSample: noop, onProfile: noop, onChooseFolder: noop, folderLabel: 'Folder: Projects',
    dirty: false, recent: [], onOpenRecent: noop, dbIssues: 0, inboxCount: 0,
    onBom: noop, hasPriceList: false, stage: 'detailed', nextStage: 'ifc', ifcIssued: false, onAdvanceStage: noop, route: 'from-ifc', onRoute: noop, onConceptReport: noop, cad
  } as unknown as RibbonActions;
  act(() => root.render(<Ribbon tab="cad" onTab={noop} a={a} />));
  return onTool;
}
const group = (name: string) => document.querySelector(`[role="group"][aria-label="${name}"]`) as HTMLElement;
const labels = (el: Element) => [...el.querySelectorAll('.ribbon-group-btns > button span:first-of-type, .ribbon-group-btns > .ribbon-split > button:first-child span:first-of-type, .ribbon-stack button span')].map((s) => s.textContent);

describe('Design CAD → Draw ribbon: the standard CAD panels', () => {
  it('shows File, Draw, Modify, Annotation, Layers and Properties; Modify as the 3 × 4 grid of small buttons', () => {
    show('trim');
    expect([...document.querySelectorAll('#ribbon-tools > [role="group"]')].sort((x, y) => Number((x as HTMLElement).style.order) - Number((y as HTMLElement).style.order)).map((g) => g.getAttribute('aria-label')))
      .toEqual(['File', 'Draw', 'Modify', 'Annotation', 'Layers', 'Properties']);
    const cols = [...group('Modify').querySelectorAll('.ribbon-stack')].map((c) => [...c.querySelectorAll(':scope > button span, :scope > .ribbon-split > button:first-child span')].map((s) => s.textContent));
    expect(cols).toEqual([['Move', 'Copy', 'Stretch'], ['Rotate', 'Mirror', 'Scale'], ['Trim', 'Fillet', 'Array'], ['Erase', 'Explode', 'Offset']]);
    expect(labels(group('Draw'))).toEqual(['Line', 'Polyline', 'Circle', 'Arc', 'Rectangle', 'Hatch']);
    expect(labels(group('Annotation'))).toEqual(['Text', 'Dimension', 'Leader', 'Room tag', 'North arrow']);
    expect(labels(group('Properties'))).toEqual(['Match properties']);
    expect(group('Modify').querySelector('.ribbon-stack button[aria-pressed="true"] span')!.textContent).toBe('Trim');
  });

  it('Extend under Trim\'s arrow, Chamfer under Fillet\'s, Break and Join in Modify ▾', () => {
    const onTool = show('line');
    const arrow = (label: string) => group('Modify').querySelector(`button[title="${label}: more options"]`) as HTMLButtonElement;
    act(() => { arrow('Trim').click(); });
    act(() => { ([...document.querySelectorAll('[role="menuitem"]')].find((b) => b.textContent === 'Extend') as HTMLButtonElement).click(); });
    expect(onTool).toHaveBeenLastCalledWith('extend');
    act(() => { arrow('Fillet').click(); });
    expect([...document.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent)).toEqual(['Chamfer']);
    const more = group('Modify').querySelector('.ribbon-caption-more') as HTMLButtonElement;
    expect(more.textContent).toBe('Modify ▾');
    act(() => { more.click(); });
    expect([...document.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent)).toEqual(['Break', 'Join']);
    act(() => { ([...document.querySelectorAll('[role="menuitem"]')][1] as HTMLButtonElement).click(); });
    expect(onTool).toHaveBeenLastCalledWith('join');
  });

  it('a window too narrow for the row collapses the File panel, then Layers, to one button each', () => {
    let wide = 2000;
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) { return this.id === 'ribbon-tools' ? wide - (this.querySelectorAll('[aria-haspopup][title$=": its tools"]').length * 400) : 0; });
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) { return this.id === 'ribbon-tools' ? 1600 : 0; });
    show('line');
    const shut = () => [...document.querySelectorAll('button[title$=": its tools"]')].map((b) => b.textContent);
    expect(shut()).toEqual(['File ▾']);
    act(() => { (document.querySelector('button[title="File: its tools"]') as HTMLButtonElement).click(); });
    expect([...document.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent)).toContain('Save DWG');
    wide = 2400;
    act(() => { window.dispatchEvent(new Event('resize')); });
    expect(shut()).toEqual(['File ▾', 'Layers ▾']);
  });
});
