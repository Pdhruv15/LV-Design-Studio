// @vitest-environment jsdom
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
    set('Arrow', 'filled'); set('Second arrow', 'dot'); set('Line past extension lines', '1.5'); set('Hide extension line 2', true);
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
