// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { sampleProject } from '../../data/sampleProject';
import { newBuilding } from '../../calc/building';
import { DEFAULT_TYPES, newAssessment } from '../../calc/loadAssessment';
import { createMdbFromAssessment } from '../../calc/loadAssessmentMdb';
import type { Project } from '../../types';
import { ServicesDialog } from './BuildingDesignPanels';

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
const lumpBox = () => [...document.body.querySelectorAll('label')].find((l) => l.textContent?.includes('lump feeders'))?.querySelector('input');

const b = newBuilding('T1', 'Tower');
b.levels = [{ id: 'G', name: 'Ground', kind: 'ground', heightM: 4.5 }, { id: 'T', name: 'Typical', kind: 'typical', heightM: 3.5, count: 20 }];
const plain: Project = { ...sampleProject, building: { buildings: [b], rooms: [], unitTypes: [] } };
const a = newAssessment(DEFAULT_TYPES[0], { gfaM2: 24000, floors: 22, parkingM2: 8000 }, { types: [] });
const withA: Project = { ...plain, loadAssessment: a };
const withLumps: Project = createMdbFromAssessment({ ...withA, boards: [], feeders: [] }, a).project;

describe('Common area services from the load assessment', () => {
  it('shows the assessment column and no lump checkbox when there are no lump feeders', async () => {
    await show(<ServicesDialog project={withA} b={b} onDone={vi.fn()} onClose={vi.fn()} />);
    await until('the column', () => text().includes('From the load assessment') && text().includes('auto from 22 floors'));
    expect(text()).toContain('Starting values from the load assessment');
    expect(lumpBox()).toBeUndefined();
  });

  it('with lump feeders the box is ticked; Add gives svc:lift feeders and no la:lift', async () => {
    const onDone = vi.fn();
    await show(<ServicesDialog project={withLumps} b={b} onDone={onDone} onClose={vi.fn()} />);
    await until('the checkbox', () => !!lumpBox());
    expect(lumpBox()!.checked).toBe(true);
    const add = [...document.body.querySelectorAll<HTMLButtonElement>('button')].find((x) => x.textContent?.startsWith('Add to'))!;
    await act(async () => add.click());
    await until('onDone', () => onDone.mock.calls.length > 0);
    const [p, msg] = onDone.mock.calls[0] as [Project, string];
    expect(p.feeders.some((f) => f.fromRoom === 'svc:lift')).toBe(true);
    expect(p.feeders.some((f) => f.fromRoom === 'la:lift')).toBe(false);
    expect(msg).toContain("the assessment's lump feeders were reduced");
  });

  it('without an assessment there is no column and no checkbox', async () => {
    await show(<ServicesDialog project={plain} b={b} onDone={vi.fn()} onClose={vi.fn()} />);
    await until('the dialog', () => !!button('Cancel'));
    expect(text()).not.toContain('From the load assessment');
    expect(text()).toContain('Typical starting values from the building');
    expect(lumpBox()).toBeUndefined();
  });
});
