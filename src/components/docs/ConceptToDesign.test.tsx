// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { sampleProject } from '../../data/sampleProject';
import { DEFAULT_TYPES, newAssessment } from '../../calc/loadAssessment';
import { generateBuildingDbs } from '../../calc/buildingDesign';
import type { BuildingInfo, Project } from '../../types';
import { ConceptToDesignTable } from './ConceptToDesign';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.setConfig({ testTimeout: 30000 });

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.append(host); });
afterEach(() => { act(() => root?.unmount()); host.remove(); });
const show = async (el: ReactElement) => { await act(async () => { root = createRoot(host); root.render(el); }); };
const text = () => document.body.textContent ?? '';
async function until(what: string, isTrue: () => boolean) {
  const giveUp = Date.now() + 20000;
  while (!isTrue()) {
    if (Date.now() > giveUp) throw new Error(`Still waiting for ${what}. On screen: ${text()}`);
    await act(async () => { await new Promise((r) => { setTimeout(r, 20); }); });
  }
}
const button = (label: string) => [...document.body.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === label);
const press = async (label: string) => { await until(`the “${label}” button`, () => !!button(label)); await act(async () => button(label)!.click()); };

const building: BuildingInfo = {
  buildings: [
    { id: 'T', name: 'Tower A', levels: [
      { id: 'T-G', name: 'Ground', kind: 'ground', heightM: 4.5, grossM2: 1200 },
      { id: 'T-T', name: 'Typical floors', kind: 'typical', heightM: 3.6, grossM2: 1150, count: 20, units: [{ unitTypeId: 'U2', count: 8 }] }
    ] },
    { id: 'P', name: 'Podium shops', levels: [{ id: 'P-G', name: 'Ground', kind: 'ground', heightM: 5, grossM2: 1200 }] }
  ],
  unitTypes: [{ id: 'U2', name: '2BR apartment', rooms: [{ name: 'Living', type: 'living', areaM2: 74 }, { name: 'Bedrooms', type: 'bedroom', areaM2: 44 }] }],
  rooms: [
    { id: 'r1', buildingId: 'T', levelId: 'T-T', name: 'Corridor', type: 'lobby', areaM2: 150 },
    { id: 'r2', buildingId: 'T', levelId: 'T-G', name: 'Lobby', type: 'lobby', areaM2: 300 },
    { id: 'r5', buildingId: 'P', levelId: 'P-G', name: 'Shops', type: 'retail', areaM2: 1100 }
  ]
};
const project: Project = { ...sampleProject, building, loadAssessment: newAssessment(DEFAULT_TYPES[0], {}, { types: [] }) };

describe('ConceptToDesignTable', () => {
  it('shows the assessment and the rooms, and the buildings on request', async () => {
    await show(<ConceptToDesignTable project={project} />);
    await until('the rows', () => text().includes('Assessment') && text().includes('Rooms'));
    expect(text()).toContain('Load assessment · MD');
    expect(text()).not.toContain('Tower A');
    await press('Per building');
    await until('the buildings', () => text().includes('Tower A') && text().includes('Podium shops'));
    expect(button('Hide buildings')).toBeTruthy();
  });

  it('adds the designed row once load schedules exist', async () => {
    const main = sampleProject.boards.find((b) => !b.upstreamId)!.id;
    await show(<ConceptToDesignTable project={generateBuildingDbs(project, 'T', main).project} here />);
    await until('the designed row', () => text().includes('Designed so far'));
    expect(text()).toContain('this page · MD');
    expect(text()).toContain('% of the assessment');
  });

  it('shows nothing without an assessment', async () => {
    await show(<ConceptToDesignTable project={{ ...project, loadAssessment: undefined }} />);
    expect(host.innerHTML).toBe('');
  });
});
