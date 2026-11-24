// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TextStyleDialog } from './CadDialogs';
import { textStylesOf, type CadStyles, type CadTextStyle } from '../../model/cadStyles';
import { EM_PER_CAP } from '../../model/cadText';
import { sampleProject } from '../../data/sampleProject';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; });

const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector(sel) as T | null;
const set = (label: string, v: string) => act(() => {
  const el = q<HTMLInputElement>(`[aria-label="${label}"]`)!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
});

function render(styles = textStylesOf(sampleProject)) {
  const onSave = vi.fn<(s: CadStyles<CadTextStyle>) => void>();
  act(() => root.render(<TextStyleDialog styles={styles} annoMm={2.5} onSave={onSave} onClose={() => {}} />));
  return onSave;
}

describe('Text style dialog', () => {
  it('puts the styles beside a sample of the text on paper, at the style\'s height or else the annotation height', () => {
    render();
    expect([...document.querySelectorAll('.cad-dlg-top .cad-dlg-btns button')].map((b) => b.textContent)).toEqual(['New', 'Delete', 'Set current']);
    expect(q('.cad-dlg-top [aria-label="Style name"]')).not.toBeNull();
    // Standard asks each time: the sample at the annotation height, and the line under it says so.
    expect(q('.cad-dlg-top [aria-label^="Preview: "]')!.getAttribute('aria-label')).toBe('Preview: AaBb 123, 2.5 mm');
    expect(q('.cad-dlg-cap[role="note"]')!.textContent).toBe('Asked each time, from 2.5 mm');
    act(() => { [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'New')!.click(); });
    set('Height', '5');
    expect(q('[aria-label^="Preview: "]')!.getAttribute('aria-label')).toBe('Preview: AaBb 123, 5 mm');
    expect(q<SVGTextElement>('[aria-label^="Preview: "] text')!.style.fontSize).toBe(`${+(5 * EM_PER_CAP).toFixed(3)}px`);
    expect(q('.cad-dlg-cap[role="note"]')).toBeNull();
  });

  it('marks the height or the text in gold while its value has the cursor or its row the mouse', () => {
    render();
    const bar = () => [...document.querySelectorAll('[aria-label^="Preview: "] path')].find((x) => !x.getAttribute('stroke-opacity') && x.getAttribute('d')!.startsWith('M-3 0V'))!;
    expect(bar().getAttribute('stroke')).toBe('black');
    act(() => { q<HTMLInputElement>('[aria-label="Height"]')!.focus(); });
    expect(q('.cad-dlg-cap')!.textContent).toBe('Height');
    expect(bar().getAttribute('stroke')).toBe('#875800');
    act(() => { q<HTMLInputElement>('[aria-label="Height"]')!.blur(); });
    act(() => { q('[aria-label="Font"]')!.dispatchEvent(new MouseEvent('pointerover', { bubbles: true })); });
    expect(q('.cad-dlg-cap')!.textContent).toBe('Font');
    expect(q<SVGTextElement>('[aria-label^="Preview: "] text')!.style.fill).toBe('rgb(135, 88, 0)');
  });
});
