// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MleaderStyleDialog } from './CadDialogs';
import { mleaderStylesOf, type CadMleaderStyle, type CadStyles } from '../../model/cadStyles';
import { sampleProject } from '../../data/sampleProject';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; });

const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector(sel) as T | null;
const set = (label: string, v: string | boolean) => act(() => {
  const el = q<HTMLInputElement | HTMLSelectElement>(`[aria-label="${label}"]`)!;
  if (typeof v === 'boolean') { (el as HTMLInputElement).click(); return; }
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!.call(el, v);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
});
const tab = (name: string) => act(() => { [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((b) => b.textContent === name)!.click(); });
const button = (name: string) => act(() => { [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === name)!.click(); });
const ok = () => act(() => { q<HTMLButtonElement>('.cad-dlg-ft .p')!.click(); });

function render(styles = mleaderStylesOf(sampleProject)) {
  const onSave = vi.fn<(s: CadStyles<CadMleaderStyle>) => void>();
  act(() => root.render(<MleaderStyleDialog styles={styles} annoMm={2.5} onSave={onSave} onClose={() => {}} />));
  return onSave;
}

describe('Multileader style dialog', () => {
  it('has its three tabs and sets the arrowhead, landing and content on them', () => {
    const onSave = render();
    expect([...document.querySelectorAll('[role="tab"]')].map((b) => b.textContent)).toEqual(['Leader format', 'Leader structure', 'Content']);
    set('Arrowhead', 'dot'); set('Arrow size', '4');
    tab('Leader structure');
    set('Landing length', '5'); set('Landing', false);
    tab('Content');
    set('Content', 'none'); set('Text height (0 = annotation height)', '3.5'); set('Gap', '2'); set('Frame', true); set('Fill in the circuit of the device at the arrowhead', true);
    ok();
    expect(onSave.mock.calls[0][0].styles[0]).toMatchObject({ name: 'Standard', arrow: 'dot', arrowMm: 4, landing: false, landingMm: 5, content: 'none', textMm: 3.5, gapMm: 2, frame: true, circuit: true });
  });

  it('keeps the preview\'s words black and at the style\'s text height under the app\'s svg text rule', () => {
    // The app's `svg text` rule (11 px, the theme's text colour) beat the attributes: in the dark themes the words
    // were near-white on the white preview, and 11 mm high.
    const style = document.head.appendChild(document.createElement('style'));
    style.textContent = readFileSync('src/styles.css', 'utf8').match(/(?:^|\n)svg text\{[^}]*\}/)![0];
    render();
    tab('Content');
    set('Text height (0 = annotation height)', '3.5');
    const cs = getComputedStyle(q('[aria-label="Preview"] svg text')!);
    expect(cs.fill).toBe('rgb(0, 0, 0)');
    expect(parseFloat(cs.fontSize)).toBeCloseTo((3.5 * 2048) / 1467, 2); // Arial's em per capital
    style.remove();
  });

  it('draws the preview black on white: two leaders to a landing and the words L1-03, with the frame when on, and no words for a style with none', () => {
    render();
    const prev = () => q('[aria-label="Preview"] svg')!;
    expect(prev().getAttribute('style')).toContain('background: white');
    expect(prev().querySelector('path')!.getAttribute('stroke')).toBe('black');
    expect(prev().querySelector('text')!.textContent).toBe('L1-03');
    const d = () => prev().querySelector('path')!.getAttribute('d')!;
    const plain = d();
    tab('Content');
    set('Frame', true);
    expect(d().length).toBeGreaterThan(plain.length);
    expect(d().endsWith('Z')).toBe(true);
    set('Content', 'none');
    expect(prev().querySelector('text')).toBeNull();
  });

  it('makes a new style from the one selected, sets another current, and keeps Standard', () => {
    const onSave = render();
    button('New');
    expect([...document.querySelectorAll('[role="option"] span')].map((b) => b.textContent)).toEqual(['Standard', 'Style 1']);
    tab('Content');
    set('Fill in the circuit of the device at the arrowhead', true);
    button('Set current');
    button('Delete'); // the current one cannot be deleted
    expect(q('[role="alert"]')!.textContent).toBe('Set another style current first.');
    ok();
    const saved = onSave.mock.calls[0][0];
    expect(saved.current).toBe('Style 1');
    expect(saved.styles.map((x) => [x.name, x.circuit])).toEqual([['Standard', false], ['Style 1', true]]);
  });

  it('puts the styles beside the preview, and marks in gold the part the value with the cursor or the row under the mouse changes', () => {
    render();
    expect([...document.querySelectorAll('.cad-dlg-top .cad-dlg-btns button')].map((b) => b.textContent)).toEqual(['New', 'Delete', 'Set current']);
    expect(q('.cad-dlg-top [aria-label="Style name"]')).not.toBeNull();
    expect(q('.cad-dlg-top [aria-label="Preview"]')).not.toBeNull();
    expect(q('[aria-label="Arrowhead"]')!.parentElement!.querySelector('.cad-dlg-sw')).not.toBeNull();
    const gold = () => [...document.querySelectorAll('[aria-label="Preview"] path')].filter((x) => x.getAttribute('stroke') === '#875800' && !x.getAttribute('stroke-opacity'));
    const cap = () => q('.cad-dlg-cap')!.textContent;
    act(() => { q<HTMLInputElement>('[aria-label="Arrow size"]')!.focus(); });
    expect(cap()).toBe('Arrow size');
    expect(gold()).toHaveLength(1); // the two arrowheads
    act(() => { q<HTMLInputElement>('[aria-label="Arrow size"]')!.blur(); });
    expect(gold()).toHaveLength(0);
    tab('Leader structure');
    act(() => { q('[aria-label="Landing length"]')!.dispatchEvent(new MouseEvent('pointerover', { bubbles: true })); });
    expect(cap()).toBe('Landing length');
    expect(gold()[0].getAttribute('d')!.match(/M/g)).toHaveLength(1);
    tab('Content');
    set('Frame', true);
    act(() => { q('[aria-label="Frame"]')!.dispatchEvent(new MouseEvent('pointerover', { bubbles: true })); });
    expect(gold()[0].getAttribute('d')!.endsWith('Z')).toBe(true);
    act(() => { q<HTMLInputElement>('[aria-label="Gap"]')!.focus(); });
    expect(cap()).toBe('Gap');
    expect(q('[aria-label="Preview"] path[stroke-opacity="0.35"]')).not.toBeNull();
    act(() => { q<HTMLInputElement>('[aria-label="Text height (0 = annotation height)"]')!.focus(); });
    expect(q<SVGTextElement>('[aria-label="Preview"] text')!.style.fill).toBe('rgb(135, 88, 0)');
  });

  it('refuses to delete Standard', () => {
    render();
    button('Delete');
    expect(q('[role="alert"]')!.textContent).toBe('Standard cannot be deleted.');
  });
});
