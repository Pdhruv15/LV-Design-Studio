// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageSetupDialog, PenTableDialog } from './PlotDialogs';
import { sampleProject } from '../../data/sampleProject';
import { addPlanSheets } from '../../docs/planLayout';
import { setOf } from '../../model/drawingSet';
import { placeLvPoint } from '../../model/cadDevices';
import { pensFor, withTable, DEFAULT_PENS } from '../../model/plotSetup';
import type { Project } from '../../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; });

const villa: Project = {
  ...sampleProject, drawingSet: undefined, plot: undefined,
  building: { buildings: [{ id: 'V', name: 'Villa', levels: [{ id: 'GF', name: 'Ground floor', kind: 'ground', heightM: 4 }] }], rooms: [{ id: 'r1', buildingId: 'V', levelId: 'GF', name: 'Hall', type: 'lobby', areaM2: 120, outline: [[0, 0], [12, 0], [12, 10], [0, 10]] }] }
};
const choose = (label: string, value: string) => {
  const el = document.querySelector(`[aria-label="${label}"]`) as HTMLSelectElement;
  act(() => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(el, value); el.dispatchEvent(new Event('change', { bubbles: true })); });
};
const button = (t: string) => [...document.querySelectorAll('button')].find((b) => b.textContent === t)!;

describe('Plot dialogs', () => {
  it('page setup: paper, scale, pens and plot stamp saved for the sheet, or as the set\'s default', () => {
    const lit = placeLvPoint(villa, { building: 'V', level: 'GF' }, 'ltg', 'DB-GF1-Y1', 6, 5).project;
    const { set, ids } = addPlanSheets(setOf(lit), lit, 'lighting');
    const p = withTable({ ...lit, drawingSet: set }, { ...DEFAULT_PENS, id: 'pt1', name: 'Heavy' });
    const sheet = set.sheets.find((s) => s.id === ids[0])!;
    const onSave = vi.fn();
    act(() => root.render(<PageSetupDialog project={p} sheet={sheet} onSave={onSave} onClose={() => {}} />));
    choose('Paper', 'A1');
    choose('Scale', '50');
    choose('Pen table', 'pt1');
    const tick = (text: RegExp) => ([...document.querySelectorAll('label')].find((l) => text.test(l.textContent ?? ''))!.querySelector('input') as HTMLInputElement);
    expect(tick(/Print drawn work/).checked).toBe(true);
    act(() => { tick(/Plot stamp/).click(); });
    act(() => { tick(/Print drawn work/).click(); });
    act(() => { button('Save for this sheet').click(); });
    const saved: Project = onSave.mock.calls[0][0];
    expect(saved.drawingSet!.sheets.find((s) => s.id === sheet.id)).toMatchObject({ size: 'A1', scale: '1:50', plot: { pens: 'pt1', stamp: true, drawn: false } });
    expect(onSave.mock.calls[0][1]).toBe(`Page setup of ${sheet.number} saved · ⌘Z to undo`);
    act(() => root.render(<PageSetupDialog key="again" project={p} sheet={sheet} onSave={onSave} onClose={() => {}} />));
    choose('Lineweights', 'thin');
    act(() => { button('Save as the set\'s default').click(); });
    expect(onSave.mock.calls[1][0].plot.defaults).toEqual({ weights: 'thin' });
  });

  it('page setup warns when the drawn text was made for another scale than the sheet\'s', () => {
    const lit = { ...placeLvPoint(villa, { building: 'V', level: 'GF' }, 'ltg', 'DB-GF1-Y1', 6, 5).project, cadPlans: [{ building: 'V', level: 'GF', file: 'GF.dwg', units: 4 }], cadSketch: [{ file: 'GF.dwg', items: [{ id: 'S1', kind: 'text' as const, layer: 'LV-ANNO', pts: [[2000, 2000]] as [number, number][], text: 'PLANT', h: 250 }] }] };
    const { set, ids } = addPlanSheets(setOf(lit), lit, 'lighting');
    const sheet = set.sheets.find((s) => s.id === ids[0])!;
    act(() => root.render(<PageSetupDialog project={{ ...lit, drawingSet: set }} sheet={sheet} onSave={() => {}} onClose={() => {}} />));
    expect(document.querySelector('.warn')).toBeNull(); // drawn for 1:100, the sheet is 1:100
    choose('Scale', '50');
    expect(document.querySelector('.warn')!.textContent).toBe('⚠ Text was drawn for 1:100; this sheet is 1:50, so 2.5 mm text prints 5 mm.');
  });

  it('pen tables: a width and an ink changed and saved; saved as a new table', () => {
    const onSave = vi.fn();
    act(() => root.render(<PenTableDialog project={villa} onSave={onSave} onClose={() => {}} />));
    choose('Cable trays width', '0.7');
    choose('Devices and DBs ink', '60');
    act(() => { button('Save').click(); });
    const p: Project = onSave.mock.calls[0][0];
    expect(pensFor(p)).toMatchObject({ trays: { w: 0.7, grey: 100 }, devices: { w: 0.25, grey: 60 } });
    act(() => { button('Save as new').click(); });
    expect(onSave.mock.calls[1][0].plot.tables.map((t: { name: string }) => t.name)).toEqual(['LVDS Electrical (copy)']);
  });
});
