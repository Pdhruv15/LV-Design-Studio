// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { sampleProject } from '../../data/sampleProject';
import { DEFAULT_TYPES, newAssessment } from '../../calc/loadAssessment';
import type { Project } from '../../types';
import { TransformerGeneratorStudy } from './SizingStudy';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.setConfig({ testTimeout: 30000 });

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.append(host); });
afterEach(() => { act(() => root?.unmount()); host.remove(); });
const text = () => document.body.textContent ?? '';
async function until(what: string, isTrue: () => boolean) {
  const giveUp = Date.now() + 20000;
  while (!isTrue()) {
    if (Date.now() > giveUp) throw new Error(`Still waiting for ${what}. On screen: ${text()}`);
    await act(async () => { await new Promise((r) => { setTimeout(r, 20); }); });
  }
}

const a = newAssessment(DEFAULT_TYPES[0], { gfaM2: 26400, floors: 21, parkingM2: 8000 }, { types: [] });
const project: Project = { ...sampleProject, loadAssessment: { ...a, supply: { ...a.supply, sparePct: 0 } }, studySettings: { futureGrowthPct: 20 } };

describe('Transformer and generator sizing: link to the concept', () => {
  it('shows the settings that differ and keeps them on request', async () => {
    const onChange = vi.fn();
    await act(async () => { root = createRoot(host); root.render(<TransformerGeneratorStudy project={project} onChange={onChange} />); });
    await until('the strip', () => text().includes('The settings differ'));
    expect(text()).toContain('Generator: concept to design');
    const keep = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Keep my settings')!;
    await act(async () => { keep.click(); });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].txGen.kept).toBeTruthy();
  });
});
