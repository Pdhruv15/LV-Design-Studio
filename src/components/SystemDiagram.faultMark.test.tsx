// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import SystemDiagram from './SystemDiagram';
import { sampleProject } from '../data/sampleProject';
import type { Project } from '../types';

const noop = () => {};
const draw = (project: Project) => {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(
    <SystemDiagram project={project} calcProject={project} results={[]}
      selectedFeederId={null} selectedBoardId={null} onSelectFeeder={noop} onSelectBoard={noop} onDrawing={noop} />
  );
  return host;
};
const tip = (g: Element) => g.querySelector('path')!.getAttribute('d')!.match(/^M([\d.-]+) ([\d.-]+)/)!.slice(1).map(Number);
const main = sampleProject.boards.find((b) => !b.upstreamId)!;
const incomer = sampleProject.feeders.find((f) => f.boardId === main.id && f.feedsBoardId)!;

describe('fault point marks on the SLD', () => {
  it('draws none when the project has none', () => {
    expect(draw(sampleProject).querySelectorAll('g.fault-mark')).toHaveLength(0);
  });
  it('a mark on a busbar has its tip on the busbar line, inside the board\'s group, with its number', () => {
    const host = draw({ ...sampleProject, faultPoints: [{ id: 'F1', boardId: main.id }, { id: 'F2', boardId: main.id }] });
    const board = host.querySelector(`g.bd[data-lv-id="board:${main.id}"]`)!;
    const marks = [...board.querySelectorAll('g.fault-mark')];
    expect(marks.map((g) => g.querySelector('text')!.textContent)).toEqual(['F1', 'F2']);
    const bus = board.querySelector('line.bus')!;
    const [x1, y1] = tip(marks[0]), [x2] = tip(marks[1]);
    expect(y1).toBe(Number(bus.getAttribute('y1')));
    expect(x1).toBeLessThanOrEqual(Number(bus.getAttribute('x2')));
    expect(x1 - x2).toBe(34); // the second stands clear of the first
  });
  it('a mark on a cable moves down the cable with its distance: start above half way above the far end', () => {
    const at = (distanceM?: number) => tip(draw({ ...sampleProject, faultPoints: [{ id: 'F1', feederId: incomer.id, distanceM }] }).querySelector('g.fault-mark')!);
    const [xs, ys] = at(0), [, ym] = at(incomer.lengthM / 2), [xe, ye] = at(undefined);
    expect(xs).toBe(xe);
    expect(ym).toBeCloseTo((ys + ye) / 2, 6);
    expect(ye).toBeGreaterThan(ys);
  });
  it('uses the theme colours that print as black on white, with no screen-only class', () => {
    const g = draw({ ...sampleProject, faultPoints: [{ id: 'F1', boardId: main.id }] }).querySelector('g.fault-mark')!;
    expect(g.querySelector('path')!.getAttribute('style')).toContain('var(--tx)');
    expect(g.querySelector('rect')!.getAttribute('style')).toContain('var(--panel)');
    expect(g.getAttribute('data-lv-id')).toBe('fault:F1');
  });
});
