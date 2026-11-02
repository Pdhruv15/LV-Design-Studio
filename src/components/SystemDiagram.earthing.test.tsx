// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import SystemDiagram from './SystemDiagram';
import { sampleProject } from '../data/sampleProject';
import type { Board, Project } from '../types';

const noop = () => {};

const draw = (project: Project) => {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(
    <SystemDiagram project={project} calcProject={project} results={[]}
      selectedFeederId={null} selectedBoardId={null} onSelectFeeder={noop} onSelectBoard={noop} onDrawing={noop} />
  );
  return host;
};

const root = (id: string): Board => ({
  id,
  name: id,
  kind: 'MDB',
  sourceKva: 1000,
  sourceImpedancePct: 6,
  ratedCurrentA: 1600
});

describe('SLD main earth-pit arrangement', () => {
  it('places the pits above the panel summary and uses one test-link route with one bend to the MET', () => {
    const host = draw(sampleProject);
    const earth = host.querySelector<SVGGElement>('.earth-pit[data-board-id="MDB-1"]')!;
    const summary = [...host.querySelectorAll<SVGRectElement>('.panel-frame .sum-box')]
      .sort((a, b) => Number(a.getAttribute('y')) - Number(b.getAttribute('y')))[0];
    const firstPit = earth.querySelector<SVGRectElement>('.earth-electrode rect')!;
    const testLink = earth.querySelector<SVGRectElement>('.test-link')!;
    const testLinkLabel = earth.querySelector<SVGTextElement>('.test-link-label')!;
    const route = earth.querySelector<SVGPathElement>('.earth-to-met')!;

    expect(earth.querySelectorAll('.earth-electrode')).toHaveLength(2);
    expect(earth.querySelectorAll('.test-link')).toHaveLength(1);
    expect(Number(firstPit.getAttribute('y')) + Number(firstPit.getAttribute('height'))).toBeLessThan(Number(summary.getAttribute('y')));
    expect(Number(testLinkLabel.getAttribute('y'))).toBeGreaterThan(Number(testLink.getAttribute('y')) + Number(testLink.getAttribute('height')));
    expect(route.getAttribute('d')).toMatch(/^M[\d.]+ [\d.]+ H[\d.]+ V[\d.]+$/);
  });

  it('anchors the standard-style earth detail and MET to the main panel', () => {
    const project: Project = { ...sampleProject, drawing: { ...sampleProject.drawing, sldStyle: 'standard' } };
    const host = draw(project);
    const board = host.querySelector<SVGGElement>('g.bd[data-lv-id="board:MDB-1"]')!;
    const panel = board.querySelector<SVGRectElement>('rect.box')!;
    const met = host.querySelector<SVGLineElement>('.earth-pit[data-board-id="MDB-1"] .met-bar')!;
    const panelX = Number(panel.getAttribute('x'));

    expect(Number(met.getAttribute('x1'))).toBeGreaterThan(panelX);
    expect(Number(met.getAttribute('x2'))).toBeLessThanOrEqual(panelX + Number(panel.getAttribute('width')));
  });

  it('keeps the standard-style detail below the transformer band and its MET clear of the labels', () => {
    const project: Project = { ...sampleProject, drawing: { ...sampleProject.drawing, sldStyle: 'standard' } };
    const host = draw(project);
    const earth = host.querySelector<SVGGElement>('.earth-pit[data-board-id="MDB-1"]')!;
    // The transformer symbol, its 415 V tag and its earth labels end at y = 150: every part of
    // the pit detail (the transformer's own earths excepted) sits below that band.
    const tops = [...earth.querySelectorAll<SVGGraphicsElement>('rect, text, line')]
      .filter((el) => !el.closest('.tx-earth'))
      .map((el) => Number(el.getAttribute('y') ?? el.getAttribute('y1')))
      .filter((y) => Number.isFinite(y));
    expect(tops.length).toBeGreaterThan(8);
    expect(Math.min(...tops)).toBeGreaterThan(150);
    // The MET conductor drops straight down (one conductor, no bend crossing a label column)…
    const route = earth.querySelector<SVGPathElement>('.earth-to-met')!;
    expect(route.getAttribute('d')).toMatch(/^M[\d.]+ [\d.]+ V[\d.]+$/);
    // …and the MET bar ends left of the incomer column (x), above the device band (y), so it
    // cannot meet the voltage and loading rows that start at the incomer.
    const panel = host.querySelector<SVGRectElement>('g.bd[data-lv-id="board:MDB-1"] rect.box')!;
    const met = earth.querySelector<SVGLineElement>('.met-bar')!;
    expect(Number(met.getAttribute('x2'))).toBeLessThan(Number(panel.getAttribute('x')) + 62);
    expect(Number(met.getAttribute('y1'))).toBeLessThanOrEqual(Number(panel.getAttribute('y')) - 34);
  });

  it('draws the planned LV earth pit for each of two adjacent transformer-fed panels', () => {
    const project: Project = {
      ...sampleProject,
      boards: [root('MDB-1'), root('MDB-2')],
      feeders: [],
      ties: [],
      earthingPlan: {},
      earthPitIds: undefined
    };
    const host = draw(project);
    const earth = [...host.querySelectorAll<SVGGElement>('.earth-pit')];

    expect(earth.map((g) => g.dataset.boardId)).toEqual(['MDB-1', 'MDB-2']);
    expect(earth.map((g) => g.querySelectorAll('.earth-electrode').length)).toEqual([1, 1]);
    expect(earth.map((g) => g.querySelectorAll('.test-link').length)).toEqual([1, 1]);
  });
});
