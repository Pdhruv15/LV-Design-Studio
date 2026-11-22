// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import HvSupplyCard from './HvSupplyCard';
import { sampleProject } from '../data/sampleProject';
import { BUILT_IN_REFERENCES, applyReference, supplyNameSuggestion } from '../model/designReference';
import type { Project } from '../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root, host: HTMLDivElement, last: Project;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; });

const base: Project = { ...sampleProject, designReference: undefined, gridSources: undefined };
function Harness({ initial }: { initial: Project }) {
  const [p, setP] = useState(initial);
  return <HvSupplyCard project={p} onChange={(x) => { last = x; setP(x); }} />;
}
const addButton = () => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Add grid source')!;
const operatorCell = () => document.querySelector<HTMLInputElement>('tbody tr td:nth-child(2) input')!;
const options = () => [...document.querySelectorAll('datalist#grid-operators option')].map((o) => o.getAttribute('value'));

describe('HvSupplyCard: operator', () => {
  it('a new grid source has no operator, and a typed one is stored on blur', () => {
    act(() => root.render(<Harness initial={base} />));
    act(() => addButton().click());
    expect(last.gridSources![0].operator).toBeUndefined();
    expect(operatorCell().value).toBe('');
    expect(operatorCell().placeholder).toBe('—');
    act(() => {
      operatorCell().value = 'Network A';
      operatorCell().dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    expect(last.gridSources![0].operator).toBe('Network A');
    act(() => addButton().click());
    expect(options()).toEqual(['Network A']);
  });

  it('shows an existing operator as it is, and suggests the design reference authority', () => {
    const named = BUILT_IN_REFERENCES.map((r) => applyReference(base, r)).find((x) => supplyNameSuggestion(x))!;
    const p: Project = { ...named, gridSources: [{ id: 'GRID-1', name: 'GRID-1', operator: 'Private network', kv: 11 }] };
    act(() => root.render(<Harness initial={p} />));
    expect(operatorCell().value).toBe('Private network');
    expect(options()).toEqual([supplyNameSuggestion(named), 'Private network']);
  });
});
