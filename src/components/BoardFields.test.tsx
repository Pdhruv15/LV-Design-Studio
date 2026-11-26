// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import BoardFields from './BoardFields';
import type { Board } from '../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root, host: HTMLDivElement, last: Board;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; });

function Harness({ initial }: { initial: Board }) {
  const [b, setB] = useState(initial);
  return <BoardFields board={b} section="general" groups={['board']} onChange={(x) => { last = x; setB(x); }} />;
}
const button = (text: string) => [...document.querySelectorAll('button')].find((b) => b.textContent === text)!;
const input = (label: string) => document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
function type(el: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('BoardFields: other buildings on this supply', () => {
  const board: Board = { id: 'MDB-1', name: 'MDB-1', existing: { recordedKva: 400 } } as Board;

  it('adds buildings, keeps the higher of allocated and recorded for each, and removes them', () => {
    act(() => root.render(<Harness initial={board} />));
    expect(host.textContent).toContain('Other buildings on this supply');
    expect(host.textContent).not.toContain('Kept for them');

    act(() => button('+ Add building').click());
    type(input('Other building 1 name'), 'Block B');
    type(input('Other building 1 allocated kVA'), '600');
    type(input('Other building 1 recorded kVA'), '450');
    type(input('Other building 1 reference'), 'NOC-123');
    act(() => button('+ Add building').click());
    type(input('Other building 2 allocated kVA'), '200');
    type(input('Other building 2 recorded kVA'), '350');

    expect(last.existing?.others).toEqual([
      { name: 'Block B', allocatedKva: 600, recordedKva: 450, ref: 'NOC-123' },
      { name: '', allocatedKva: 200, recordedKva: 350 },
    ]);
    expect(last.existing?.recordedKva).toBe(400);
    expect(host.textContent).toContain('Kept for them: 950.00 kVA');

    act(() => document.querySelector<HTMLButtonElement>('button[aria-label="Remove other building 1"]')!.click());
    expect(last.existing?.others).toEqual([{ name: '', allocatedKva: 200, recordedKva: 350 }]);
    act(() => document.querySelector<HTMLButtonElement>('button[aria-label="Remove other building 1"]')!.click());
    expect(last.existing?.others).toBeUndefined();
    expect(host.textContent).not.toContain('Kept for them');
  });

  it('is not shown for a new (not existing) board', () => {
    act(() => root.render(<Harness initial={{ id: 'DB-1', name: 'DB-1' } as Board} />));
    expect(host.textContent).not.toContain('Other buildings on this supply');
  });
});

describe('BoardFields: transformer voltage and tap', () => {
  function Source({ initial }: { initial: Board }) {
    const [b, setB] = useState(initial);
    return <BoardFields board={b} section="source" sourceKv={22} onChange={(x) => { last = x; setB(x); }} />;
  }
  const select = (label: string) => [...document.querySelectorAll('label')].find((l) => l.textContent?.startsWith(label))!.querySelector('select')!;
  const pick = (el: HTMLSelectElement, value: string) => act(() => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });

  it('stores the primary voltage and the tap, and clears them on the default option', () => {
    act(() => root.render(<Source initial={{ id: 'MDB', name: 'MDB', sourceKva: 1000 } as Board} />));
    expect(select('Primary voltage').options[0].textContent).toBe('22 kV (source)');
    expect(select('Tap').textContent).toContain('−2.5 % (secondary +2.56 %)');
    pick(select('Primary voltage'), '6.6');
    pick(select('Tap'), '-2.5');
    expect(last.sourcePrimaryKv).toBe(6.6);
    expect(last.sourceTapPct).toBe(-2.5);
    pick(select('Primary voltage'), '');
    pick(select('Tap'), '0');
    expect(last.sourcePrimaryKv).toBeUndefined();
    expect(last.sourceTapPct).toBeUndefined();
  });
});
