// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { sampleProject } from '../../data/sampleProject';
import { emptyPlan } from '../../calc/spacePlan';
import SpacePlanView from './SpacePlanView';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.setConfig({ testTimeout: 30000 });

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.append(host); });
afterEach(() => { act(() => root?.unmount()); host.remove(); });
const text = () => document.body.textContent ?? '';
async function until(what: string, isTrue: () => boolean) {
  const giveUp = Date.now() + 20000;
  while (!isTrue()) {
    if (Date.now() > giveUp) throw new Error(`Still waiting for ${what}. On screen: ${text()}`);
    await act(async () => { await new Promise((r) => { setTimeout(r, 20); }); });
  }
}
const button = (label: string) => [...document.body.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === label);

describe('Space plan: Create / Update supply', () => {
  it('asks for the areas to be assigned first, and changes nothing', async () => {
    const onChange = vi.fn(), onStatus = vi.fn();
    const plan = { ...emptyPlan(), areas: [{ id: 'a1', building: 'Tower A', name: 'Flats', use: 'residential', areaM2: 4000 }] };
    await act(async () => { root = createRoot(host); root.render(<SpacePlanView project={{ ...sampleProject, spacePlan: plan }} onChange={onChange} onStatus={onStatus} onCreated={() => {}} />); });
    await until('the button', () => !!button('Create / Update supply'));
    expect(button('Create SLD')).toBeUndefined();
    await act(async () => button('Create / Update supply')!.click());
    expect(onStatus).toHaveBeenCalledWith(expect.stringContaining('Assign every area'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
