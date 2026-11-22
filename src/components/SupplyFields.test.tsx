// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SupplyFields from './SupplyFields';
import { sampleProject } from '../data/sampleProject';
import { assumedSourceFaultKa } from '../calc/electrical';
import { supplyPoint } from '../diagram/supplyPoint';
import { BUILT_IN_REFERENCES, applyReference, supplyNameSuggestion } from '../model/designReference';
import type { Board, Project, SourceKind } from '../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root, host: HTMLDivElement, last: Board | undefined;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); last = undefined; });
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; vi.restoreAllMocks(); });

const project: Project = { ...sampleProject, voltageV: 415, designReference: undefined, boards: [], feeders: [] };
const first = (more: Partial<Board> = {}): Board => ({ id: 'MDB-A', name: 'MDB-A', kind: 'MDB', ratedCurrentA: 200, ...more });
function Harness({ initial, p = project }: { initial: Board; p?: Project }) {
  const [b, setB] = useState(initial);
  return <SupplyFields project={p} board={b} onChange={(x) => { last = x; setB(x); }} />;
}
let shown = 0;
const show = (b: Board, p?: Project) => act(() => root.render(<Harness key={++shown} initial={b} p={p} />));
const input = (label: string) => document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
const select = (label: string) => document.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
const radio = (label: string) => input(label);
function type(el: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function choose(el: HTMLSelectElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
const T = 'Transformer', S = 'LV source (utility, supplier, own generation)', B = 'A board outside this project', U = 'Not set yet';

describe('SupplyFields', () => {
  it('shows the radio of each mode as checked', () => {
    const cases: [Board, string][] = [[first({ sourceKva: 800 }), T], [first({ supply: {} }), S], [first({ supply: { fedBy: 'board' } }), B], [first(), U]];
    for (const [b, label] of cases) {
      show(b);
      const checked = [...document.querySelectorAll<HTMLInputElement>('input[type=radio]')].filter((r) => r.checked).map((r) => r.getAttribute('aria-label'));
      expect(checked).toEqual([label]);
      expect(document.querySelector('legend')!.textContent).toBe('Fed from');
    }
  });

  it('a transformer shows its four fields and the warning without a rating', () => {
    show(first({ rmu: 'RMU-1' }));
    expect(host.textContent).toContain('No transformer rating yet — enter it below.');
    expect(host.textContent).toContain('Transformer (kVA)');
    show(first({ sourceKva: 800 }));
    expect(host.textContent).not.toContain('No transformer rating yet');
  });

  it('choosing a board outside the project on an LV source shows the Feeding board field and stores fedBy', () => {
    show(first({ supply: { fedFrom: 'Grid' } }));
    expect(input('Feeding board')).toBeNull();
    act(() => radio(B).click());
    expect(last!.supply).toEqual({ fedFrom: 'Grid', fedBy: 'board' });
    type(input('Feeding board'), 'SMDB-3F');
    expect(last!.supply!.fedFrom).toBe('SMDB-3F');
    expect(input('Feeding board').placeholder).toBe('e.g. SMDB-3F');
    expect(select('Kind')).toBeNull();
    expect(select('Meter')).toBeNull();
  });

  it('typing a fault level, a drop of 0, a cable size and length gives the expected board', () => {
    show(first({ supply: {} }));
    type(input('Fault level Ik″ (kA)'), '25');
    type(input('Drop already used (%)'), '0');
    choose(select('Size (mm²)'), '120');
    expect(last!.supply!.incomer).toEqual({ cableCsaMm2: 120, lengthM: 0 });
    type(input('Length (m)'), '40');
    expect(last!.supply).toEqual({ faultKa: 25, vdUsedPct: 0, incomer: { cableCsaMm2: 120, lengthM: 40 } });
    type(input('Fault level Ik″ (kA)'), '');
    expect(last!.supply!.faultKa).toBeUndefined();
    choose(select('Size (mm²)'), '');
    type(input('Length (m)'), '');
    expect(last!.supply).toEqual({ vdUsedPct: 0 });
    expect(input('X/R').placeholder).toBe('5');
    expect(input('Fault level Ik″ (kA)').placeholder).toBe(`${assumedSourceFaultKa(project).toFixed(1)} assumed`);
  });

  it('Kind stores a source kind and clears it for a utility; Meter stores a type', () => {
    show(first({ supply: {} }));
    expect(select('Kind').value).toBe('utility');
    choose(select('Kind'), 'generator');
    expect(last!.supply!.kind).toBe('generator');
    choose(select('Kind'), 'utility');
    expect(last!.supply!.kind).toBeUndefined();
    choose(select('Meter'), 'CT');
    expect(last!.supply!.meter).toBe('CT');
    choose(select('Device'), 'ACB');
    type(input('Rating (A)'), '400');
    choose(select('Cores'), '3');
    choose(select('Installation'), 'D2');
    expect(last!.supply).toMatchObject({ meter: 'CT', device: 'ACB', ratingA: 400, incomer: { cores: 3, installMethod: 'D2' } });
  });

  it('a switch that removes values asks first and does nothing on no', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    show(first({ sourceKva: 800, sourceImpedancePct: 5 }));
    await act(async () => { radio(S).click(); });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0]).toContain('Change the supply of MDB-A to "LV source (utility, supplier, own generation)"?');
    expect(confirm.mock.calls[0][0]).toContain('This removes the transformer rating and impedance.');
    expect(last).toBeUndefined();
    expect(radio(T).checked).toBe(true);
    confirm.mockReturnValue(true);
    await act(async () => { radio(S).click(); });
    expect(last).toBeDefined();
    expect(last!.sourceKva).toBeUndefined();
    expect(last!.supply).toEqual({});
    expect(radio(S).checked).toBe(true);
  });

  it('a switch to not set names the supply values it removes', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    show(first({ supply: { faultKa: 20 } }));
    await act(async () => { radio(U).click(); });
    expect(last).toBeDefined();
    expect(last!.supply).toBeUndefined();
    expect(confirm.mock.calls[0][0]).toContain('This removes the supply values typed for it.');
  });

  it('clearing the transformer rating keeps the transformer fields and the choice', () => {
    show(first({ sourceKva: 800, sourceImpedancePct: 6.25 }));
    const kvaField = () => [...document.querySelectorAll('label')].find((l) => l.textContent?.startsWith('Transformer (kVA)'))!.querySelector('input')!;
    const kva = kvaField();
    type(kva, '');
    expect(kvaField()).toBe(kva);
    expect(radio(T).checked).toBe(true);
    expect(host.textContent).toContain('No transformer rating yet — enter it below.');
    type(kva, '1500');
    expect(kvaField()).toBe(kva);
    expect(last!.sourceKva).toBe(1500);
    expect(last!.sourceImpedancePct).toBe(6.25);
  });

  it('the protective conductor is chosen from the cable sizes; 0 in parallel runs is not stored', () => {
    show(first({ supply: { incomer: { cableCsaMm2: 95, lengthM: 30 } } }));
    expect([...select('Protective conductor (mm²)').options].map((o) => o.value)).toContain('16');
    choose(select('Protective conductor (mm²)'), '16');
    expect(last!.supply!.incomer!.cpcMm2).toBe(16);
    type(input('Runs in parallel'), '0');
    expect(last!.supply!.incomer!.parallel).toBeUndefined();
  });

  it('a switch that loses nothing does not ask', () => {
    const confirm = vi.spyOn(window, 'confirm');
    show(first());
    act(() => radio(S).click());
    expect(confirm).not.toHaveBeenCalled();
    expect(last!.supply).toEqual({});
  });

  it('not set shows the assumed fault level', () => {
    show(first());
    expect(host.textContent).toContain(`Nothing is entered for the supply. The calculations assume a source of ${assumedSourceFaultKa(project).toFixed(1)} kA and mark the checks that depend on it as not verified.`);
    expect(input('Fault level Ik″ (kA)')).toBeNull();
  });

  it('the Name field offers the design reference authority', () => {
    show(first({ supply: {} }));
    expect(document.querySelector('datalist')).toBeNull();
    const named = BUILT_IN_REFERENCES.map((r) => applyReference(project, r)).find((x) => supplyNameSuggestion(x))!;
    show(first({ supply: {} }), named);
    expect(document.querySelector('datalist option')!.getAttribute('value')).toBe(supplyNameSuggestion(named));
    expect(input('Name').placeholder).toBe('Source');
  });
  it('the rating rows follow the kind: kVA for every machine and inverter, X″d for a machine, fault multiple for an inverter', () => {
    const rows = (kind?: SourceKind) => { show(first({ supply: { kind } })); return ['Rating (kVA)', 'X″d (%)', 'Fault current (× rated)'].map((l) => !!input(l)); };
    expect(rows(undefined)).toEqual([false, false, false]);
    expect(rows('utility')).toEqual([false, false, false]);
    expect(rows('other')).toEqual([false, false, false]);
    expect(rows('generator')).toEqual([true, true, false]);
    expect(rows('pv')).toEqual([true, false, true]);
    expect(rows('battery')).toEqual([true, false, true]);
    expect(rows('wind')).toEqual([true, true, true]);
    expect(host.textContent).toContain('Type the fault current multiple for an inverter-coupled turbine; leave it blank for a generator.');
    rows('generator');
    expect(host.textContent).not.toContain('inverter-coupled turbine');
    show(first({ supply: { kind: 'generator', fedBy: 'board' } }));
    expect(input('Rating (kVA)')).toBeNull();
    expect(input('X″d (%)')).toBeNull();
  });

  it('typing a rating turns the fault placeholder to calculated and changes the drawn fault line; the kind change keeps the values', () => {
    show(first({ supply: { kind: 'generator' } }));
    expect(input('Fault level Ik″ (kA)').placeholder).toBe(`${assumedSourceFaultKa(project).toFixed(1)} assumed`);
    expect(input('X″d (%)').placeholder).toBe('15');
    expect(input('Fault current (× rated)')).toBeNull();
    type(input('Rating (kVA)'), '250');
    expect(last!.supply).toEqual({ kind: 'generator', ratedKva: 250 });
    expect(input('Fault level Ik″ (kA)').placeholder).toBe('2.4 calculated'); // 1.05 × 347.8 A ÷ 0.15 = 2.43 kA
    expect(supplyPoint(project, last!, false)!.lines).toEqual(['Ik″ 2.4 kA calculated', '250 kVA · X″d 15 %']);
    type(input('X″d (%)'), '20');
    expect(input('Fault level Ik″ (kA)').placeholder).toBe('1.8 calculated'); // 1.05 × 347.8 ÷ 0.20 = 1.83 kA
    choose(select('Kind'), 'pv');
    expect(last!.supply).toEqual({ kind: 'pv', ratedKva: 250, xdPct: 20 }); // kept, not read by a PV source
    expect(input('X″d (%)')).toBeNull();
    expect(input('Fault current (× rated)').placeholder).toBe('1.2');
    type(input('Fault level Ik″ (kA)'), '12');
    expect(supplyPoint(project, last!, false)!.lines).toEqual(['Ik″ 12 kA given']);
  });

  it('placeholders: 0.17 calculated for a small level, X/R 10 for a machine and "not used" for an inverter, the allowed load from the rating', () => {
    show(first({ supply: { kind: 'pv', ratedKva: 100 } }));
    expect(input('Fault level Ik″ (kA)').placeholder).toBe('0.17 calculated'); // 1.2 × 139.1 A = 0.167 kA
    expect(input('X/R').placeholder).toBe('not used');
    expect(input('Allowed load (A)').placeholder).toBe('139.1 from the rating'); // 100 000 ÷ (√3 × 415)
    show(first({ supply: { kind: 'generator', ratedKva: 250 } }));
    expect(input('X/R').placeholder).toBe('10');
    expect(input('Allowed load (A)').placeholder).toBe('347.8 from the rating');
    show(first({ supply: { kind: 'generator', ratedKva: 250, allowedA: 300 } }));
    expect(input('Allowed load (A)').placeholder).toBe('not given');
    show(first({ supply: { kind: 'generator' } }));
    expect(input('X/R').placeholder).toBe('5');
    expect(input('Allowed load (A)').placeholder).toBe('not given');
  });
});
