// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import SystemDiagram from './SystemDiagram';
import FeederForm from './FeederForm';
import { evaluateProject } from '../calc/electrical';
import { sampleProject } from '../data/sampleProject';
import { cableTypeDef } from '../model/cableTypes';
import { DEFAULT_CABLE_TYPE, type Project } from '../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** FF-LAB on a cable chosen by hand; without it the way gets the default armoured cable. */
const project: Project = { ...sampleProject, id: 'auto-cable', feeders: sampleProject.feeders.map((f) => (f.id === 'FF-LAB' ? { ...f, cableType: 'PVC/PVC' } : f)) };
const lab = project.feeders.find((f) => f.id === 'FF-LAB')!;
const auto = `Auto — ${cableTypeDef(DEFAULT_CABLE_TYPE).label}`;
const noop = () => {};

describe('the Auto cable type names the automatic type, not the one chosen by hand', () => {
  let host: HTMLDivElement, root: Root;
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; vi.unstubAllGlobals(); });
  const selectOf = (scope: ParentNode, label: string) =>
    [...scope.querySelectorAll('label')].find((l) => l.firstChild?.textContent?.trim() === label)!.querySelector('select')!;

  it('in the SLD cable editor', () => {
    const results = evaluateProject(project);
    act(() => root.render(<SystemDiagram project={project} calcProject={project} results={results} selectedFeederId={null} selectedBoardId={null}
      onSelectFeeder={noop} onSelectBoard={noop} onDrawing={noop} onPatchFeeder={noop} />));
    act(() => { host.querySelector('g.fd[data-lv-id="feeder:FF-LAB"] text.cable-lbl')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const type = selectOf(host.querySelector('.cable-edit')!, 'Type');
    expect(type.value).toBe('PVC/PVC');
    expect(type.options[0].textContent).toBe(auto);
  });

  it('in the feeder form', () => {
    act(() => root.render(<FeederForm project={project} boardId={lab.boardId} initial={lab} onSave={noop} onClose={noop} />));
    act(() => [...document.querySelectorAll<HTMLButtonElement>('button[role="tab"]')].find((b) => b.textContent === 'Cable')!.click());
    const type = selectOf(document, 'Cable type');
    expect(type.value).toBe('PVC/PVC');
    expect(type.options[0].textContent).toBe(auto);
  });
});
