// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import SubstationsCard from './SubstationsCard';
import { newProject, type Board, type Project } from '../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const tx = (id: string, extra: Partial<Board> = {}): Board => ({ id, name: id, kind: 'MDB', sourceKva: 1000, sourceImpedancePct: 6, ...extra });
/** SS-1: RMU-1 → MDB-1, MDB-2. SS-2: RMU-2 (N/O R2) → MDB-3, and MDB-4 teed off the ring. SS-3: RMU-3, feeding nothing yet. */
const p: Project = {
  ...newProject('SS'), voltageV: 400, feeders: [],
  boards: [tx('MDB-1', { rmu: 'RMU-1', substation: 'SS-1' }), tx('MDB-2', { rmu: 'RMU-1', substation: 'SS-1' }), tx('MDB-3', { rmu: 'RMU-2', substation: 'SS-2' }), tx('MDB-4', { substation: 'SS-2' })],
  rmus: [{ name: 'RMU-1', config: 'RRTT', tOff: 'fuse', fuseA: 100, owner: 'authority' }, { name: 'RMU-2', config: 'RRTT', tOff: 'vcb', normallyOpen: 'R2' }, { name: 'RMU-3', config: 'RRT', substation: 'SS-3' }]
};

describe('Panels → Transformers → Substations', () => {
  let host: HTMLDivElement, root: Root;
  const change = vi.fn(), status = vi.fn();
  beforeEach(() => {
    change.mockReset(); status.mockReset();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; });

  const draw = (project: Project) => act(() => root.render(<SubstationsCard project={project} onChange={change} onStatus={status} />));
  const rows = () => [...host.querySelectorAll('tbody tr')];
  const cell = (row: number, col: number) => rows()[row].querySelectorAll('td')[col];
  const lines = (el: Element) => [...el.querySelectorAll('div')].map((d) => d.textContent);
  const last = () => change.mock.calls[change.mock.calls.length - 1][0] as Project;
  const setValue = (el: HTMLInputElement | HTMLSelectElement, v: string) => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!.call(el, v);
  };
  const pick = (el: HTMLSelectElement, v: string) => act(() => { setValue(el, v); el.dispatchEvent(new Event('change', { bubbles: true })); });
  const type = (el: HTMLInputElement, v: string) => act(() => { setValue(el, v); el.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });

  it('one row per substation in ring order, with its RMUs, transformers, owner and checks', () => {
    draw(p);
    expect(rows().map((r) => (r.querySelector('input[aria-label="Substation name"]') as HTMLInputElement).value)).toEqual(['SS-1', 'SS-2', 'SS-3']);
    expect(lines(cell(0, 4))).toEqual(['RMU-1 · RRTT · fuse 100 A']);
    expect(lines(cell(1, 4))).toEqual(['RMU-2 · RRTT · CB · N/O R2']);
    expect(lines(cell(0, 5))).toEqual(['TX-1 · 1000 kVA · MDB-1', 'TX-2 · 1000 kVA · MDB-2']);
    expect(lines(cell(1, 5))).toEqual(['TX-3 · 1000 kVA · MDB-3', 'TX-4 · 1000 kVA · MDB-4', '1 tee-off spare']);
    expect(lines(cell(2, 5))).toEqual(['1 tee-off spare']);
    expect(cell(0, 4).querySelector('div')?.getAttribute('title')).toBe('Feeds TX-1, TX-2');
    // No record yet: the type shows "—"; the owner is that of its RMUs.
    expect((cell(0, 2).querySelector('select') as HTMLSelectElement).value).toBe('');
    expect([0, 1].map((r) => (cell(r, 6).querySelector('select') as HTMLSelectElement).value)).toEqual(['authority', '']);
    expect(lines(cell(0, 7))).toEqual(['2 of 2 tee-offs used']);
    expect(cell(0, 7).querySelector('div')?.className).toBe('ok');
  });

  it('▲ ▼ change the ring order, greyed where a row cannot move', () => {
    draw(p);
    const arrow = (r: number, dir: 'up' | 'down') => rows()[r].querySelector<HTMLButtonElement>(`button[aria-label$=" ${dir}"]`)!;
    expect([arrow(0, 'up'), arrow(1, 'up'), arrow(1, 'down'), arrow(2, 'up')].map((b) => b.disabled)).toEqual([true, false, false, false]);
    // SS-3 holds an RMU feeding nothing yet, which is drawn on the ring: it moves like the others.
    act(() => arrow(0, 'down').click());
    expect(last().substations!.map((s) => s.name)).toEqual(['SS-2', 'SS-1', 'SS-3']);
  });

  it('type, location, name and owner change the project; + RMU and + Substation add one', () => {
    draw(p);
    pick(cell(1, 2).querySelector('select')!, 'pocket');
    expect(last().substations!.map((s) => [s.name, s.type])).toEqual([['SS-1', 'conventional'], ['SS-2', 'pocket'], ['SS-3', 'conventional']]);
    type(cell(0, 3).querySelector('input')!, 'Block A');
    expect(last().substations![0].building).toBe('Block A');
    type(cell(0, 1).querySelector('input')!, 'SS-10');
    expect(last().boards.filter((b) => b.substation === 'SS-10').map((b) => b.id)).toEqual(['MDB-1', 'MDB-2']);
    // A name in use is refused, and the old one comes back.
    const name = cell(0, 1).querySelector('input')!;
    const calls = change.mock.calls.length;
    type(name, 'ss-2');
    expect([change.mock.calls.length, status.mock.lastCall?.[0], name.value]).toEqual([calls, 'ss-2 is already a substation', 'SS-1']);
    pick(cell(1, 6).querySelector('select')!, 'consumer');
    expect(last().rmus!.find((r) => r.name === 'RMU-2')?.owner).toBe('consumer');
    act(() => (cell(2, 4).querySelector('button') as HTMLButtonElement).click());
    expect(last().rmus!.find((r) => r.name === 'RMU-4')).toEqual({ name: 'RMU-4', config: 'RRT', substation: 'SS-3' });
    expect(status).toHaveBeenLastCalledWith('RMU-4 added to SS-3 (RRT, no transformer yet): pick it in a transformer\'s RMU column');
    act(() => [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === '+ Substation')!.click());
    expect(last().substations!.map((s) => s.name)).toEqual(['SS-1', 'SS-2', 'SS-3', 'SS-4']);
  });

  it('says how to start when there is no substation yet', () => {
    draw({ ...p, boards: p.boards.map((b) => ({ ...b, substation: undefined })), rmus: [] });
    expect(host.querySelector('table')).toBeNull();
    expect(host.textContent).toContain('No substations yet: name one on a transformer above, or add one.');
  });
});
