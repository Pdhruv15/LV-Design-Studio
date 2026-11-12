// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import SystemDiagram from './SystemDiagram';
import { sampleProject } from '../data/sampleProject';
import { evaluateProject } from '../calc/electrical';
import type { Project } from '../types';

const noop = () => {};
function drawn(project: Project): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(
    <SystemDiagram project={project} results={evaluateProject(project)} hideLegend selectedFeederId={null} selectedBoardId={null} onSelectFeeder={noop} onSelectBoard={noop} />
  );
  return host;
}
const texts = (h: HTMLElement) => [...h.querySelectorAll('text')].map((t) => t.textContent);
const withRmu: Project = { ...sampleProject, boards: sampleProject.boards.map((b) => (b.id === 'MDB-1' ? { ...b, rmu: 'RMU-1' } : b)) };

describe('SLD: grid source and RMU', () => {
  it('draws the utility and RMU as before without HV data', () => {
    const t = texts(drawn(withRmu));
    expect(t).toContain('Utility');
    expect(t).toContain('11 kV');
    expect(t).toContain('RMU-1 · 11 kV');
  });

  it('labels the utility with the operator and fault level, and the RMU with its ways', () => {
    const p: Project = { ...withRmu, gridSources: [{ id: 'G', name: 'GRID-1', operator: 'DEWA', kv: 11, faultMva: 500 }], rmus: [{ name: 'RMU-1', config: 'RRT', ikKa: 21, ikDurationS: 3, tOff: 'fuse' }] };
    const h = drawn(p);
    const t = texts(h);
    expect(t).toContain('DEWA');
    expect(t).toContain('11 kV · 500 MVA');
    expect(t).toContain('RMU-1 · RRT · 11 kV');
    const rmu = h.querySelector('g.rmu')!;
    expect(rmu.querySelector('title')?.textContent).toContain('21 kA 3 s, T-off switch-fuse');
    // The box is at least as wide as its label (≈ 5.6 px a character at 10 px bold).
    expect(Number(rmu.querySelector('rect')!.getAttribute('width'))).toBeGreaterThanOrEqual(19 * 5);
  });
});
