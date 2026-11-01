// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SheetList } from './SheetWorkspace';
import { sampleProject } from '../../data/sampleProject';
import type { Project } from '../../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const villa: Project = {
  ...sampleProject, drawingSet: undefined, cadSketch: undefined, cadPlans: undefined,
  building: { buildings: [{ id: 'V', name: 'Villa', levels: [{ id: 'GF', name: 'Ground floor', kind: 'ground', heightM: 4 }] }], rooms: [] }
};
const withTray: Project = {
  ...villa, cadPlans: [{ building: 'V', level: 'GF', file: 'GF.dwg', units: 4 }],
  cadSketch: [{ file: 'GF.dwg', items: [{ id: 'S1', kind: 'pline', layer: 'E-TRAY', pts: [[0, 0], [5000, 0]], tray: { widthMm: 300 } }] }]
};

let root: Root;
const onActive = vi.fn(), onChange = vi.fn(), onStatus = vi.fn();
beforeEach(() => { root = createRoot(document.body.appendChild(document.createElement('div'))); vi.clearAllMocks(); });
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; });

const button = (text: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
const open = (project: Project) => {
  act(() => root.render(<SheetList project={project} active={null} selectedBoardId={null} onActive={onActive} onChange={onChange} onStatus={onStatus} />));
  act(() => button('+ New sheet')!.click());
};

describe('+ New sheet → Plans', () => {
  it('offers the four layouts in order', () => {
    open(villa);
    const names = [...document.querySelectorAll('.st-menu-down button')].map((b) => b.textContent?.trim()).filter((t) => t?.endsWith('layouts — all levels'));
    expect(names).toEqual(['Lighting layouts — all levels', 'Power layouts — all levels', 'ELV layouts — all levels', 'Containment layouts — all levels']);
  });

  it('adds a containment sheet for a level with a tray drawn, and opens it', () => {
    open(withTray);
    act(() => button('Containment layouts — all levels')!.click());
    const added = (onChange.mock.calls[0][0] as Project).drawingSet!.sheets;
    expect(added.map((s) => [s.number, s.title])).toEqual([['E-CNT-001', 'Ground floor · Containment layout']]);
    expect(onActive).toHaveBeenCalledWith(added[0].id);
    expect(onStatus).toHaveBeenCalledWith('1 containment layout sheet(s) added');
  });

  it('says so when nothing is drawn', () => {
    open(villa);
    act(() => button('Containment layouts — all levels')!.click());
    expect(onChange).not.toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledWith('Nothing placed for the containment layout yet (Design CAD → Plan)');
  });
});
