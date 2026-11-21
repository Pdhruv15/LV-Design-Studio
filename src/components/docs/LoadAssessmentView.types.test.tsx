// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { sampleProject } from '../../data/sampleProject';
import { DEFAULT_TYPES, newAssessment } from '../../calc/loadAssessment';
import type { Project } from '../../types';
import LoadAssessmentView from './LoadAssessmentView';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.setConfig({ testTimeout: 30000 });

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { localStorage.clear(); host = document.createElement('div'); document.body.append(host); });
afterEach(() => { act(() => root?.unmount()); host.remove(); localStorage.clear(); });
const show = async (project: Project, onChange: (p: Project) => void) => { await act(async () => { root = createRoot(host); root.render(<LoadAssessmentView project={project} onChange={onChange} onStatus={() => {}} />); }); };
const list = () => [...document.querySelectorAll('label')].find((l) => l.textContent?.startsWith('Building type'))!.querySelector('select')!;
const pick = async (value: string) => { const s = list(); await act(async () => { s.value = value; s.dispatchEvent(new Event('change', { bubbles: true })); }); };
const empty: Project = { ...sampleProject, building: undefined, loadAssessment: undefined };

describe('Load assessment: the building types as one list', () => {
  it('starts an assessment from the type picked in the list', async () => {
    const onChange = vi.fn();
    await show(empty, onChange);
    const groups = [...list().querySelectorAll('optgroup')].map((g) => g.label);
    expect(groups).toEqual(['Starting types (placeholders)']);
    expect([...list().options].map((o) => o.textContent)).toContain('Office · 70–120 VA/m²');
    expect(list().value).toBe('');
    await pick('office');
    expect((onChange.mock.calls[0][0] as Project).loadAssessment).toMatchObject({ typeId: 'office', typeLabel: 'Office' });
  });

  it('shows the type in use and saves the current set-up as a new type from the list', async () => {
    const onChange = vi.fn();
    const a = newAssessment(DEFAULT_TYPES[0], {}, { types: [] });
    await show({ ...empty, loadAssessment: a }, onChange);
    expect(list().value).toBe('res');
    expect(document.querySelector('.la-type')).toBeNull();
    await pick('+');
    const next = (onChange.mock.calls[0][0] as Project).loadAssessment!;
    expect(next.typeId).toMatch(/^my/);
    expect(next.typeLabel).toBe('My residential tower');
    expect(JSON.parse(localStorage.getItem('lvds.loadAssessmentLibrary')!).types).toHaveLength(1);
  });

  it('lists your own types in a group of their own', async () => {
    localStorage.setItem('lvds.loadAssessmentLibrary', JSON.stringify({ types: [{ ...DEFAULT_TYPES[2], id: 'my1', label: 'My office', mine: true }] }));
    await show(empty, () => {});
    const mine = [...list().querySelectorAll('optgroup')].find((g) => g.label === 'My types')!;
    expect([...mine.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['My office · 70–120 VA/m²']);
  });
});
