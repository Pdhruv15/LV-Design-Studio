// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { useUnsaved } from './unsaved';
import type { Project } from '../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let dirty: boolean;
function Probe({ project, saved }: { project: Project; saved: Project | null }) {
  dirty = useUnsaved(project, saved);
  return null;
}
const show = (project: Project, saved: Project | null) => act(() => root.render(<Probe project={project} saved={saved} />));
const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

beforeEach(() => {
  vi.useFakeTimers();
  root = createRoot(document.createElement('div'));
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
});

const saved = sampleProject;
const edited: Project = { ...saved, name: 'Edited' };
const undone: Project = { ...edited, name: saved.name }; // the saved content again, in a new object

describe('unsaved changes', () => {
  it('the project as saved is clean; an edit is unsaved at once and stays so', () => {
    show(saved, saved);
    expect(dirty).toBe(false);
    show(edited, saved);
    expect(dirty).toBe(true);
    wait(1000);
    expect(dirty).toBe(true);
  });

  it('undoing back to the saved content is clean again after a pause in editing', () => {
    show(edited, saved);
    show(undone, saved);
    expect(dirty).toBe(true);
    wait(299);
    expect(dirty).toBe(true);
    wait(1);
    expect(dirty).toBe(false);
  });

  it('another edit before the pause ends starts the pause again', () => {
    show(undone, saved);
    wait(200);
    show({ ...undone }, saved);
    wait(200);
    expect(dirty).toBe(true);
    wait(100);
    expect(dirty).toBe(false);
  });

  it('stays unsaved once nothing counts as saved, though the content matched before', () => {
    show(undone, saved);
    wait(300);
    expect(dirty).toBe(false);
    show(undone, null); // the open file was deleted or moved away
    expect(dirty).toBe(true);
    wait(1000);
    expect(dirty).toBe(true);
  });

  it('compares with what was saved last', () => {
    show(undone, saved);
    wait(300);
    expect(dirty).toBe(false);
    show(undone, edited);
    expect(dirty).toBe(true);
    wait(1000);
    expect(dirty).toBe(true);
    show(edited, edited);
    expect(dirty).toBe(false);
  });
});
