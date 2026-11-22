// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BoardPanel, { type BoardTab } from './BoardPanel';
import BoardEditForm from './BoardEditForm';
import { sampleProject } from '../data/sampleProject';
import { evaluateProject } from '../calc/electrical';
import type { Board, Project } from '../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root, host: HTMLDivElement;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; });

const first = (more: Partial<Board> = {}): Board => ({ id: 'MDB-A', name: 'MDB-A', kind: 'MDB', ratedCurrentA: 200, ...more });
const sub: Board = { id: 'DB-A1', name: 'DB-A1', kind: 'DB', upstreamId: 'MDB-A', ratedCurrentA: 63 };
const projectOf = (b: Board): Project => ({ ...sampleProject, voltageV: 415, designReference: undefined, boards: [b, sub], feeders: [], rmus: undefined });
function panel(p: Project, board: Board, tab: BoardTab, main?: Board) {
  act(() => root.render(<BoardPanel project={p} board={board} results={evaluateProject(p)} onChange={() => {}} onSelectFeeder={() => {}} tab={tab} main={main} />));
}
const dd = (label: string) => [...document.querySelectorAll('dt')].find((d) => d.textContent === label)!.nextElementSibling!.textContent;

describe('BoardPanel: supply of a first board', () => {
  const cases: [string, Board, string][] = [
    ['transformer', first({ sourceKva: 800 }), 'Transformer'],
    ['source', first({ supply: { fedFrom: 'Grid' } }), 'Grid supply'],
    ['board', first({ supply: { fedFrom: 'SMDB-3F', fedBy: 'board' } }), 'SMDB-3F (not in this project)'],
    ['unset', first(), 'Not set']
  ];
  for (const [name, b, text] of cases) {
    it(`Supplied from, ${name}`, () => {
      panel(projectOf(b), b, 'electrical');
      expect(dd('Supplied from')).toBe(text);
    });
  }

  it('a downstream board shows the board above', () => {
    const b = first({ sourceKva: 800 });
    panel(projectOf(b), sub, 'electrical', b);
    expect(dd('Supplied from')).toBe('MDB-A');
  });

  it('the Supply tab of a first board starts with Fed from; the chain names the source', () => {
    const b = first({ supply: { fedFrom: 'Grid', incomer: { cableCsaMm2: 120, lengthM: 30 } } });
    panel(projectOf(b), b, 'supply');
    expect(document.querySelector('legend')!.textContent).toBe('Fed from');
    expect(document.querySelector('.supply-chain span')!.textContent).toBe('Grid supply');
    expect(dd('Incoming feeder')).toBe('120 mm² × 30 m');
    expect(dd('Fault level Ik″')).toContain('(assumed source)');
  });

  it('the incoming feeder of a source without a cable is a dash; of a transformer, the secondary', () => {
    const s = first({ supply: {} });
    panel(projectOf(s), s, 'supply');
    expect(dd('Incoming feeder')).toBe('—');
    const t = first({ sourceKva: 800, sourceImpedancePct: 5 });
    panel(projectOf(t), t, 'supply');
    expect(dd('Incoming feeder')).toBe('Transformer secondary');
    expect(dd('Fault level Ik″')).not.toContain('assumed');
    expect(document.querySelector('.supply-chain span')!.textContent).toBe('Transformer · 800 kVA');
  });

  it('a downstream board under an LV-supplied head shows the read-only line', () => {
    const h = first({ supply: { fedFrom: 'SMDB-3F', fedBy: 'board' } });
    panel(projectOf(h), sub, 'supply', h);
    expect(document.querySelector('legend')).toBeNull();
    expect(host.textContent).toContain('Supply (of MDB-A)');
    expect(host.textContent).toContain('MDB-A is fed from SMDB-3F (not in this project). Select MDB-A to change its supply.');
    expect(document.querySelector('.supply-chain span')!.textContent).toBe('From SMDB-3F');
  });

  it('a downstream board under a head with no supply or an unnamed outside board reads as a sentence', () => {
    const u = first();
    panel(projectOf(u), sub, 'supply', u);
    expect(host.textContent).toContain('The supply of MDB-A is not set. Select MDB-A to set it.');
    const h = first({ supply: { fedBy: 'board' } });
    panel(projectOf(h), sub, 'supply', h);
    expect(host.textContent).toContain('MDB-A is fed from a board not in this project. Select MDB-A to change its supply.');
  });

  it('clearing the head rating on a downstream board keeps the transformer section', () => {
    const Wrap = () => {
      const [h, setH] = useState(first({ sourceKva: 800, sourceImpedancePct: 5 }));
      const p = projectOf(h);
      return <BoardPanel project={p} board={sub} results={evaluateProject(p)} onChange={(b) => setH(b)} onSelectFeeder={() => {}} tab="supply" main={h} />;
    };
    act(() => root.render(<Wrap />));
    const kva = [...document.querySelectorAll('label')].find((l) => l.textContent?.startsWith('Transformer (kVA)'))!.querySelector('input')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(kva, '');
      kva.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(host.textContent).toContain('Transformer (supplies MDB-A)');
    expect(host.textContent).toContain('No transformer rating yet');
  });

  it('a downstream board under a transformer is unchanged', () => {
    const h = first({ sourceKva: 800 });
    panel(projectOf(h), sub, 'supply', h);
    expect(host.textContent).toContain('Transformer (supplies MDB-A)');
    expect(host.textContent).toContain('Changes here apply to every board MDB-A supplies.');
    expect(document.querySelector('legend')).toBeNull();
  });

  it('Related equipment says what feeds a first board', () => {
    const b = first({ supply: { fedFrom: 'Grid' } });
    panel(projectOf(b), b, 'supply');
    const related = [...document.querySelectorAll('.pn')].find((x) => x.querySelector('h3')?.textContent === 'Related equipment')!;
    expect(related.querySelector('dd')!.textContent).toBe('Grid supply');
    const t = first({ sourceKva: 800 });
    panel(projectOf(t), t, 'supply');
    expect([...document.querySelectorAll('.pn')].find((x) => x.querySelector('h3')?.textContent === 'Related equipment')!.querySelector('dd')!.textContent).toBe('800 kVA transformer');
  });
});

describe('BoardEditForm: the Supply tab', () => {
  let n = 0;
  const open = (b: Board, onSave = vi.fn()) => { act(() => root.render(<BoardEditForm key={++n} project={projectOf(b)} board={b} onSave={onSave} onClose={() => {}} />)); return onSave; };
  const tab = (name: string) => [...document.querySelectorAll<HTMLButtonElement>('[role=tab]')].find((t) => t.textContent === name)!;
  const typeIn = (el: HTMLInputElement, value: string) => act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });

  it('is named Supply, and Save returns the edited supply', () => {
    const onSave = open(first({ supply: { fedFrom: 'Grid' } }));
    expect(tab('Transformer')).toBeUndefined();
    act(() => tab('Supply').click());
    typeIn(document.querySelector<HTMLInputElement>('input[aria-label="Fault level Ik″ (kA)"]')!, '25');
    act(() => document.querySelector<HTMLButtonElement>('button[type=submit]')!.click());
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].supply).toEqual({ fedFrom: 'Grid', faultKa: 25 });
  });

  it('the line under the title follows the supply', () => {
    open(first({ sourceKva: 800 }));
    expect(host.textContent).toContain('Main board, supplied by the transformer.');
    open(first({ supply: { fedFrom: 'Grid' } }));
    expect(host.textContent).toContain('First board, fed from Grid supply.');
    open(first());
    expect(host.textContent).toContain('First board, supply not set.');
    open(sub);
    expect(host.textContent).toContain('Supplied from MDB-A.');
    expect(tab('Supply')).toBeUndefined();
  });
});
