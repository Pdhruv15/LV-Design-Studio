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

describe('Hatch panel: islands, associative, swatch, export, this computer', () => {
  const opts = { islands: true, assoc: true, keep: false };
  const tick = (label: string) => host.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;
  const click = (el: Element) => act(() => (el as HTMLElement).click());
  const button = (text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent === text)!;

  it('has Find islands and Associative ticks (on) and a tick to keep imported patterns on this computer (off)', () => {
    const onOpts = vi.fn();
    act(() => root.render(<HatchPanel spec={start} onSpec={() => undefined} onImport={() => undefined} onExport={() => undefined} opts={opts} onOpts={onOpts} />));
    expect([tick('Find islands').checked, tick('Associative').checked, tick('Keep imported patterns on this computer').checked]).toEqual([true, true, false]);
    expect(host.textContent).toContain('Also keep imported patterns on this computer for every project');
    expect(tick('Find islands').parentElement!.title).toBe('Closed objects inside stay clear');
    click(tick('Find islands'));
    expect(onOpts).toHaveBeenLastCalledWith({ ...opts, islands: false });
    click(tick('Associative'));
    expect(onOpts).toHaveBeenLastCalledWith({ ...opts, assoc: false });
    click(tick('Keep imported patterns on this computer'));
    expect(onOpts).toHaveBeenLastCalledWith({ ...opts, keep: true });
  });

  it('shows a black-and-white swatch of the pattern chosen: lines for ANSI31, dots for Dots, a faint fill for Solid', () => {
    const swatch = () => host.querySelector('svg.cad-bk-thumb')!;
    act(() => root.render(<HatchPanel spec={start} onSpec={() => undefined} />));
    expect(swatch().querySelectorAll('path')).toHaveLength(1);
    expect(swatch().querySelector('path')!.getAttribute('d')).toMatch(/^M[\d.-]+ [\d.-]+L/);
    act(() => root.render(<HatchPanel spec={{ ...start, pattern: 'dots' }} onSpec={() => undefined} />));
    expect(swatch().querySelector('path')!.getAttribute('d')).toMatch(/h0/);
    act(() => root.render(<HatchPanel spec={{ ...start, pattern: 'solid' }} onSpec={() => undefined} />));
    expect(swatch().querySelector('rect')).not.toBeNull();
    expect(swatch().querySelector('path')).toBeNull();
    expect(swatch().outerHTML).not.toMatch(/#[0-9a-f]{3,6}|rgb\(/i);
  });

  it('Export .pat… sits beside Import .pat… and asks for the export', () => {
    const onExport = vi.fn();
    act(() => root.render(<HatchPanel spec={start} onSpec={() => undefined} onImport={() => undefined} onExport={onExport} />));
    const labels = [...host.querySelectorAll('button')].map((b) => b.textContent);
    expect(labels.indexOf('Export .pat…')).toBe(labels.indexOf('Import .pat…') + 1);
    click(button('Export .pat…'));
    expect(onExport).toHaveBeenCalled();
  });

  it('lists the patterns kept on this computer after the project\'s: a group for each only when both exist', () => {
    const groups = () => [...host.querySelectorAll('optgroup')].map((g) => [g.label, [...g.querySelectorAll('option')].map((o) => o.value)]);
    act(() => root.render(<HatchPanel spec={start} onSpec={() => undefined} patterns={[patterns[0]]} computer={[patterns[2] ?? patterns[1]]} />));
    expect(groups()).toEqual([['This project', ['custom:MYGRID']], ['On this computer', [`custom:${(patterns[2] ?? patterns[1]).name}`]]]);
    act(() => root.render(<HatchPanel spec={start} onSpec={() => undefined} computer={[patterns[0]]} />));
    expect(groups()).toEqual([['On this computer', ['custom:MYGRID']]]);
    act(() => root.render(<HatchPanel spec={start} onSpec={() => undefined} patterns={[patterns[0]]} />));
    expect(groups()).toEqual([]);
    // A pattern of the computer's is picked with its lines carried; one the project has by the same name is not listed twice.
    const onSpec = vi.fn();
    act(() => root.render(<HatchPanel spec={start} onSpec={onSpec} computer={[patterns[0]]} />));
    choose('custom:MYGRID');
    expect(onSpec).toHaveBeenLastCalledWith({ pattern: 'MYGRID', scale: 3, angle: 15, custom: patterns[0] });
    act(() => root.render(<HatchPanel spec={start} onSpec={onSpec} patterns={[patterns[0]]} computer={[patterns[0]]} />));
    expect([...select().options].filter((o) => o.value === 'custom:MYGRID')).toHaveLength(1);
  });

  it('edit mode: Edit hatch HE, origin in metres with Pick…, islands with Add and Remove, an Associative tick; spacing and angle apply when left', () => {
    const edit = { count: 1, origin: [1.5, 2] as [number, number], islands: 2, assoc: true, canAssoc: true, onOrigin: vi.fn(), onPick: vi.fn(), onAdd: vi.fn(), onRemove: vi.fn(), onAssoc: vi.fn() };
    const onSpec = vi.fn();
    act(() => root.render(<HatchPanel spec={start} onSpec={onSpec} patterns={patterns} onImport={() => undefined} onExport={() => undefined} opts={opts} onOpts={() => undefined} editing={edit} />));
    expect(host.querySelector('h4')!.textContent).toBe('Edit hatch HE');
    expect(host.textContent).toContain('Islands: 2');
    expect((host.querySelector('input[aria-label="Hatch origin X"]') as HTMLInputElement).value).toBe('1.5');
    // None of the new-hatch controls.
    expect(host.textContent).not.toMatch(/Import|Export|Find islands|keep imported/);
    expect(host.querySelector('input[type="file"]')).toBeNull();
    click(button('Pick…')); click(button('Add islands')); click(button('Remove islands')); click(tick('Associative'));
    expect([edit.onPick, edit.onAdd, edit.onRemove, edit.onAssoc].map((f) => f.mock.calls.length)).toEqual([1, 1, 1, 1]);
    const spacing = host.querySelector('input[aria-label="Hatch spacing"]') as HTMLInputElement;
    act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(spacing, '4'); spacing.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(onSpec).not.toHaveBeenCalled(); // not per key
    act(() => spacing.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    expect(onSpec).toHaveBeenLastCalledWith({ ...start, scale: 4 });
    const x = host.querySelector('input[aria-label="Hatch origin X"]') as HTMLInputElement;
    act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(x, '3'); x.dispatchEvent(new Event('input', { bubbles: true })); });
    act(() => x.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    expect(edit.onOrigin).toHaveBeenLastCalledWith([3, 2]);
  });

  it('edit mode: Associative is off and disabled for a hatch with no boundary objects; several hatches edit pattern, spacing and angle only', () => {
    const base = { count: 1, origin: [0, 0] as [number, number], islands: 0, assoc: false, canAssoc: false, onOrigin: () => undefined, onPick: () => undefined, onAdd: () => undefined, onRemove: () => undefined, onAssoc: () => undefined };
    act(() => root.render(<HatchPanel spec={start} onSpec={() => undefined} editing={base} />));
    expect(tick('Associative').disabled).toBe(true);
    expect(tick('Associative').checked).toBe(false);
    expect(button('Remove islands').disabled).toBe(true);
    act(() => root.render(<HatchPanel spec={start} onSpec={() => undefined} editing={{ ...base, count: 3 }} />));
    expect(host.textContent).toContain('3 hatches');
    expect(host.querySelector('input[aria-label="Hatch origin X"]')).toBeNull();
    expect(host.textContent).not.toContain('Islands:');
    expect(select()).not.toBeNull();
    expect(host.querySelector('input[aria-label="Hatch angle"]')).not.toBeNull();
  });
});

