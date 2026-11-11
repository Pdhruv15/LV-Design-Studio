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

  it('no + without a level to make plan sheets for; no sheet mark without file layouts', () => {
    render({ onNew: undefined, files: [], active: null });
    expect(document.querySelector('[aria-label="New layout"]')).toBeNull();
    expect(tabs()).toEqual([['Model', 'true'], ['E-LTG-001', 'false']]);
  });
});
