// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import PanelTree from './PanelTree';
import { newProject, type Board, type Project } from '../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const tx = (id: string, extra: Partial<Board> = {}): Board => ({ id, name: id, kind: 'MDB', sourceKva: 1000, sourceImpedancePct: 6, ...extra });
const db = (id: string, up: string): Board => ({ id, name: id, kind: 'DB', upstreamId: up });
/** SS-1 (RMU-1 → MDB-1, MDB-2), SS-2 (RMU-2 → MDB-3), MDB-5 teed off the ring, and a meter cabinet. */
const p: Project = {
  ...newProject('Tree'), voltageV: 400,
  boards: [
    { id: 'MDB-A', name: 'MDB-A', kind: 'MDB', supply: { fedFrom: 'DEWA', ratingA: 200 } },
    tx('MDB-1', { rmu: 'RMU-1', substation: 'SS-1' }), tx('MDB-2', { rmu: 'RMU-1', substation: 'SS-1' }), tx('MDB-3', { rmu: 'RMU-2', substation: 'SS-2' }), tx('MDB-5'),
    db('SMDB-1', 'MDB-1'), db('DB-1', 'SMDB-1'), db('DB-3', 'MDB-3'), db('DB-A', 'MDB-A')
  ],
  feeders: [],
  rmus: [{ name: 'RMU-1', config: 'RRTT' }, { name: 'RMU-2', config: 'RRT' }]
};
const plain: Project = { ...p, boards: p.boards.map((b) => ({ ...b, rmu: undefined, substation: undefined })) };
const noop = () => {};
const menu = new Proxy({}, { get: () => noop }) as never;

describe('Panel tree: Group → Substations', () => {
  let host: HTMLDivElement, root: Root;
  const show = vi.fn(), pick = vi.fn();
  beforeEach(() => {
    localStorage.clear();
    show.mockReset(); pick.mockReset();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; });

  const draw = (project: Project, more: { view?: string; shownPart?: string; highlightedIds?: string[] } = {}) => act(() => root.render(
    <PanelTree project={project} results={[]} view={more.view ?? 'design'} onPick={pick} onOpen={noop} menu={menu} shownPart={more.shownPart} onShowPart={show} highlightedIds={more.highlightedIds} />
  ));
  const rows = () => [...host.querySelectorAll('.tree-row')].map((r) => r.querySelector('.tree-id')?.textContent);
  const row = (label: string) => [...host.querySelectorAll<HTMLElement>('.tree-row')].find((r) => r.querySelector('.tree-id')?.textContent === label)!;
  const click = (el: Element) => act(() => { (el as HTMLElement).click(); });
  const dblclick = (el: Element) => act(() => { el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
  const group = (label: 'Boards' | 'Substations') => click([...host.querySelectorAll('.tree-groupby button')].find((b) => b.textContent === label)!);
  const type = (text: string) => act(() => {
    const input = host.querySelector<HTMLInputElement>('.tree-search')!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const all = ['SS-1', 'RMU-1', 'MDB-1', 'SMDB-1', 'DB-1', 'MDB-2', 'SS-2', 'RMU-2', 'MDB-3', 'DB-3', 'No substation', 'MDB-5', 'Authority supply', 'MDB-A', 'DB-A'];

  const switches = () => [...host.querySelectorAll<HTMLButtonElement>('.tree-groupby button')].map((b) => [b.textContent, b.getAttribute('aria-pressed'), b.disabled, b.title]);
  const asToday = ['MDB-A', 'DB-A', 'MDB-1', 'SMDB-1', 'DB-1', 'MDB-2', 'MDB-3', 'DB-3', 'MDB-5'];

  it('greys Substations until a main board names an RMU or a substation, saying where; Boards stays the tree as it was', () => {
    draw(plain);
    expect(switches()).toEqual([
      ['Boards', 'true', false, 'The boards as they are fed: main board → SMDB → DB'],
      ['Substations', 'false', true, 'Name the substations or RMUs of the main boards first (Panels → Transformers)']
    ]);
    group('Substations'); // greyed: nothing happens
    expect([rows(), localStorage.getItem('tree.group')]).toEqual([asToday, null]);
    draw(p);
    expect(switches()[1]).toEqual(['Substations', 'false', false, 'By substation, then RMU, then main board']);
    expect(rows()).toEqual(asToday);
    expect(row('MDB-1').querySelector('.tree-tx')?.textContent).toBe('1000 kVA');
  });

  it('has no switch in a project with only meter cabinets on an authority LV supply', () => {
    draw({ ...p, boards: p.boards.filter((b) => b.id === 'MDB-A' || b.id === 'DB-A') });
    expect(host.querySelector('.tree-groupby')).toBeNull();
    expect(rows()).toEqual(['MDB-A', 'DB-A']);
  });

  it('a Substations choice kept from another project shows the boards while none is named', () => {
    draw(p);
    group('Substations');
    draw(plain);
    expect(switches().map((s) => s.slice(0, 3))).toEqual([['Boards', 'true', false], ['Substations', 'false', true]]);
    expect(rows()).toEqual(asToday);
    // Once one is named again, the tree is by substation again.
    draw(p);
    expect(rows()).toEqual(all);
  });

  it('Substations: substation → RMU → main board with its transformer → its boards, kept for next time', () => {
    draw(p);
    group('Substations');
    expect(rows()).toEqual(all);
    expect([...row('SS-1').querySelectorAll('.m')].map((m) => m.textContent)).toEqual(['2 TX · 4 boards']);
    expect([...row('RMU-2').querySelectorAll('.m')].map((m) => m.textContent)).toEqual(['RRT']);
    expect([...row('Authority supply').querySelectorAll('.m')].map((m) => m.textContent)).toEqual(['2 boards']);
    expect(['MDB-1', 'MDB-3', 'MDB-5'].map((id) => row(id).querySelector('.tree-tx')?.textContent)).toEqual(['TX-1 · 1000 kVA', 'TX-3 · 1000 kVA', 'TX-4 · 1000 kVA']);
    expect(localStorage.getItem('tree.group')).toBe('"substations"');
    // A project with nothing to group shows the boards, and the choice comes back with one that has.
    draw(plain);
    expect(rows()).toEqual(['MDB-A', 'DB-A', 'MDB-1', 'SMDB-1', 'DB-1', 'MDB-2', 'MDB-3', 'DB-3', 'MDB-5']);
    draw(p);
    expect(rows()).toEqual(all);
  });

  it('on the SLD page a click on a substation or RMU shows it; a board selects; elsewhere a click folds, a double-click shows', () => {
    draw(p);
    group('Substations');
    expect(host.querySelector('.tree-tip')?.textContent).toBe('Click a board to select it, a substation or RMU to show it on the SLD');
    click(row('SS-1'));
    click(row('RMU-2'));
    expect(show.mock.calls).toEqual([['ss:SS-1'], ['rmu:RMU-2']]);
    click(row('MDB-1'));
    expect(pick).toHaveBeenCalledWith('MDB-1');
    // The arrow folds a substation; "No substation" folds on a click (it is not a part).
    click(row('SS-1').querySelector('.tree-tw')!);
    click(row('No substation'));
    expect(rows()).toEqual(['SS-1', 'SS-2', 'RMU-2', 'MDB-3', 'DB-3', 'No substation', 'Authority supply', 'MDB-A', 'DB-A']);
    expect(show).toHaveBeenCalledTimes(2);
    // Another page: a click folds, a double-click shows it on the SLD.
    draw(p, { view: 'load-schedule' });
    expect(host.querySelector('.tree-tip')?.textContent).toBe('Click a DB to open its load schedule');
    click(row('SS-2'));
    expect(rows()).not.toContain('RMU-2');
    dblclick(row('SS-2'));
    expect(show).toHaveBeenLastCalledWith('ss:SS-2');
  });

  it('marks the part the SLD shows; a search finds a substation with its boards, or a board with the rows above it', () => {
    draw(p, { shownPart: 'ss:SS-2' });
    group('Substations');
    expect(row('SS-2').classList.contains('focus')).toBe(true);
    expect(host.querySelectorAll('.tree-row.focus')).toHaveLength(1);
    draw(p, { shownPart: 'tx:MDB-2' });
    expect([...host.querySelectorAll('.tree-row.focus')].map((r) => r.querySelector('.tree-id')?.textContent)).toEqual(['MDB-2']);
    type('ss-2');
    expect(rows()).toEqual(['SS-2', 'RMU-2', 'MDB-3', 'DB-3']);
    type('DB-1');
    expect(rows()).toEqual(['SS-1', 'RMU-1', 'MDB-1', 'SMDB-1', 'DB-1']);
    type('nothing');
    expect(rows()).toEqual([]);
    expect(host.textContent).toContain('No board matches.');
  });

  it('Collapse all folds the groups too; a new batch of panels opens the rows above it', () => {
    draw(p);
    group('Substations');
    click(host.querySelector('button[title="Collapse all"]')!);
    expect(rows()).toEqual(['SS-1', 'SS-2', 'No substation', 'Authority supply']);
    draw(p, { highlightedIds: ['DB-3'] });
    expect(rows()).toEqual(['SS-1', 'SS-2', 'RMU-2', 'MDB-3', 'DB-3', 'No substation', 'Authority supply']);
    click(host.querySelector('button[title="Expand all"]')!);
    expect(rows()).toEqual(all);
    // Back to Boards: the tree as it was.
    group('Boards');
    expect(rows()).toEqual(['MDB-A', 'DB-A', 'MDB-1', 'SMDB-1', 'DB-1', 'MDB-2', 'MDB-3', 'DB-3', 'MDB-5']);
  });
});
