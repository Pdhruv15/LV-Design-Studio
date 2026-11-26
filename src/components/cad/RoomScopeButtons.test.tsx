// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RoomScopeButtons from './RoomScopeButtons';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe('Rooms buttons of Fill room and Light room', () => {
  it('shows the three scopes with their counts, marks the chosen one and reports a click', () => {
    const onScope = vi.fn();
    act(() => root.render(<RoomScopeButtons scope="type" onScope={onScope} counts={{ room: 1, type: 5, level: 12 }} />));
    const radios = [...host.querySelectorAll<HTMLButtonElement>('[role=radio]')];
    expect(radios.map((b) => b.textContent)).toEqual(['This room', 'Same type · 5', 'Whole level · 12']);
    expect(radios.map((b) => b.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
    act(() => radios[2].click());
    expect(onScope).toHaveBeenCalledWith('level');
  });
  it('shows no counts when there is no room under the pointer', () => {
    act(() => root.render(<RoomScopeButtons scope="room" onScope={() => {}} />));
    expect([...host.querySelectorAll('[role=radio]')].map((b) => b.textContent)).toEqual(['This room', 'Same type', 'Whole level']);
  });
});
