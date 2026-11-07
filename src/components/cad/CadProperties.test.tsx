// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PropertiesPalette } from './CadProperties';
import type { SketchItem } from '../../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; });

const q = (sel: string) => document.querySelector(sel) as HTMLElement;
const el = (label: string) => q(`[aria-label="${label}"]`);
const status = () => q('[aria-label="Properties palette"] [role="status"]').textContent;
const rowText = () => [...document.querySelectorAll('.cad-pp-row')].map((r) => `${r.querySelector('.k')!.textContent}=${(r.querySelector('select') as HTMLSelectElement | null)?.selectedOptions[0]?.textContent ?? r.querySelector('.v')!.textContent}`);
const type = (input: HTMLInputElement, v: string) => act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, v); input.dispatchEvent(new Event('input', { bubbles: true })); });
const key = (t: HTMLElement, k: string, shiftKey = false) => act(() => { t.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true })); });

const a: SketchItem = { id: 'S1', kind: 'line', layer: 'LV-SKETCH', pts: [[4000, 1000], [7000, 1000]], lt: 'dashed' };
const b: SketchItem = { id: 'S2', kind: 'line', layer: 'LV-SKETCH', pts: [[4000, 2000], [7000, 2000]] };
const t: SketchItem = { id: 'X1', kind: 'text', layer: 'LV-ANNO', pts: [[0, 0]], text: 'DB-1', h: 250, rot: 0 };

function render(items: SketchItem[], over: Partial<Parameters<typeof PropertiesPalette>[0]> = {}) {
  const props = { items, devices: 0, layers: ['LV-SKETCH', 'LV-ANNO', 'LV-HATCH'], styles: { 'LV-ANNO': { noPrint: true } }, current: 'LV-SKETCH', textMm: 2.5, k: 0.001,
    onItems: vi.fn(), onCurrent: vi.fn(), onTextMm: vi.fn(), onClose: vi.fn(), ...over };
  act(() => root.render(<PropertiesPalette {...props} />));
  return props;
}

describe('Properties palette', () => {
  it('nothing picked: the defaults for new objects', () => {
    const p = render([]);
    expect(rowText()).toEqual(['Layer=LV-SKETCH', 'Colour=ByLayer', 'Linetype=ByLayer', 'Lineweight=ByLayer', 'Print=Yes (layer)', 'Text height=2.5 mm']);
    const cur = el('Current layer') as HTMLSelectElement;
    act(() => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(cur, 'LV-ANNO'); cur.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(p.onCurrent).toHaveBeenCalledWith('LV-ANNO');
    act(() => { (el('Text height') as HTMLButtonElement).click(); });
    type(el('Text height') as HTMLInputElement, '3,5');
    key(el('Text height'), 'Enter');
    expect(p.onTextMm).toHaveBeenCalledWith(3.5);
  });

  it('two lines: shared values, varies apart from ByLayer, geometry in metres and degrees', () => {
    render([a, b]);
    expect(rowText()).toEqual(['Layer=LV-SKETCH', 'Colour=ByLayer', 'Linetype=varies', 'Lineweight=ByLayer', 'Print=Yes (layer)',
      'Start X=4.00', 'Start Y=varies', 'End X=7.00', 'End Y=varies', 'Length=3.00 m', 'Angle=0.0°']);
    expect(q('.cad-pp-vr').textContent).toBe('varies');
    expect([...document.querySelectorAll('.cad-pp-sec')].map((s) => s.textContent)).toEqual(['▾ General', '▾ Geometry']);
  });

  it('click a value: Enter applies to all, Esc puts it back, Tab goes to the next row', () => {
    const p = render([a, b]);
    act(() => { (el('End X') as HTMLButtonElement).click(); });
    const input = el('End X') as HTMLInputElement;
    expect(input.value).toBe('7.00');
    type(input, '7.5');
    key(input, 'Enter');
    expect(p.onItems).toHaveBeenCalledTimes(1); // one undo step
    expect(vi.mocked(p.onItems).mock.calls[0][0].map((it: SketchItem) => it.pts[1])).toEqual([[7500, 1000], [7500, 2000]]);
    expect(vi.mocked(p.onItems).mock.calls[0][1]).toBe('2 objects: end x 7.50');
    act(() => { (el('Start X') as HTMLButtonElement).click(); });
    type(el('Start X') as HTMLInputElement, '99');
    key(el('Start X'), 'Escape');
    expect(p.onItems).toHaveBeenCalledTimes(1);
    expect((el('Start X') as HTMLButtonElement).tagName).toBe('BUTTON');
    act(() => { (el('Start X') as HTMLButtonElement).click(); });
    key(el('Start X'), 'Tab');
    expect(document.activeElement).toBe(el('Start Y'));
    expect((el('Start Y') as HTMLInputElement).value).toBe(''); // varies: typed fresh
    type(el('Start Y') as HTMLInputElement, 'x');
    key(el('Start Y'), 'Enter');
    expect(status()).toBe('Start Y: type a number.');
  });

  it('the kind drop-down limits the palette to one kind; text has its own section; folding', () => {
    const p = render([a, b, t]);
    expect([...document.querySelectorAll('[aria-label="Objects shown"] option')].map((o) => o.textContent)).toEqual(['All (3)', 'Line (2)', 'Text (1)']);
    expect(document.body.textContent).toContain('Pick one kind above for its geometry.');
    const kind = el('Objects shown') as HTMLSelectElement;
    act(() => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(kind, 'Text'); kind.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(rowText().slice(5)).toEqual(['Contents=DB-1', 'Height=0.25', 'Rotation=0.0°']);
    expect(rowText()[4]).toBe('Print=No (layer)');
    act(() => { [...document.querySelectorAll<HTMLButtonElement>('.cad-pp-sec')].find((s) => s.textContent === '▾ General')!.click(); });
    expect(rowText()[0]).toBe('Contents=DB-1');
    act(() => { (el('Rotation') as HTMLButtonElement).click(); });
    type(el('Rotation') as HTMLInputElement, '90');
    key(el('Rotation'), 'Enter');
    expect(vi.mocked(p.onItems).mock.calls[0][0]).toEqual([{ ...t, rot: Math.PI / 2 }]);
  });

  it('a polyline steps through its vertices; a tray takes width and service, its layer stays', () => {
    const tray: SketchItem = { id: 'T1', kind: 'pline', layer: 'E-TRAY', pts: [[0, 0], [6000, 0], [6000, 3000]], tray: { widthMm: 300, route: 'TR-1' } };
    const p = render([tray]);
    expect(rowText().slice(5)).toEqual(['Vertex=◀1 of 3▶', 'Width=300 mm', 'Service=None', 'X=0.00', 'Y=0.00', 'Length=9.00 m']);
    expect((el('Object layer') as HTMLSelectElement).disabled).toBe(true);
    act(() => { (el('Next vertex') as HTMLButtonElement).click(); });
    act(() => { (el('Next vertex') as HTMLButtonElement).click(); });
    expect(rowText().slice(8, 10)).toEqual(['X=6.00', 'Y=3.00']);
    act(() => { (el('Y') as HTMLButtonElement).click(); });
    type(el('Y') as HTMLInputElement, '4');
    key(el('Y'), 'Enter');
    expect(vi.mocked(p.onItems).mock.calls[0][0]).toEqual([{ ...tray, pts: [[0, 0], [6000, 0], [6000, 4000]] }]);
    const w = el('Width') as HTMLSelectElement;
    act(() => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(w, '450'); w.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(vi.mocked(p.onItems).mock.calls[1][0][0].tray).toEqual({ widthMm: 450, route: 'TR-1' });
  });
});
