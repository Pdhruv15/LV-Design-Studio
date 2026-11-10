// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import SystemDiagram from './SystemDiagram';
import { sampleProject } from '../data/sampleProject';
import { evaluateProject } from '../calc/electrical';

const noop = () => {};

describe('incomer switching device', () => {
  it('masks the incoming line only over the symbol: the blade pivot meets the line below', () => {
    const p = sampleProject;
    const host = document.createElement('div');
    host.innerHTML = renderToStaticMarkup(
      <SystemDiagram project={p} calcProject={p} results={evaluateProject(p)} selectedFeederId={null} selectedBoardId={null} onSelectFeeder={noop} onSelectBoard={noop} onDrawing={noop} />
    );
    const incomers = [...host.querySelectorAll('g.acc')].filter((g) => g.querySelector('title')?.textContent?.startsWith('Incomer:'));
    expect(incomers.length).toBeGreaterThan(0);
    for (const g of incomers) {
      const mask = g.querySelector('rect.bg-fill')!;
      const bottom = Number(mask.getAttribute('y')) + Number(mask.getAttribute('height'));
      // The blade is the path's last segment, drawn from its pivot at the body bottom: "M30 56L19 30" in the library.
      const pivot = /M\s*\S+\s+(\S+)\s*L\s*\S+\s+\S+\s*$/.exec(g.querySelector('g.iec path')!.getAttribute('d')!)!;
      expect(bottom).toBeLessThanOrEqual(Number(pivot[1]));
    }
  });
});
