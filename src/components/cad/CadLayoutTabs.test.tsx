// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LayoutTabs } from './CadLayouts';
import type { DrawingSheet } from '../../model/drawingSet';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; });

const sheet = { id: 'sh1', number: 'E-LTG-001', title: 'Lighting layout', kind: 'plan' } as DrawingSheet;
const fn = () => vi.fn();
const render = (over: Partial<Parameters<typeof LayoutTabs>[0]> = {}) => {
  const props = { files: [{ id: 'file:Layout1', name: 'Layout1', title: '420 × 297 mm · no viewports' }], layouts: [sheet], active: 'file:Layout1', onPick: fn(), onNew: fn(), onRename: fn(), onCopy: fn(), onMove: fn(), onDelete: fn(), onPageSetup: fn(), ...over };
  act(() => root.render(<LayoutTabs {...props} />));
  return props;
};
const tabs = () => [...document.querySelectorAll('[role="tab"]')].map((t) => [t.textContent, t.getAttribute('aria-selected')]);

describe('Model and layout tabs', () => {
  it('Model, the file\'s own layouts, then the project\'s plan sheets marked as sheets; + for a new one', () => {
    const p = render();
    expect(tabs()).toEqual([['Model', 'false'], ['Layout1', 'true'], ['E-LTG-001sheet', 'false']]);
    expect(document.querySelector('[aria-label="New layout"]')).not.toBeNull();
    act(() => (document.querySelectorAll('[role="tab"]')[1] as HTMLButtonElement).click());
    expect(p.onPick).toHaveBeenCalledWith('file:Layout1');
  });

  it('no + when not offered; no sheet mark without file layouts', () => {
    render({ onNew: undefined, files: [], active: null });
    expect(document.querySelector('[aria-label="New layout"]')).toBeNull();
    expect(tabs()).toEqual([['Model', 'true'], ['E-LTG-001', 'false']]);
  });

  it('+ makes a layout at once; layouts made on the drawing after the file\'s own; right-click has their commands, then New plan sheet', () => {
    const onDrawing = { rename: fn(), copy: fn(), move: fn(), remove: fn() }, onNewSheet = fn();
    const p = render({ drawings: [{ id: 'dwg:Layout2', name: 'Layout2', title: '420 × 297 mm · 1 viewport at 1:100' }], onDrawing, onNewSheet });
    expect(tabs().map((t) => t[0])).toEqual(['Model', 'Layout1', 'Layout2', 'E-LTG-001sheet']);
    act(() => (document.querySelector('[aria-label="New layout"]') as HTMLButtonElement).click());
    expect(p.onNew).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="menu"]')).toBeNull();
    const items = () => [...document.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent);
    act(() => document.querySelectorAll('[role="tab"]')[2].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true })));
    expect(items()).toEqual(['Rename…', 'Copy', 'Move left', 'Move right', 'Delete', 'Lighting layout E-LTG-', 'Power layout E-PWR-', 'ELV layout E-ELV-', 'Containment layout E-CNT-']);
    expect(document.querySelector('.cad-tab-menu-h')!.textContent).toBe('New plan sheet of the level');
    act(() => (document.querySelectorAll('[role="menuitem"]')[4] as HTMLButtonElement).click());
    expect(onDrawing.remove).toHaveBeenCalledWith(expect.objectContaining({ name: 'Layout2' }));
    act(() => document.querySelectorAll('[role="tab"]')[0].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true })));
    expect(items()).toEqual(['Lighting layout E-LTG-', 'Power layout E-PWR-', 'ELV layout E-ELV-', 'Containment layout E-CNT-']);
    act(() => (document.querySelectorAll('[role="menuitem"]')[1] as HTMLButtonElement).click());
    expect(onNewSheet).toHaveBeenCalledWith('power');
  });
});
