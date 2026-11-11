// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import GridSelect from './GridSelect';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const RATINGS = [6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125];

describe('GridSelect (compact rating grid)', () => {
  let host: HTMLDivElement, root: Root;
  let onPick: ReturnType<typeof vi.fn<(v: number) => void>>;
  const render = (value = 20) => act(() => root.render(<GridSelect aria-label="C1 MCB" data-cell="1:2" value={value} options={RATINGS} onPick={onPick} />));
  const select = () => host.querySelector('select')!;
  const grid = () => document.querySelector<HTMLDivElement>('.grid-pick');
  const chip = (v: number) => [...grid()!.querySelectorAll('button')].find((b) => b.textContent === String(v))!;
  const mouse = (el: Element, type: string, init: MouseEventInit = {}) => act(() => { el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init })); });
  const key = (el: Element, k: string, init: KeyboardEventInit = {}) => {
    const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
    act(() => { el.dispatchEvent(e); });
    return e;
  };

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    onPick = vi.fn<(v: number) => void>();
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('keeps the cell a select with the current value, so typing, copy and fill-down still work', () => {
    render();
    expect(select().value).toBe('20');
    expect(select().dataset.cell).toBe('1:2');
    expect(grid()).toBeNull();
  });

  it('stops the system list and opens a 4-column grid on click, focused on the current rating', () => {
    render();
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    act(() => { select().dispatchEvent(down); });
    expect(down.defaultPrevented).toBe(true);
    mouse(select(), 'click');
    expect(grid()).not.toBeNull();
    expect(grid()!.style.gridTemplateColumns).toBe('repeat(4, 44px)');
    expect(grid()!.querySelectorAll('button')).toHaveLength(12);
    expect(document.activeElement).toBe(chip(20));
    expect(chip(20).getAttribute('aria-selected')).toBe('true');
  });

  it('picks a rating with a click and closes', () => {
    render();
    mouse(select(), 'click');
    act(() => chip(32).click());
    expect(onPick).toHaveBeenCalledWith(32);
    expect(grid()).toBeNull();
    expect(document.activeElement).toBe(select());
  });

  it('moves with the arrow keys (a row is 4 chips) and picks with Enter', () => {
    render();
    key(select(), 'ArrowDown');
    expect(grid()).not.toBeNull();
    key(document.activeElement!, 'ArrowDown'); // 20 → 50 (rows: 6 10 16 20 | 25 32 40 50 | …)
    key(document.activeElement!, 'ArrowLeft'); // 50 → 40
    expect(document.activeElement).toBe(chip(40));
    act(() => (document.activeElement as HTMLButtonElement).click()); // what Enter does on a button
    expect(onPick).toHaveBeenCalledWith(40);
  });

  it('closes on Escape without a change', () => {
    render();
    key(select(), ' ');
    key(document.activeElement!, 'ArrowRight');
    key(document.activeElement!, 'Escape');
    expect(grid()).toBeNull();
    expect(onPick).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(select());
  });

  it('closes on a press outside, and does not report the same rating again', () => {
    render();
    mouse(select(), 'click');
    mouse(document.body, 'mousedown');
    expect(grid()).toBeNull();
    mouse(select(), 'click');
    act(() => chip(20).click());
    expect(onPick).not.toHaveBeenCalled();
  });

  it('leaves Shift+click and Shift+arrows to the grid selection', () => {
    render();
    mouse(select(), 'click', { shiftKey: true });
    expect(key(select(), 'ArrowDown', { shiftKey: true }).defaultPrevented).toBe(false);
    expect(grid()).toBeNull();
  });

  it('opens above the cell when there is no room below', () => {
    render();
    vi.spyOn(select(), 'getBoundingClientRect').mockReturnValue({ left: 100, right: 150, top: 700, bottom: 724, width: 50, height: 24, x: 100, y: 700, toJSON: () => ({}) });
    mouse(select(), 'click');
    expect(grid()!.style.bottom).toBe(`${window.innerHeight - 700 + 2}px`);
    expect(grid()!.style.top).toBe('');
  });

  it('still takes a value chosen on the select itself (typing a rating)', () => {
    render();
    act(() => {
      select().value = '25';
      select().dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onPick).toHaveBeenCalledWith(25);
  });
});
