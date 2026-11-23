// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DimStyleDialog } from './CadDialogs';
import { dimStylesOf, type CadDimStyle, type CadStyles } from '../../model/cadStyles';
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
const ok = () => act(() => { q<HTMLButtonElement>('.cad-dlg-ft .p')!.click(); });

function render() {
  const onSave = vi.fn<(s: CadStyles<CadDimStyle>) => void>();
  act(() => root.render(<DimStyleDialog styles={dimStylesOf(sampleProject)} asBefore onSave={onSave} onClose={() => {}} />));
  return onSave;
}

describe('Dimension style dialog', () => {
  it('sets arrows, text placement and the length format on their tabs, the preview following', () => {
    const onSave = render();
    expect(q('[aria-label^="Preview: "]')!.getAttribute('aria-label')).toBe('Preview: 3.20');
    set('Arrow', 'filled'); set('Second arrow', 'dot'); set('Extend past extension lines', '1.5'); set('Hide extension line 2', true);
    tab('Text');
    set('Vertical', 'centered'); set('Along the line', 'second'); set('Gap from line', '1'); set('Text always horizontal', true);
    tab('Units');
    set('Unit', 'cm'); set('Decimal places', '1'); set('Suffix', ' cm'); set('Measurement scale', '0'); // 0: not taken
    expect(q('[aria-label^="Preview: "]')!.getAttribute('aria-label')).toBe('Preview: 320.0 cm');
    set('Drop trailing zeros', true);
    expect(q('[aria-label^="Preview: "]')!.getAttribute('aria-label')).toBe('Preview: 320 cm');
    ok();
    expect(onSave.mock.calls[0][0].styles[0]).toMatchObject({
      name: 'Standard', arrow: 'filled', arrow2: 'dot', dleMm: 1.5, hideExt2: true, textPos: 'centered', textAlong: 'second', gapMm: 1, textFlat: true,
      unit: 'cm', decimals: 1, suffix: ' cm', scale: 1, trimZeros: true
    });
  });

  it('puts the styles beside the preview, Import DXF with the style buttons, and only ?, Cancel and OK in the footer', () => {
    render();
    expect([...document.querySelectorAll('.cad-dlg-top .cad-dlg-btns button')].map((b) => b.textContent)).toEqual(['New', 'Delete', 'Set current', 'Import DXF…']);
    expect([...document.querySelectorAll('.cad-dlg-ft button')].map((b) => b.textContent)).toEqual(['?', 'Cancel', 'OK']);
    expect(q('.cad-dlg-top [aria-label="Style name"]')).not.toBeNull();
    expect(q('.cad-dlg-top [aria-label^="Preview: "]')).not.toBeNull();
    // Both extension lines on one row; the sections of the first tab.
    expect(q('[role="group"][aria-label="Hide extension lines"]')!.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
    expect([...document.querySelectorAll('.cad-dlg-body .cad-dlg-sec')].map((x) => x.textContent)).toEqual(['Arrows', 'Extension lines', 'Dimension line']);
    // Standard unchanged: one line under the preview, the whole sentence behind ?.
    expect(q('.cad-dlg-cap[role="note"]')!.textContent).toBe('Draws as before until changed');
    act(() => { q<HTMLButtonElement>('.cad-dlg-ft .q')!.click(); });
    expect(q('.cad-dlg > .cad-dlg-help')!.textContent).toMatch(/Standard draws as before \(sizes follow each dimension's length\) until it is changed\.$/);
    tab('Units');
    expect(q('[role="group"][aria-label="Prefix and suffix"]')!.querySelectorAll('input')).toHaveLength(2);
  });

  it('marks in gold, in the preview, the part the value with the cursor (or else the row under the mouse) changes, and names it', () => {
    render();
    const gold = () => [...document.querySelectorAll('[aria-label^="Preview: "] path')].filter((x) => x.getAttribute('stroke') === '#875800' && !x.getAttribute('stroke-opacity'));
    const cap = () => q('.cad-dlg-cap')!;
    expect(gold()).toHaveLength(0);
    act(() => { q<HTMLInputElement>('[aria-label="Extend beyond dimension line"]')!.focus(); });
    expect(cap().textContent).toBe('Extend beyond dimension line');
    expect(cap().classList.contains('on')).toBe(true);
    // The four pieces past the dimension lines, each 1.25 mm long.
    const d = gold()[0].getAttribute('d')!;
    expect(d.match(/M/g)).toHaveLength(4);
    expect(d.startsWith('M0.00 -6.00L0.00 -7.25')).toBe(true);
    act(() => { q<HTMLInputElement>('[aria-label="Extend beyond dimension line"]')!.blur(); });
    expect(gold()).toHaveLength(0);
    expect(cap().textContent).toBe('Draws as before until changed');
    // The mouse over a row marks its part; leaving the rows clears it.
    act(() => { q('[aria-label="Second arrow"]')!.dispatchEvent(new MouseEvent('pointerover', { bubbles: true })); });
    expect(cap().textContent).toBe('Second arrow');
    expect(gold()).toHaveLength(1);
    act(() => { q('.cad-dlg-body')!.dispatchEvent(new MouseEvent('pointerout', { bubbles: true, relatedTarget: document.body })); });
    expect(cap().textContent).toBe('Draws as before until changed');
    // A hidden extension line shows dashed while its row is marked.
    set('Hide extension line 1', true);
    act(() => { q('[aria-label="Hide extension line 1"]')!.dispatchEvent(new MouseEvent('pointerover', { bubbles: true })); });
    expect(q('[aria-label^="Preview: "] path[stroke-dasharray]')!.getAttribute('d')!.match(/M/g)).toHaveLength(2);
    tab('Text');
    act(() => { q<HTMLInputElement>('[aria-label="Text height"]')!.focus(); }); // the value being typed wins over the mouse
    expect([...document.querySelectorAll<SVGTextElement>('[aria-label^="Preview: "] text')].map((t) => t.style.fill)).toEqual(['rgb(135, 88, 0)', 'rgb(135, 88, 0)']);
  });

  it('shows the arrow chosen beside each list, the second as the first while As first', () => {
    render();
    const sw = (label: string) => q(`[aria-label="${label}"]`)!.parentElement!.querySelector('.cad-dlg-sw path')!.getAttribute('d');
    const tick = sw('Arrow');
    expect(sw('Second arrow')).toBe(tick);
    set('Arrow', 'dot');
    expect(sw('Arrow')).not.toBe(tick);
    expect(sw('Second arrow')).toBe(sw('Arrow'));
    set('Second arrow', 'box');
    expect(sw('Second arrow')).not.toBe(sw('Arrow'));
  });

  it('draws the preview\'s text with its capitals at the style\'s text height, under the app\'s svg text rule', () => {
    // The app's `svg text` rule (11 px) beat the font-size attribute: 11 mm text in the 52 mm preview.
    const style = document.head.appendChild(document.createElement('style'));
    style.textContent = readFileSync('src/styles.css', 'utf8').match(/(?:^|\n)svg text\{[^}]*\}/)![0];
    render();
    tab('Text');
    set('Text height', '3.5');
    const t = q('[aria-label^="Preview: "] text')!;
    expect(parseFloat(getComputedStyle(t).fontSize)).toBeCloseTo((3.5 * 2048) / 1467, 4); // Arial's em per capital
    style.remove();
  });

  it('imports the dimension styles of a DXF, the drawing\'s current one selected, and says what it read', async () => {
    const onSave = render();
    const text = ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '4', '9', '$DIMSTYLE', '2', 'B', '0', 'ENDSEC', '0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'DIMSTYLE',
      '0', 'DIMSTYLE', '2', 'A', '0', 'DIMSTYLE', '2', 'B', '41', '3.5', '0', 'ENDTAB', '0', 'ENDSEC', '0', 'EOF', ''].join('\n');
    const input = q<HTMLInputElement>('input[type="file"][aria-label="Import dimension styles"]')!;
    Object.defineProperty(input, 'files', { configurable: true, value: [new File([text], 'arch.dxf')] });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
    await act(async () => {});
    expect(q('[role="status"]')!.textContent).toBe('Imported 2 styles from arch.dxf: A, B. OK keeps them.');
    expect(q<HTMLInputElement>('[aria-label="Style name"]')!.value).toBe('B');
    expect(q<HTMLInputElement>('[aria-label="Arrow size"]')!.value).toBe('3.5');
    ok();
    expect(onSave.mock.calls[0][0].styles.map((s) => s.name)).toEqual(['Standard', 'A', 'B']);
  });

  it('says why a file cannot be imported', async () => {
    render();
    const input = q<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { configurable: true, value: [new File(['AC1032 binary'], 'plan.dwg')] });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
    await act(async () => {});
    expect(q('[role="alert"]')!.textContent).toMatch(/^This is a DWG drawing\./);
  });
});
