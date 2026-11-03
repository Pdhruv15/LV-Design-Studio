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
  it('stands the pits side by side outside the panel frame, each on its own conductor and test link from the MET', () => {
    const host = draw(sampleProject);
    const earth = host.querySelector<SVGGElement>('.earth-pit[data-board-id="MDB-1"]')!;
    const met = earth.querySelector<SVGLineElement>('.met-bar')!;
    // MDB-1's own frame and name box: the nearest ones left of its MET.
    const nearest = (sel: string) => [...host.querySelectorAll<SVGRectElement>(sel)]
      .filter((r) => Number(r.getAttribute('x')) < Number(met.getAttribute('x1')))
      .sort((a, b) => Number(b.getAttribute('x')) - Number(a.getAttribute('x')))[0];
    const frameX = Number(nearest('.panel-frame .frame-ln').getAttribute('x'));
    const summary = nearest('.panel-frame .sum-box');
    const pits = [...earth.querySelectorAll<SVGRectElement>('.earth-electrode rect')];
    const links = [...earth.querySelectorAll<SVGRectElement>('.test-link')];
    const routes = [...earth.querySelectorAll<SVGPathElement>('.earth-to-met')];
    const n = (el: Element, a: string) => Number(el.getAttribute(a));

    expect(pits).toHaveLength(2);
    expect(links).toHaveLength(2);
    expect([...earth.querySelectorAll('.test-link-label')].map((t) => t.textContent)).toEqual(['TL1', 'TL2']);
    // Vertical MET inside the frame, under the name box.
    expect(n(met, 'x1')).toBe(n(met, 'x2'));
    expect(n(met, 'x1')).toBeGreaterThan(frameX);
    expect(n(met, 'y1')).toBeGreaterThan(n(summary, 'y') + n(summary, 'height'));
    // Pits and test links outside the frame; pits on one line, so the spacing reads horizontally.
    for (const el of [...pits, ...links]) expect(n(el, 'x') + n(el, 'width')).toBeLessThan(frameX);
    expect(new Set(pits.map((p) => p.getAttribute('y'))).size).toBe(1);
    // One straight conductor per pit, evenly spaced along the MET.
    const ys = routes.map((r) => Number(/^M[\d.]+ ([\d.]+) H[\d.]+$/.exec(r.getAttribute('d')!)![1]));
    const [top, bot] = [n(met, 'y1'), n(met, 'y2')];
    expect(ys[0] - top).toBeCloseTo(ys[1] - ys[0], 5);
    expect(bot - ys[1]).toBeCloseTo(ys[1] - ys[0], 5);
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
    // Each board's pits stay clear of the board on its left.
    const met2 = earth[1].querySelector<SVGLineElement>('.met-bar')!;
    const pit2 = earth[1].querySelector<SVGRectElement>('.earth-electrode rect')!;
    expect(Number(pit2.getAttribute('x'))).toBeGreaterThan(Number(earth[0].querySelector('.met-bar')!.getAttribute('x1')));
    expect(Number(pit2.getAttribute('x'))).toBeLessThan(Number(met2.getAttribute('x1')));
  });
});
