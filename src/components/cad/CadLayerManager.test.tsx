// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LayerPalette, layerRows, type LayerRow } from './CadLayerManager';
import type { CadView } from '../../engines/cad/cadEngine';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; });

const view = { file: 'GF.dwg', info: { layers: [{ name: 'A-WALL', count: 120 }, { name: 'A-DOOR', count: 8 }] } } as unknown as CadView;
const q = (sel: string) => document.querySelector(sel) as HTMLElement;
const btn = (label: string) => q(`[aria-label="${label}"]`) as HTMLButtonElement;
const status = () => q('[aria-label="Layer palette"] [role="status"]').textContent;
const name = (n: string) => [...document.querySelectorAll<HTMLElement>('.cad-lp-name')].find((td) => td.textContent === n)!;
const names = () => [...document.querySelectorAll('.cad-lp-name')].map((td) => td.textContent);
const type = (el: HTMLInputElement, v: string) => act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
const click = (el: HTMLElement, init: MouseEventInit = {}) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, ...init })); });
const key = (el: HTMLElement, k: string) => act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); });

function render(rows: LayerRow[], over: Partial<Parameters<typeof LayerPalette>[0]> = {}) {
  const props = {
    file: 'GF.dwg', rows, current: 'LV-SKETCH', states: [], isolated: false,
    onApply: vi.fn(), onNew: vi.fn(() => 'Layer1'), onRename: vi.fn((): string | undefined => undefined), onDelete: vi.fn(), onCurrent: vi.fn(),
    onIsolate: vi.fn(), onUnisolate: vi.fn(), onSaveState: vi.fn(), onRestoreState: vi.fn(), onDeleteState: vi.fn(), onClose: vi.fn(), ...over
  };
  act(() => root.render(<LayerPalette {...props} />));
  return props;
}
const rowsOf = (styles = {}, added: string[] = []) => layerRows({ view, layersOn: Uint8Array.from([1, 0]), sketch: [{ id: 'S1', kind: 'line', layer: 'LV-SKETCH', pts: [[0, 0], [1, 0]] }], styles, added });

describe('Layer palette', () => {
  it('one table: drawn layers, then the architect\'s, with their state; the help is in the column tooltips', () => {
    render(rowsOf({ 'LV-ANNO': { noPrint: true, freeze: true } }));
    expect(names()).toEqual(['LV-SKETCH', 'LV-ANNO', 'LV-HATCH', 'A-WALL', 'A-DOOR']);
    expect([...document.querySelectorAll('.cad-lp-grp')].map((g) => g.textContent)).toEqual(['Drawn in the app', 'Architect\'s drawing']);
    expect([btn('LV-SKETCH prints').getAttribute('aria-pressed'), btn('LV-ANNO prints').getAttribute('aria-pressed')]).toEqual(['true', 'false']);
    expect(btn('LV-ANNO frozen').getAttribute('aria-pressed')).toBe('true');
    expect(btn('A-DOOR on').getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelector('[aria-label="A-WALL prints"]')).toBeNull(); // the architect's: On, Freeze, Lock, colour
    expect(q('th[title^="Untick Print to keep a layer on screen but off the plan sheets."]').textContent).toBe('Pr');
    expect(q('[aria-label="LV-SKETCH is current"]')).not.toBeNull();
    expect(status()).toBe('Current layer: LV-SKETCH · 5 layers');
  });

  it('a toggle on a selected row goes to every row selected (shift and ctrl/cmd add rows)', () => {
    const p = render(rowsOf());
    click(name('LV-ANNO'));
    click(name('A-WALL'), { shiftKey: true });
    expect(status()).toContain('3 selected');
    act(() => { btn('LV-HATCH locked').click(); });
    expect(p.onApply).toHaveBeenLastCalledWith([expect.objectContaining({ name: 'LV-ANNO' }), expect.objectContaining({ name: 'LV-HATCH' }), expect.objectContaining({ name: 'A-WALL' })], { lock: true });
    click(name('LV-SKETCH'), { metaKey: true });
    act(() => { btn('LV-ANNO frozen').click(); }); // the current layer is left out of a freeze
    expect(vi.mocked(p.onApply).mock.calls[1][0].map((r: LayerRow) => r.name)).toEqual(['LV-ANNO', 'LV-HATCH', 'A-WALL']);
    expect(status()).toContain('LV-SKETCH is the current layer; it cannot be frozen.');
    // A row not selected: the change is its own, and it becomes the selection.
    act(() => { btn('A-DOOR on').click(); });
    expect(p.onApply).toHaveBeenLastCalledWith([expect.objectContaining({ name: 'A-DOOR' })], { on: true });
    expect(status()).toBe('Current layer: LV-SKETCH · 5 layers');
  });

  it('renames by double-click or F2, not the app\'s or the architect\'s layers; deletes only an empty layer not current', () => {
    const p = render(rowsOf({}, ['E-LIGHT']));
    act(() => { name('LV-ANNO').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
    expect(status()).toContain('LV-ANNO is one of the app\'s own layers; it keeps its name.');
    click(name('A-WALL'));
    key(name('A-WALL'), 'F2');
    expect(status()).toContain('The architect\'s layers keep their names.');
    click(name('E-LIGHT'));
    key(name('E-LIGHT'), 'F2');
    const input = q('[aria-label="Layer name"]') as HTMLInputElement;
    type(input, 'E-LIGHT-SW');
    key(input, 'Enter');
    expect(p.onRename).toHaveBeenCalledWith('E-LIGHT', 'E-LIGHT-SW');
    expect(document.querySelector('[aria-label="Layer name"]')).toBeNull();
    // Delete: an app layer says why not; an empty layer goes.
    click(name('LV-SKETCH'));
    act(() => { btn('Delete layer').click(); });
    expect(status()).toContain('LV-SKETCH is one of the app\'s own layers.');
    expect(p.onDelete).not.toHaveBeenCalled();
    click(name('E-LIGHT'));
    key(name('E-LIGHT'), 'Delete');
    expect(p.onDelete).toHaveBeenCalledWith([expect.objectContaining({ name: 'E-LIGHT' })]);
  });

  it('a rename refused keeps the edit open and says why', () => {
    render(rowsOf({}, ['E-LIGHT']), { onRename: vi.fn(() => 'There is already a layer A-WALL.') });
    act(() => { name('E-LIGHT').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
    const input = q('[aria-label="Layer name"]') as HTMLInputElement;
    type(input, 'A-WALL');
    key(input, 'Enter');
    expect(status()).toContain('There is already a layer A-WALL.');
    key(q('[aria-label="Layer name"]'), 'Escape');
    expect(names()).toContain('E-LIGHT');
  });

  it('filters by the tree and a typed pattern; New layer starts its rename; set current', () => {
    const p = render(rowsOf({}, ['E-LIGHT']));
    const filter = q('[aria-label="Filter layers"]') as HTMLInputElement;
    type(filter, 'A-*');
    expect(names()).toEqual(['A-WALL', 'A-DOOR']);
    expect(status()).toBe('Current layer: LV-SKETCH · 6 layers · 2 shown by filter');
    type(filter, '');
    act(() => { [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Layer filters"] button')].find((b) => b.textContent === 'In use')!.click(); });
    expect(names()).toEqual(['LV-SKETCH', 'A-WALL', 'A-DOOR']);
    act(() => { [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Layer filters"] button')].find((b) => b.textContent === 'All')!.click(); });
    act(() => { name('E-LIGHT').previousElementSibling!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
    expect(p.onCurrent).toHaveBeenCalledWith('E-LIGHT');
    click(name('A-WALL'));
    act(() => { btn('Set current').click(); });
    expect(status()).toContain('A-WALL is the architect\'s: new objects go on the app\'s drawn layers.');
    act(() => { btn('New layer').click(); });
    expect(p.onNew).toHaveBeenCalled();
  });

  it('layer states: restore one, save under a name', () => {
    const p = render(rowsOf(), { states: [{ name: 'Lighting check', layers: {} }] });
    const open = () => act(() => { [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Layer states ▾')!.click(); });
    open();
    act(() => { [...document.querySelectorAll<HTMLButtonElement>('.cad-lp-state button')].find((b) => b.textContent === 'Lighting check')!.click(); });
    expect(p.onRestoreState).toHaveBeenCalledWith('Lighting check');
    open();
    const input = q('[aria-label="New layer state name"]') as HTMLInputElement;
    type(input, 'Tray only');
    act(() => { input.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(p.onSaveState).toHaveBeenCalledWith('Tray only');
    expect(status()).toContain('Layer state Tray only saved.');
  });
});
