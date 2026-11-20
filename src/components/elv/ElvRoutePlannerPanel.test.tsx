// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ElvRoutePlannerPanel from './ElvRoutePlannerPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; });

describe('ELV route planner panel', () => {
  it('starts with the system rules and prevents approval of an overlength data route', () => {
    const onSelected = vi.fn(), onApprove = vi.fn();
    act(() => root.render(<ElvRoutePlannerPanel system="ict" onSystem={() => {}} options={2} onOptions={() => {}} precision="balanced" onPrecision={() => {}}
      plan={{ ok: true, routes: [{ lengthM: 82, bends: 4 }, { lengthM: 96, bends: 2 }], stats: { cells: 1200, gridM: 0.25, approxBytes: 1048576 } }} selected={1} onSelected={onSelected} pickingStart={false}
      lvObstacles={2} preferredRuns={1} maxOptions={3} maxCells={60000} canApprove={false} onApprove={onApprove} onReset={() => {}} />));
    expect(host.textContent).toContain('Permanent link ≤ 90 m');
    expect(host.textContent).toContain('2 LV route pieces used as segregation exclusions');
    expect(host.textContent).toContain('96.0 m exceeds the 90 m maximum');
    expect([...host.querySelectorAll('option')].filter((o) => (o.parentElement as HTMLSelectElement).ariaLabel === 'ELV route alternatives').map((o) => o.value)).toEqual(['1', '2', '3']);
    const approve = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Approve route B') as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    act(() => (host.querySelectorAll('input[type="radio"]')[0] as HTMLInputElement).click());
    expect(onSelected).toHaveBeenCalledWith(0);
  });
});
