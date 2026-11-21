// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { sampleProject } from '../../data/sampleProject';
import { DEFAULT_TYPES, newAssessment, type LaStandard } from '../../calc/loadAssessment';
import { EMPTY_CATALOG, setCatalog } from '../../database/catalog';
import type { Project } from '../../types';
import LoadAssessmentView from './LoadAssessmentView';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.setConfig({ testTimeout: 30000 });

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { localStorage.clear(); host = document.createElement('div'); document.body.append(host); });
afterEach(() => { act(() => root?.unmount()); host.remove(); localStorage.clear(); setCatalog(EMPTY_CATALOG); delete (window as { lvds?: unknown }).lvds; });
const show = async (project: Project, onChange: (p: Project) => void) => { await act(async () => { root = createRoot(host); root.render(<LoadAssessmentView project={project} onChange={onChange} onStatus={() => {}} />); }); await until(() => host.textContent?.includes('Density standard') ?? false); };
const until = async (ok: () => boolean) => { for (let i = 0; i < 200 && !ok(); i++) await act(async () => { await new Promise((r) => setTimeout(r, 25)); }); expect(ok()).toBe(true); };
const standards: LaStandard[] = [
  { name: 'Authority A', spaces: [{ id: 'apt', label: 'Apartment', ltg: 7, pwr: 33, clg: 100, dwelling: true }, { id: 'terrace', label: 'Terrace', location: 'oo', ltg: 4, pwr: 8, clg: 0 }] },
  { name: 'Company', spaces: [{ id: 'apt', label: 'Apartment', ltg: 9, pwr: 40, clg: 120, dwelling: true }] }
];
const project = (): Project => ({ ...sampleProject, building: undefined, loadAssessment: { ...newAssessment(DEFAULT_TYPES[0], {}, { types: [] }), standard: 'Authority A', rows: [{ id: 'apt', label: 'Apartment', ltg: 7, pwr: 33, clg: 100, dwelling: true, pct: 100 }] } });
const find = (label: string, tag: string) => [...document.querySelectorAll(tag)].find((e) => e.textContent?.startsWith(label)) as HTMLElement | undefined;

describe('Load assessment: density standards', () => {
  it('lists the standards in a picker', async () => {
    setCatalog({ ...EMPTY_CATALOG, spaceStandards: standards });
    await show(project(), () => {});
    const sel = find('Density standard', 'label')!.querySelector('select')!;
    expect([...sel.options].map((o) => o.textContent)).toEqual(['Authority A', 'Company']);
    expect(sel.value).toBe('Authority A');
  });

  it('marks a row changed from the standard and resets it', async () => {
    setCatalog({ ...EMPTY_CATALOG, spaceStandards: standards });
    const p = project();
    const onChange = vi.fn();
    await show({ ...p, loadAssessment: { ...p.loadAssessment!, rows: [{ ...p.loadAssessment!.rows[0], pwr: 50 }] } }, onChange);
    expect(host.textContent).toContain('edited');
    await act(async () => { find('Reset', 'button')!.click(); });
    expect((onChange.mock.calls[0][0] as Project).loadAssessment!.rows[0]).toMatchObject({ ltg: 7, pwr: 33, clg: 100, pct: 100 });
  });

  it('shows nothing for a row equal to the standard', async () => {
    setCatalog({ ...EMPTY_CATALOG, spaceStandards: standards });
    await show(project(), () => {});
    expect(host.textContent).not.toContain('Reset');
  });

  it('offers the outdoor variant of a space with its location', async () => {
    setCatalog({ ...EMPTY_CATALOG, spaceStandards: standards });
    await show(project(), () => {});
    const sel = [...document.querySelectorAll('select')].find((s) => s.options[0]?.textContent === '+ Space from my standard…')!;
    expect([...sel.options].map((o) => o.textContent)).toEqual(['+ Space from my standard…', 'Apartment', 'Terrace (outdoor, open)']);
  });

  it('disables Edit standards… without the desktop app', async () => {
    setCatalog({ ...EMPTY_CATALOG, spaceStandards: standards });
    await show(project(), () => {});
    expect((find('Edit standards…', 'button') as HTMLButtonElement).disabled).toBe(true);
  });
});
