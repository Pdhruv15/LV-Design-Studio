// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import SingleLineDiagram from './SingleLineDiagram';
import { evaluateProject } from '../calc/electrical';
import { sampleProject } from '../data/sampleProject';
import type { Board, Project } from '../types';

const drawn = (board: Board, withProject = true): HTMLElement => {
  const project: Project = { ...sampleProject, boards: [board, ...sampleProject.boards.filter((b) => b.id !== board.id)] };
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(
    <SingleLineDiagram board={board} project={withProject ? project : undefined} results={evaluateProject(project).filter((r) => r.feeder.boardId === board.id)} selected={null} onSelect={() => {}} onDropItem={() => {}} />
  );
  return host;
};
const texts = (h: Element) => [...h.querySelectorAll('text')].map((t) => t.textContent);
const base = { id: 'MDB-A', name: 'MDB-A', kind: 'MDB' as const, ratedCurrentA: 200 };

describe('<SingleLineDiagram> Board tab: the supply point of a first board', () => {
  it('a transformer keeps its two circles and texts', () => {
    const h = drawn(sampleProject.boards.find((b) => b.id === 'MDB-1')!);
    expect(h.querySelectorAll('circle.tr')).toHaveLength(2);
    expect(texts(h)).toEqual(expect.arrayContaining([expect.stringMatching(/kV incoming$/), expect.stringMatching(/^TX · /)]));
  });
  it('a source: its symbol, title and two brief lines', () => {
    const h = drawn({ ...base, supply: { fedFrom: 'Genset', kind: 'generator', faultKa: 20, incomer: { cableCsaMm2: 16, lengthM: 25 } } });
    expect(h.querySelectorAll('circle.tr')).toHaveLength(0);
    expect(texts(h)).toEqual(expect.arrayContaining(['Genset', 'G', 'Ik″ 20 kA given']));
    expect(texts(h).join('|')).not.toMatch(/kV incoming|TX ·/);
  });
  it('a board outside the project: a chevron and its title', () => {
    const h = drawn({ ...base, supply: { fedBy: 'board', fedFrom: 'SMDB-3F' } });
    expect(texts(h)).toEqual(expect.arrayContaining(['From SMDB-3F', 'Ik″ 25.2 kA assumed']));
    expect(h.querySelector('path[d*=" L"]')).not.toBeNull();
  });
  it('unset: a dashed stub and "Supply not set"; no project does not crash', () => {
    for (const withProject of [true, false]) {
      const h = drawn(base, withProject);
      expect(texts(h)).toEqual(expect.arrayContaining(['Supply not set', 'Ik″ 25.2 kA assumed']));
      expect(h.querySelector('line[stroke-dasharray="5 3"]')).not.toBeNull();
    }
  });
});
