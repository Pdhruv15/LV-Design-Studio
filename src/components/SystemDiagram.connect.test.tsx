// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import SystemDiagram from './SystemDiagram';
import { evaluateProject } from '../calc/electrical';
import { sampleProject } from '../data/sampleProject';
import { DEFAULT_LAYERS } from '../diagram/annotations';
import { sldMenu, type SldTarget } from '../model/sldMenu';
import type { Project } from '../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const noop = () => {};
/** The villa plus a first board fed from a board outside the project, with a sub-board below it. */
const withFirst: Project = {
  ...sampleProject, id: 'connect',
  boards: [...sampleProject.boards, { id: 'DB-LV', name: 'DB LV', kind: 'DB', ratedCurrentA: 63, supply: { fedBy: 'board', faultKa: 12 } }, { id: 'DB-LV-1', name: 'DB LV 1', kind: 'DB', upstreamId: 'DB-LV', ratedCurrentA: 32 }],
  feeders: [...sampleProject.feeders, { id: 'INC-DB-LV-1', boardId: 'DB-LV', feedsBoardId: 'DB-LV-1', name: 'Incomer', loadKw: 0, demandFactor: 1, powerFactor: 0.85, lengthM: 10, cableCsaMm2: 10, cores: 4, breakerRatingA: 32, breakerIcuKa: 10 }]
};

describe('SLD Connect to…', () => {
  let host: HTMLDivElement, root: Root;
  let menus: [SldTarget, string, string | undefined][];
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    localStorage.clear();
    menus = [];
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; vi.unstubAllGlobals(); });

  const draw = (project: Project = withFirst) => {
    const results = evaluateProject(project);
    act(() => root.render(
      <SystemDiagram project={project} calcProject={project} results={results} selectedFeederId={null} selectedBoardId={null}
        onSelectFeeder={noop} onSelectBoard={noop} onDrawing={noop} onPatchFeeder={noop}
        menuFor={(t, v) => sldMenu({ project, calcProject: project, results, canUndo: false, canRedo: false, layers: DEFAULT_LAYERS, colorBy: 'none', supply: 'normal', hasGenerator: false, outages: [], grid: v.grid, detail: v.detail }, t)}
        onMenu={(t, a, v) => menus.push([t, a, v])} />
    ));
  };
  const rightClick = (el: Element) => act(() => { el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 120, clientY: 90 })); });
  const menuRow = (label: string) => [...host.querySelectorAll<HTMLButtonElement>('.cad-menu button')].find((b) => b.querySelector('.lb')?.textContent === label)!;

  it('lists the other boards under its heading, refuses the ones below with the reason, and a pick reports the board', () => {
    draw();
    rightClick(host.querySelector('.sysdiag > svg g.bd[data-lv-id="board:DB-LV"]')!);
    act(() => menuRow('Connect to…').click());
    const list = host.querySelector('.tree-move')!;
    expect(list.querySelector('.tree-menu-h')!.textContent).toContain('Connect DB-LV to…');
    const btns = [...list.querySelectorAll<HTMLButtonElement>('.tree-move-list button')];
    const btn = (id: string) => btns.find((b) => b.querySelector('b')!.textContent === id)!;
    expect(btns.map((b) => b.querySelector('b')!.textContent)).not.toContain('DB-LV');
    expect(btn('DB-LV-1').disabled).toBe(true);
    expect(btn('DB-LV-1').title).toBe('DB-LV-1 is fed from DB-LV');
    expect(btn('SMDB-FF').disabled).toBe(false);
    expect(btn('SMDB-FF').title).toBe('Connect DB-LV to SMDB-FF');
    act(() => btn('SMDB-FF').click());
    expect(menus).toEqual([[{ kind: 'board', id: 'DB-LV' }, 'connectto', 'SMDB-FF']]);
    expect(host.querySelector('.tree-move')).toBeNull();
  });

  it('a fed board has neither row', () => {
    draw();
    rightClick(host.querySelector('.sysdiag > svg g.bd[data-lv-id="board:SMDB-GF"]')!);
    expect(menuRow('Connect to…')).toBeUndefined();
    expect(menuRow('Add upstream board…')).toBeUndefined();
  });
});
