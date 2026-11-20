// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LvRoutePlan } from '../../model/lvRoutePlanner';
import LvRoutePlannerPanel from './LvRoutePlannerPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root, host: HTMLDivElement;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; });

const plan: LvRoutePlan = {
  ok: true,
  routes: [
    { points: [[0, 0], [10, 0]], lengthM: 10, bends: 0, visited: 40 },
    { points: [[0, 0], [0, 2], [10, 2], [10, 0]], lengthM: 14, bends: 2, visited: 80 }
  ],
  stats: { cells: 1_200, gridM: 0.25, wallSegments: 12, rasterSamples: 240, visited: 120, approxBytes: 1_048_576 }
};

const props = () => ({
  mode: 'optimal' as const,
  onMode: vi.fn(),
  options: 2,
  onOptions: vi.fn(),
  precision: 'balanced' as const,
  onPrecision: vi.fn(),
  plan,
  selected: 0,
  onSelected: vi.fn(),
  pickingStart: false,
  impact: { currentM: 30, proposedM: 20, detail: '10 m route + allowances = 20 m' },
  canApprove: true,
  onApprove: vi.fn(),
  onReset: vi.fn()
});

describe('LV route planner panel', () => {
  it('keeps the route controls bounded and compares the proposed routes before approval', () => {
    const p = props();
    act(() => root.render(<LvRoutePlannerPanel {...p} />));

    const alternatives = host.querySelector('select[aria-label="LV route alternatives"]') as HTMLSelectElement;
    expect([...alternatives.options].map((o) => o.value)).toEqual(['1', '2', '3']);
    expect(host.textContent).toContain('Route A · Recommended · 10.0 m · 0 bends');
    expect(host.textContent).toContain('Route B · 14.0 m · 2 bends');
    expect(host.textContent).toContain('1,200 / 60,000 cells · 1.0 MB working arrays');
    expect(host.textContent).toContain('Feeder length 30 → 20 m');

    act(() => { alternatives.value = '3'; alternatives.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(p.onOptions).toHaveBeenCalledWith(3);
    act(() => (host.querySelectorAll('input[type="radio"]')[1] as HTMLInputElement).click());
    expect(p.onSelected).toHaveBeenCalledWith(1);
    act(() => [...host.querySelectorAll('button')].find((b) => b.textContent === 'Approve route A')!.click());
    expect(p.onApprove).toHaveBeenCalledOnce();
  });

  it('leaves the existing manual route workflow available', () => {
    const p = props();
    act(() => root.render(<LvRoutePlannerPanel {...p} mode="manual" plan={null} />));
    expect(host.textContent).toContain("Click the route's points, Enter to finish.");
    expect(host.querySelector('select[aria-label="LV route alternatives"]')).toBeNull();
  });
});
