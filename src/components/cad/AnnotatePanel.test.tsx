// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HatchPanel } from './AnnotatePanel';
import { parsePat, type HatchSpec } from '../../model/cadHatch';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; });

const { patterns } = parsePat('*MYGRID, Office grid\n0, 0,0, 0,5\n90, 0,0, 0,5\n*MYSOLID\n*SOLID\n45, 0,0, 0,1');
const start: HatchSpec = { pattern: 'ansi31', scale: 3, angle: 15 };
const select = () => host.querySelector('select[aria-label="Hatch pattern"]') as HTMLSelectElement;
const choose = (v: string) => act(() => { const s = select(); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); });

describe('Hatch panel', () => {
  it('lists the project\'s patterns after the built-in ones; picking one keeps the spacing and angle', () => {
    const onSpec = vi.fn();
    act(() => root.render(<HatchPanel spec={start} onSpec={onSpec} patterns={patterns} onImport={() => undefined} />));
    const opts = [...select().options].map((o) => o.textContent);
    expect(opts.slice(0, 2)).toEqual(['Solid', 'ANSI31 (45° lines)']);
    expect(opts.slice(-2)).toEqual(['MYGRID (Office grid)', 'SOLID']);
    choose('custom:MYGRID');
    expect(onSpec).toHaveBeenLastCalledWith({ pattern: 'MYGRID', scale: 3, angle: 15, custom: patterns[0] });
    choose('brick');
    expect(onSpec).toHaveBeenLastCalledWith({ pattern: 'brick', scale: 3, angle: 15 });
  });

  it('shows a project pattern picked, a solid one without spacing; a drawing\'s pattern not in the list is shown too', () => {
    act(() => root.render(<HatchPanel spec={{ ...start, pattern: 'SOLID', custom: patterns[1] }} onSpec={() => undefined} patterns={patterns} />));
    expect(select().value).toBe('custom:SOLID');
    expect(host.querySelector('[aria-label="Hatch spacing"]')).toBeNull();
    expect(host.textContent).not.toContain('Import .pat');
    const drawing = { name: 'AR-B816', lines: patterns[0].lines };
    act(() => root.render(<HatchPanel spec={{ ...start, pattern: 'AR-B816', custom: drawing }} onSpec={() => undefined} patterns={patterns} />));
    expect(select().value).toBe('custom:AR-B816');
    expect(select().selectedOptions[0].textContent).toBe('AR-B816');
  });

  it('Import .pat… reads the file chosen and hands its text on', async () => {
    const onImport = vi.fn();
    act(() => root.render(<HatchPanel spec={start} onSpec={() => undefined} onImport={onImport} />));
    const input = host.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.accept).toBe('.pat');
    const click = vi.spyOn(input, 'click').mockImplementation(() => undefined);
    act(() => [...host.querySelectorAll('button')].find((b) => b.textContent === 'Import .pat…')!.click());
    expect(click).toHaveBeenCalled();
    const file = new File(['*X\n0,0,0,0,1'], 'office.pat');
    Object.defineProperty(input, 'files', { value: [file] });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); await new Promise((r) => setTimeout(r, 0)); });
    expect(onImport).toHaveBeenCalledWith('*X\n0,0,0,0,1', 'office.pat');
  });
});
