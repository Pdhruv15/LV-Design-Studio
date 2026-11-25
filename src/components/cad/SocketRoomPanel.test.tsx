// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleProject } from '../../data/sampleProject';
import { socketLayout, shareSockets } from '../../model/roomSockets';
import type { BuildingRoom } from '../../types';
import SocketRoomPanel, { SOCK_START } from './SocketRoomPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; });

const outline: [number, number][] = [[0, 0], [6, 0], [6, 4], [0, 4]];
const room: BuildingRoom = { id: 'R1', buildingId: 'V', levelId: 'GF', name: 'Majlis', type: 'living', areaM2: 24, outline };
const circuits = sampleProject.feeders.slice(0, 2);
const render = (over: Partial<Parameters<typeof SocketRoomPanel>[0]> = {}) => {
  const layout = socketLayout(outline, { spacingM: 3, skip: [], off: [] });
  const props = {
    project: sampleProject, room, layout, share: shareSockets(circuits, circuits[0].id, 's13', layout.sockets.map((s) => s.key)), settings: SOCK_START,
    onSettings: vi.fn(), circuits, feederId: circuits[0].id, onFeeder: vi.fn(), onPlace: vi.fn(), onCancel: vi.fn(), ...over
  };
  act(() => root.render(<SocketRoomPanel {...props} />));
  return props;
};
const q = (s: string) => document.querySelector(s) as HTMLElement;
const button = (start: string) => [...document.querySelectorAll('button')].find((b) => b.textContent!.startsWith(start)) as HTMLButtonElement;

describe('Socket room panel', () => {
  it('asks for a room when none is kept', () => {
    render({ room: undefined, layout: undefined, share: undefined });
    expect(q('h4').textContent).toBe('Socket room');
    expect(q('.cad-devform .m').textContent).toBe('Point at a room to see its sockets, click to keep them. The room needs an outline (Room area, Trace or Rooms).');
  });

  it('shows the room, the fields and the result rows', () => {
    render();
    expect(q('h4').textContent).toBe('Socket room Majlis · 24.00 m² · walls 20.00 m');
    expect((q('[aria-label="Socket"]') as HTMLSelectElement).value).toBe('s13');
    expect([...q('[aria-label="Socket"]').querySelectorAll('option')].map((o) => o.textContent)).toContain('Twin socket');
    expect((q('[aria-label="Spacing"]') as HTMLInputElement).value).toBe('3');
    expect(q('[aria-label="Circuit"] option').textContent).toBe('Choose a circuit…');
    expect((q('.cad-devform input[type="checkbox"]') as HTMLInputElement).checked).toBe(true);
    expect(document.body.textContent).toContain('Replace the sockets already in this room');
    const rows = [...document.querySelectorAll('[aria-label="Socket result"] dt')].map((d) => [d.textContent, d.nextElementSibling!.textContent]);
    expect(rows[0]).toEqual(['Walls used', '20.00 m of 20.00 m']);
    expect(rows[1]).toEqual(['Sockets', '6']);
    expect(rows[2][0]).toBe('Circuits');
    expect(rows[2][1]).toMatch(/\+6 → 6 \/ \d+/);
  });

  it('says what was taken off and what has no circuit', () => {
    const layout = socketLayout(outline, { spacingM: 3, skip: [], off: ['0:0'] });
    render({ layout, share: { rows: [], left: layout.sockets.map((s) => s.key) } });
    const dd = [...document.querySelectorAll('[aria-label="Socket result"] dd')].map((d) => d.textContent);
    expect(dd[1]).toBe('5 (1 taken off)');
    expect(dd[3]).toBe('5 sockets: no circuit with room');
    expect(button('Place').disabled).toBe(true);
  });

  it('puts the count on Place, disables it with no circuit chosen and places and cancels', () => {
    const none = render({ feederId: '' });
    expect(button('Place 6 sockets').disabled).toBe(true);
    expect(button('Place 6 sockets').title).toBe('Choose the circuit first');
    const p = render();
    expect(button('Place 6 sockets').disabled).toBe(false);
    act(() => button('Place 6 sockets').click());
    act(() => button('Cancel').click());
    expect(p.onPlace).toHaveBeenCalledTimes(1);
    expect(p.onCancel).toHaveBeenCalledTimes(1);
    expect(none.onPlace).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Click a wall to leave it out, a socket to take it off.');
  });

  it('says Place 1 socket for one', () => {
    const layout = socketLayout(outline, { spacingM: 3, skip: [0, 1, 2], off: [] });
    render({ layout, share: shareSockets(circuits, circuits[0].id, 's13', layout.sockets.map((s) => s.key)) });
    expect(button('Place').textContent).toBe('Place 1 socket');
  });
});
