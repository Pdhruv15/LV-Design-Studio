// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CadStatusToggles } from './CadStatusToggles';
import type { CadToggles } from './CadCanvas';
import { DRAFT_DEFAULTS, OSNAP_BITS } from '../../model/cadDraft';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; });

const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;
const btn = (label: string) => q(`[aria-label="${label}"]`) as HTMLButtonElement;
const click = (el: Element, type = 'click') => act(() => { el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true })); });
const item = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('.cad-tgmenu button')].find((b) => b.textContent!.includes(text))!;

function render(toggles: CadToggles, over: Partial<Parameters<typeof CadStatusToggles>[0]> = {}) {
  const props = { toggles, gridDots: false, draft: DRAFT_DEFAULTS, canFit: true, onToggle: vi.fn(), onCycleGrid: vi.fn(), onSettings: vi.fn(), onFit: vi.fn(), onDraft: vi.fn(), ...over };
  act(() => root.render(<div className="cad-status"><CadStatusToggles {...props} /></div>));
  return props;
}
const ALL_ON: CadToggles = { snap: true, osnap: true, ortho: false, grid: true, dyn: true, polar: true, otrack: false };

describe('Design CAD status bar icons', () => {
  it('shows the switches as icons in their groups, lit when on, keys in the tooltips', () => {
    render(ALL_ON);
    const groups = [...document.querySelectorAll('.cad-tgg')].map((g) => [...g.querySelectorAll('.cad-tgi')].map((b) => b.getAttribute('aria-label')));
    expect(groups).toEqual([['GRID', 'SNAP'], ['ORTHO', 'POLAR'], ['OSNAP', 'OTRACK'], ['DYN', 'LWT'], ['FIT', 'Drafting settings']]);
    expect(document.querySelectorAll('.cad-tgi svg').length).toBe(10);
    expect(btn('SNAP').classList.contains('on')).toBe(true);
    expect(btn('ORTHO').getAttribute('aria-pressed')).toBe('false');
    expect(btn('ORTHO').title).toBe('ORTHO (F8) — Ortho: off — right-click for its settings');
    expect(btn('GRID').title).toMatch(/^Grid: lines \(F7/);
    expect(btn('LWT').getAttribute('aria-pressed')).toBe('true');
  });

  it('a click switches, the grid cycles, right-click opens the settings tab, fit fits', () => {
    const p = render(ALL_ON);
    click(btn('ORTHO')); click(btn('GRID')); click(btn('ORTHO'), 'contextmenu'); click(btn('DYN'), 'contextmenu'); click(btn('FIT'));
    expect(p.onToggle).toHaveBeenCalledWith('ortho');
    expect(p.onCycleGrid).toHaveBeenCalledTimes(1);
    expect(p.onSettings).toHaveBeenNthCalledWith(1, 'polar');
    expect(p.onSettings).toHaveBeenNthCalledWith(2, 'dyn');
    expect(p.onFit).toHaveBeenCalledTimes(1);
  });

  it('right-click on object snap or polar opens its ▾ list (not the dialog), the settings at its foot', () => {
    const p = render(ALL_ON);
    expect(btn('OSNAP').title).toBe('OSNAP (F3) — Object snap: on — right-click for the running snaps');
    expect(btn('POLAR').title).toBe('POLAR (F10) — Polar tracking: on — right-click for the angles');
    click(btn('OSNAP'), 'contextmenu');
    expect(q('[role="menu"][aria-label="Object snap"]')).not.toBeNull();
    expect(p.onSettings).not.toHaveBeenCalled();
    click(item('Nearest'));
    expect(p.onDraft).toHaveBeenCalledWith({ ...DRAFT_DEFAULTS, osnap: DRAFT_DEFAULTS.osnap | OSNAP_BITS.nearest });
    click(btn('POLAR'), 'contextmenu');
    expect(q('[role="menu"][aria-label="Polar tracking"]')).not.toBeNull();
    click(item('Tracking settings'));
    expect(p.onSettings).toHaveBeenCalledWith('polar');
    expect(q('[role="menu"]')).toBeNull();
  });

  it('the grid icon shows dots when the grid is dots; fit is off without a drawing', () => {
    render(ALL_ON, { gridDots: true, canFit: false });
    expect(btn('GRID').title).toMatch(/^Grid: dots/);
    expect(btn('GRID').querySelectorAll('circle').length).toBe(9);
    expect(btn('FIT').disabled).toBe(true);
  });

  it('object snap ▾ lists the running snaps; a tick changes them at once and stays open', () => {
    const p = render(ALL_ON);
    click(btn('Object snap options'));
    expect(q('[role="menu"][aria-label="Object snap"]')).not.toBeNull();
    expect(item('Endpoint').getAttribute('aria-checked')).toBe('true');
    expect(item('Nearest').getAttribute('aria-checked')).toBe('false');
    click(item('Nearest'));
    expect(p.onDraft).toHaveBeenCalledWith({ ...DRAFT_DEFAULTS, osnap: DRAFT_DEFAULTS.osnap | OSNAP_BITS.nearest });
    expect(q('[role="menu"]')).not.toBeNull();
    click(item('Clear all'));
    expect(p.onDraft).toHaveBeenLastCalledWith({ ...DRAFT_DEFAULTS, osnap: 0 });
    click(item('Object snap settings'));
    expect(p.onSettings).toHaveBeenCalledWith('osnap');
    expect(q('[role="menu"]')).toBeNull();
  });

  it('a snap mode picked while object snap is off turns it on', () => {
    const p = render({ ...ALL_ON, osnap: false });
    click(btn('Object snap options'));
    click(item('Perpendicular'));
    expect(p.onToggle).toHaveBeenCalledWith('osnap');
  });

  it('polar ▾ picks the increment angle and closes; Escape closes it too', () => {
    const p = render({ ...ALL_ON, polar: false });
    click(btn('Polar tracking options'));
    expect(item('45°').getAttribute('aria-checked')).toBe('true');
    click(item('30°'));
    expect(p.onDraft).toHaveBeenCalledWith({ ...DRAFT_DEFAULTS, polarInc: 30 });
    expect(p.onToggle).toHaveBeenCalledWith('polar');
    expect(q('[role="menu"]')).toBeNull();
    click(btn('Polar tracking options'));
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(q('[role="menu"]')).toBeNull();
  });

  it('without a place to save settings the modes are shown but cannot be changed', () => {
    render(ALL_ON, { onDraft: undefined });
    click(btn('Object snap options'));
    expect(item('Endpoint').disabled).toBe(true);
    expect(item('Object snap settings').disabled).toBe(false);
  });
});
