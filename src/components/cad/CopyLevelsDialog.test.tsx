// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleProject } from '../../data/sampleProject';
import { placeAccessory, placeLvPoint } from '../../model/cadDevices';
import { floorList } from '../../model/levels';
import type { Board, Feeder, Project } from '../../types';
import { CopyLevelsDialog } from './CopyLevelsDialog';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; });

const tplB = sampleProject.boards[0];
const tplF = sampleProject.feeders.find((f) => !f.feedsBoardId && !f.generation)!;
const board = (id: string, level: string): Board => ({ ...tplB, id, name: id, level: { building: 'B', level } });
const way = (boardId: string, n: number): Feeder => ({ ...tplF, id: `${boardId}-${n}`, boardId, phase: 'R', way: n, name: `Way ${n}`, points: {}, feedsBoardId: undefined, generation: undefined });
const L1 = { building: 'B', level: 'L1' };
// Level 1 has two lights (ways 1 and 2) and a switch; Level 2 has way 1 only; Level 3 has both ways.
const make = (): Project => {
  let p: Project = {
    ...sampleProject, lvPoints: undefined, cadAccessories: undefined, elvDevices: undefined, lvPointSeq: undefined, cadAccessorySeq: undefined,
    building: { buildings: [{ id: 'B', name: 'Block', levels: ['L1', 'L2', 'L3'].map((id, i) => ({ id, name: `Level ${i + 1}`, kind: 'typical' as const, heightM: 4 })) }], rooms: [] },
    boards: [board('DB-1', 'L1'), board('DB-2', 'L2'), board('DB-3', 'L3')],
    feeders: [way('DB-1', 1), way('DB-1', 2), way('DB-2', 1), way('DB-3', 1), way('DB-3', 2)]
  };
  p = placeLvPoint(p, L1, 'ltg', 'DB-1-1', 1, 1).project;
  p = placeLvPoint(p, L1, 'ltg', 'DB-1-2', 2, 2).project;
  return placeAccessory(p, L1, 'switch', 3, 3).project;
};
const render = (project = make()) => {
  const from = floorList(project.building)[0];
  const props = { project, from, file: 'plan-1.dxf', onCopy: vi.fn(), onClose: vi.fn() };
  act(() => root.render(<CopyLevelsDialog {...props} />));
  return props;
};
const q = (s: string) => document.querySelector(s) as HTMLElement;
const tick = (label: string) => act(() => ([...document.querySelectorAll<HTMLInputElement>('input[type=checkbox]')].find((i) => i.parentElement!.textContent!.trim().startsWith(label))!).click());
const copyButton = () => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Copy') as HTMLButtonElement;

describe('Copy to levels window', () => {
  it('counts what the level holds, with the rows that have nothing greyed', () => {
    render();
    expect(q('.cad-cl-from').textContent).toBe('From Level 1 · plan-1.dxf');
    const rows = [...document.querySelectorAll('.cad-cl-what label')].map((l) => [l.textContent!.trim(), (l.querySelector('input') as HTMLInputElement).checked, (l.querySelector('input') as HTMLInputElement).disabled]);
    expect(rows[0]).toEqual(['Lights, sockets and equipment — 2', true, false]);
    expect(rows[1]).toEqual(['Switches and boxes — 1', true, false]);
    expect(rows[2]).toEqual(['Fire alarm — 0', false, true]);
    expect([...document.querySelectorAll('.cad-cl-levels label')].map((l) => l.textContent!.trim())).toEqual(['Level 2', 'Level 3']);
    expect(q('.cad-cl-map')).toBeNull();
  });

  it('shows the circuits table and the foot once a level is ticked, and a note for a way that is missing', () => {
    render();
    tick('Level 2');
    expect(q('.cad-cl-map thead').textContent).toBe('From this levelLevel 2');
    expect(q('.cad-cl-map tbody td').textContent).toBe('DB-1 · 2 devices');
    expect((q('select[aria-label="DB-1 on Level 2"]') as HTMLSelectElement).value).toBe('DB-2');
    expect(q('.cad-cl-sum').textContent).toBe('2 devices to Level 2'); // one light, the switch
    expect([...document.querySelectorAll('.cad-cl-notes li')].map((x) => x.textContent)).toEqual(['DB-2 has no way R2: 1 light left out on Level 2']);
    tick('Level 3');
    expect(q('.cad-cl-sum').textContent).toBe('2 devices to Level 2 · 3 devices to Level 3');
  });

  it('keeps Copy greyed with no level, then copies once with the devices in the project and the message', () => {
    const props = render();
    expect(copyButton().disabled).toBe(true);
    expect(copyButton().title).toBe('Choose a level first');
    tick('Level 3');
    tick('Level 2');
    expect(copyButton().disabled).toBe(false);
    act(() => copyButton().click());
    expect(props.onCopy).toHaveBeenCalledTimes(1);
    const [next, message] = props.onCopy.mock.calls[0] as [Project, string];
    expect(message).toBe('CL  5 devices copied to 2 levels — 1 left out · ⌘Z to undo');
    expect(next.lvPoints!.filter((d) => d.levelId === 'L3')).toHaveLength(2);
    expect(next.lvPoints!.filter((d) => d.levelId === 'L2')).toHaveLength(1);
    expect(next.cadAccessories!.filter((d) => d.levelId !== 'L1')).toHaveLength(2);
  });

  it('says what is already there and takes it off first with Replace; Copy says when nothing would be copied', () => {
    const p0 = make();
    const p = placeLvPoint(p0, { building: 'B', level: 'L2' }, 'ltg', 'DB-2-1', 9, 9).project;
    const props = render(p);
    tick('Level 2');
    expect(document.body.textContent).toContain('Already there: 1 on Level 2. They stay unless Replace is ticked.');
    tick('Replace');
    expect(document.body.textContent).not.toContain('Already there');
    act(() => copyButton().click());
    expect(props.onCopy.mock.calls[0][1]).toBe('CL  2 devices copied to 1 level — 1 left out · 1 taken off first · ⌘Z to undo');
    tick('Lights, sockets');
    tick('Switches');
    expect(copyButton().disabled).toBe(true);
    expect(copyButton().title).toBe('Nothing to copy');
  });

  it('shows the circuits table with only switches ticked, and the switch names the circuit on the board chosen', () => {
    let p0 = make();
    p0 = placeAccessory(p0, L1, 'switch', 6, 6, { feederId: 'DB-1-1' }).project;
    const props = render(p0);
    tick('Lights, sockets');
    tick('Level 2');
    expect(q('.cad-cl-map tbody td').textContent).toBe('DB-1 · 1 device');
    act(() => copyButton().click());
    const next = (props.onCopy.mock.calls[0] as [Project, string])[0];
    expect(next.cadAccessories!.filter((a) => a.levelId === 'L2').map((a) => a.feederId)).toEqual([undefined, 'DB-2-1']);
  });

  it('closes with Esc', () => {
    const props = render();
    act(() => { q('[role=dialog]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
