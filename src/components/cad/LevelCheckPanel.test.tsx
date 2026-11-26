// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LevelCheck } from '../../model/levelCheck';
import LevelCheckPanel from './LevelCheckPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; });

const box = { x0: 0, y0: 0, x1: 4, y1: 4 };
const check: LevelCheck = {
  counts: '3 lights · 1 socket', toLook: 2, rooms: 2, devices: 4,
  groups: [
    { id: 'lighting', title: 'Lighting', findings: [{ text: 'Office — no light', ok: false, box, fix: { tool: 'lux', roomId: 'R1' } }, { text: '1 room meets its target', ok: true }] },
    { id: 'coverage', title: 'ELV coverage', findings: [{ text: 'CCTV — 1 room not fully covered', ok: false, fix: { tool: 'coverage', system: 'cctv' } }] }
  ]
};
const render = (over: Partial<Parameters<typeof LevelCheckPanel>[0]> = {}) => {
  const props = { levelName: 'Level 1', check, selected: null, onShow: vi.fn(), onFix: vi.fn(), onAgain: vi.fn(), ...over };
  act(() => root.render(<LevelCheckPanel {...props} />));
  return props;
};
const q = (s: string) => document.querySelector(s) as HTMLElement;
const button = (name: string) => [...document.querySelectorAll('button')].find((b) => b.textContent === name) as HTMLButtonElement;
const line = (text: string) => [...document.querySelectorAll('.cad-chk-line')].find((b) => b.textContent === text) as HTMLButtonElement;

describe('Check level panel', () => {
  it('shows the counts, the groups with their counts and the foot', () => {
    render();
    expect(q('.cad-chk-counts').textContent).toBe('3 lights · 1 socket');
    expect(q('[aria-label="Lighting"] .cad-chk-h span').textContent).toBe('1');
    expect(q('[aria-label="ELV coverage"]')).not.toBeNull();
    expect(q('.cad-chk-foot .m').textContent).toBe('2 to look at · 2 rooms and 4 devices checked');
    expect(line('1 room meets its target').closest('.cad-chk-row')!.classList.contains('ok')).toBe(true);
  });

  it('goes to a line, disables a line with no window, and marks the selected one', () => {
    const p = render({ selected: 'Office — no light' });
    act(() => line('Office — no light').click());
    expect(p.onShow).toHaveBeenCalledWith(check.groups[0].findings[0]);
    expect(line('1 room meets its target').disabled).toBe(true);
    expect(line('Office — no light').closest('.cad-chk-row')!.classList.contains('on')).toBe(true);
  });

  it('offers the fixing tool and Check again', () => {
    const p = render();
    act(() => button('Light room').click());
    expect(p.onFix).toHaveBeenCalledWith(check.groups[0].findings[0]);
    act(() => button('Coverage').click());
    expect(p.onFix).toHaveBeenLastCalledWith(check.groups[1].findings[0]);
    act(() => button('Check again').click());
    expect(p.onAgain).toHaveBeenCalled();
  });
});
