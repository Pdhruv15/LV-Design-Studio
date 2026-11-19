// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import SystemDiagram, { type ShownPart } from './SystemDiagram';
import { sampleProject } from '../data/sampleProject';
import { evaluateProject } from '../calc/electrical';
import { DEFAULT_LAYERS } from '../diagram/annotations';
import { partInfo, partKey, partProject, type SldPart } from '../diagram/mvShow';
import { sldMenu, type SldTarget } from '../model/sldMenu';
import type { Project } from '../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** The sample's MDB-1 and a second main board, both on RMU-1 in substation SS-1, with a bus coupler between them. */
const whole: Project = {
  ...sampleProject, id: 'show',
  boards: [...sampleProject.boards.map((b) => (b.id === 'MDB-1' ? { ...b, rmu: 'RMU-1', substation: 'SS-1' } : b)),
    { id: 'MDB-2', name: 'MDB-2', kind: 'MDB', sourceKva: 1000, sourceImpedancePct: 6, ratedCurrentA: 1600, rmu: 'RMU-1', substation: 'SS-1' }],
  rmus: [{ name: 'RMU-1', config: 'RRTT' }],
  ties: [{ id: 'BC-1', a: 'MDB-1', b: 'MDB-2', ratingA: 1600 }]
};
const results = evaluateProject(whole);
const noop = () => {};
const chip = (part: SldPart, more: Partial<ShownPart> = {}): ShownPart => ({ key: partKey(part), ...partInfo(whole, part), overview: part.kind === 'mv', onShowAll: noop, ...more });
const texts = (h: Element) => [...h.querySelectorAll('text')].map((t) => t.textContent);
function drawn(part: SldPart, shown: ShownPart = chip(part)): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(
    <SystemDiagram project={partProject(whole, part)} wholeProject={whole} calcProject={whole} results={results} shown={shown} hideLegend selectedFeederId={null} selectedBoardId={null} onSelectFeeder={noop} onSelectBoard={noop} />
  );
  return host;
}

describe('SLD Show: one part of the network', () => {
  it('names the part on a chip with ◀ ▶ and Show all', () => {
    const h = drawn({ kind: 'tx', id: 'MDB-2' }, chip({ kind: 'tx', id: 'MDB-2' }, { prev: { name: 'TX-1', go: noop } }));
    const c = h.querySelector('.sd-shown')!;
    expect([...c.children].map((x) => x.textContent)).toEqual(['Showing TX-2 · 1000 kVA · SS-1 / RMU-1', '1 board', '◀', '▶', 'Show all']);
    const [prev, next] = [...c.querySelectorAll('button')];
    expect([prev.disabled, prev.title, next.disabled]).toEqual([false, 'Show TX-1', true]);
    // Without a chip (the whole network) there is none.
    const plain = document.createElement('div');
    plain.innerHTML = renderToStaticMarkup(<SystemDiagram project={whole} results={results} hideLegend selectedFeederId={null} selectedBoardId={null} onSelectFeeder={noop} onSelectBoard={noop} />);
    expect(plain.querySelector('.sd-shown')).toBeNull();
  });

  it('one transformer: its RMU\'s other tee-off and the bus coupler to the board not drawn are stubs', () => {
    const h = drawn({ kind: 'tx', id: 'MDB-2' });
    expect(texts(h)).toEqual(expect.arrayContaining(['TX-2', 'to TX-1 · MDB-1', 'BC-1 to MDB-1', '(TX-1)']));
    expect(texts(h)).not.toContain('TX-1');
    // The stub stands on MDB-1's side (left), clear of the drawing's left edge.
    const stub = h.querySelector('g.tie-stub[data-tie="BC-1"]')!;
    const label = [...stub.querySelectorAll('text')].find((t) => t.textContent === 'BC-1 to MDB-1')!;
    expect(label.getAttribute('text-anchor')).toBe('end');
    expect(Number(label.getAttribute('x')) - 70).toBeGreaterThan(0);
    // Both main boards drawn (the substation): the coupler is drawn whole, no stub.
    const ss = drawn({ kind: 'substation', name: 'SS-1' });
    expect(ss.querySelector('g.tie[data-tie="BC-1"]:not(.tie-stub)')).not.toBeNull();
    expect(ss.querySelector('g.tie-stub')).toBeNull();
  });

  it('a meter cabinet on its own: its source at the top, no ring and no room left for one', () => {
    const p: Project = { ...whole, boards: [...whole.boards, { id: 'MDB-A', name: 'MDB-A', kind: 'MDB', ratedCurrentA: 200, supply: { fedFrom: 'DEWA', ratingA: 200, device: 'MCCB' } }] };
    const part: SldPart = { kind: 'supply', id: 'MDB-A' };
    const h = document.createElement('div');
    h.innerHTML = renderToStaticMarkup(<SystemDiagram project={partProject(p, part)} wholeProject={p} calcProject={p} results={results} shown={chip(part)} hideLegend selectedFeederId={null} selectedBoardId={null} onSelectFeeder={noop} onSelectBoard={noop} />);
    expect(h.querySelector('.mvRing-ring')).toBeNull();
    expect(h.querySelector('g.tx[data-lv-id="board:MDB-A"] circle')?.getAttribute('cy')).toBe('22');
  });

  it('the MV overview: the ring and the substation frame, each main board as its name, nothing below', () => {
    const h = drawn({ kind: 'mv' });
    expect([...h.querySelectorAll('g.mv-name')].map((g) => g.querySelector('text')?.textContent)).toEqual(['MDB-1', 'MDB-2']);
    expect(h.querySelector('g.fd')).toBeNull();
    // The frame is named for right-click and double-click (which need the page's menu handler: below).
    expect(h.querySelector('g.ss-frame[data-ss="SS-1"] title')?.textContent).toBe('Substation SS-1');
    expect(h.querySelectorAll('g.tx[data-lv-id^="board:"]')).toHaveLength(2);
    expect(texts(h)).not.toContain('SMDB-GF');
  });
});

describe('SLD Show: right-click and double-click', () => {
  let host: HTMLDivElement, root: Root, menus: [SldTarget, string, string | undefined][];
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    localStorage.clear();
    menus = [];
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; vi.unstubAllGlobals(); });
  const draw = (part: SldPart, shown?: ShownPart) => act(() => root.render(
    <SystemDiagram project={partProject(whole, part)} wholeProject={whole} calcProject={whole} results={results} shown={shown ?? chip(part)} selectedFeederId={null} selectedBoardId={null}
      onSelectFeeder={noop} onSelectBoard={noop}
      menuFor={(t, v) => sldMenu({ project: whole, calcProject: whole, results, canUndo: false, canRedo: false, layers: DEFAULT_LAYERS, colorBy: 'none', supply: 'normal', hasGenerator: false, outages: [], grid: v.grid, detail: v.detail, part: partKey(part) }, t)}
      onMenu={(t, a, v) => menus.push([t, a, v])} />
  ));
  const at = (sel: string) => host.querySelector(`.sysdiag > svg ${sel}`)!;
  const rightClick = (el: Element) => act(() => { el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 100, clientY: 60 })); });
  const row = (label: string) => [...host.querySelectorAll<HTMLButtonElement>('.cad-menu button')].find((b) => b.querySelector('.lb')?.textContent === label)!;

  it('an RMU and a substation frame open their menus; Show … only reaches the page', () => {
    draw({ kind: 'substation', name: 'SS-1' });
    rightClick(at('g.rmu[data-rmu="RMU-1"] rect'));
    expect(host.querySelector('.cad-menu-hd b')?.textContent).toBe('RMU-1');
    act(() => row('Show RMU-1 only').click());
    expect(menus).toEqual([[{ kind: 'rmu', name: 'RMU-1' }, 'part', 'rmu:RMU-1']]);
    rightClick(at('g.ss-frame[data-ss="SS-1"] text'));
    expect(host.querySelector('.cad-menu-hd b')?.textContent).toBe('Substation SS-1');
    act(() => row('Show all').click());
    expect(menus[1]).toEqual([{ kind: 'substation', name: 'SS-1' }, 'part', 'all']);
  });

  it('in the MV overview a double-click on a substation frame shows it; the chip steps and shows all', () => {
    const go = vi.fn(), all = vi.fn();
    draw({ kind: 'mv' }, chip({ kind: 'mv' }, { onShowAll: all, next: { name: 'X', go } }));
    expect(at('g.ss-frame[data-ss="SS-1"] title').textContent).toBe('Substation SS-1 — double-click to show it');
    act(() => { at('g.ss-frame[data-ss="SS-1"] rect').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
    expect(menus).toEqual([[{ kind: 'substation', name: 'SS-1' }, 'part', 'ss:SS-1']]);
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('.sd-shown button')];
    act(() => buttons[1].click());
    act(() => buttons[2].click());
    expect([go.mock.calls.length, all.mock.calls.length]).toEqual([1, 1]);
  });
});
