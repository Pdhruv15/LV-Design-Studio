// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StartLevelPicker } from './StartLevelPicker';
import { START_LEVELS, type StartChoice } from '../model/startLevel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
const onChange = vi.fn();
beforeEach(() => { onChange.mockClear(); root = createRoot(document.body.appendChild(document.createElement('div'))); });
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; });
const show = (value: StartChoice) => act(() => root.render(<StartLevelPicker value={value} onChange={onChange} />));
const tiles = () => [...document.querySelectorAll<HTMLButtonElement>('[role=radiogroup][aria-label="Start the SLD from"] button[role=radio]')];

describe('Start the SLD from', () => {
  it('shows six radios with the titles in order and the chosen one checked', () => {
    show({ level: 'transformer' });
    expect(tiles().map((t) => t.querySelector('b')!.textContent)).toEqual(START_LEVELS.map((l) => l.title));
    expect(tiles().map((t) => t.getAttribute('aria-checked'))).toEqual(['false', 'false', 'false', 'true', 'false', 'false']);
    expect(tiles().every((t) => t.querySelector('svg'))).toBe(true);
  });
  it('clicking a tile calls onChange with its level', () => {
    show({ level: 'transformer' });
    act(() => tiles()[0].click());
    expect(onChange).toHaveBeenCalledWith({ level: 'db' });
    act(() => tiles()[4].click());
    expect(onChange).toHaveBeenLastCalledWith({ level: 'rmu', transformers: 1 });
  });
  it('the Transformers choice shows only for the RMU start', () => {
    show({ level: 'ring' });
    expect(document.body.textContent).not.toContain('Transformers');
    show({ level: 'rmu', transformers: 1 });
    expect(document.body.textContent).toContain('Transformers');
    const two = document.querySelector<HTMLInputElement>('input[aria-label^="2 — RMU RRTT"]')!;
    act(() => two.click());
    expect(onChange).toHaveBeenCalledWith({ level: 'rmu', transformers: 2 });
  });
});
