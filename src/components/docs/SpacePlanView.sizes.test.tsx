// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { sampleProject } from '../../data/sampleProject';
import { emptyPlan } from '../../calc/spacePlan';
import type { Project } from '../../types';
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
const list = (label: string) => [...document.querySelectorAll('label')].find((l) => l.textContent?.startsWith(label))?.querySelector('select');
const show = async (project: Project, onChange: (p: Project) => void) => { await act(async () => { root = createRoot(host); root.render(<SpacePlanView project={project} onChange={onChange} onStatus={() => {}} onCreated={() => {}} />); }); };
const areas = [{ id: 'a1', building: 'Tower A', name: 'Flats', use: 'residential', areaM2: 4000 }];

describe('Space plan: the transformer size list', () => {
  it('offers the market standard sizes and plans with them', async () => {
    const onChange = vi.fn();
    await show({ ...sampleProject, spacePlan: { ...emptyPlan(), areas } }, onChange);
    await until('the settings', () => !!list('Size list'));
    expect([...list('Size list')!.options].map((o) => o.textContent)).toEqual(['DEWA — 500, 1,000, 1,500 kVA', 'Market standard — 100 to 3,150 kVA']);
    expect(list('Largest size')).toBeUndefined();
    // 4,000 m² × 80 W/m² × 0.7 = 224 kW = 249 kVA: one 500 kVA from the DEWA sizes.
    expect(text()).toContain('1 × 500 kVA');
    const s = list('Size list')!;
    await act(async () => { s.value = 'market'; s.dispatchEvent(new Event('change', { bubbles: true })); });
    const next = (onChange.mock.calls[0][0] as Project).spacePlan!;
    expect(next.settings.sizeList).toBe('market');
    act(() => root.unmount());
    await show({ ...sampleProject, spacePlan: next }, onChange);
    await until('the market list', () => !!list('Largest size'));
    // 249 kVA at 80 % loading: one 315 kVA from the market sizes.
    expect(text()).toContain('1 × 315 kVA');
    expect([...list('Transformer size')!.options].map((o) => o.textContent)).toContain('630 kVA');
    expect(list('Largest size')!.value).toBe('1500');
  });
});
