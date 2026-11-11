// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import SystemDiagram from './SystemDiagram';
import { sampleProject } from '../data/sampleProject';
import { newProject, type Board, type Project } from '../types';
import { textWidth } from '../diagram/panelLabels';

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

  it('frames a standard-style root panel with its MET, incomer and ways, the earth pits outside on the left', () => {
    const project: Project = { ...sampleProject, drawing: { ...sampleProject.drawing, sldStyle: 'standard' } };
    const host = draw(project);
    const n = (el: Element, k: string) => Number(el.getAttribute(k));
    const board = host.querySelector<SVGGElement>('g.bd[data-lv-id="board:MDB-1"]')!;
    const frame = board.querySelector<SVGRectElement>('.plain-frame rect')!;
    expect(frame.getAttribute('class')).toContain('interlock');
    const fx1 = n(frame, 'x'), fy1 = n(frame, 'y'), fx2 = fx1 + n(frame, 'width'), fy2 = fy1 + n(frame, 'height');
    // Clear of the transformer and its earth labels (they end at y = 150).
    expect(fy1).toBeGreaterThan(150);
    // No rounded board box: the name is plain text inside the frame, ending left of the incoming line.
    expect(board.querySelector('rect.box')).toBeNull();
    const name = board.querySelector<SVGTextElement>('text.lod-name')!;
    expect(name.textContent).toBe('MDB-1');
    expect(name.getAttribute('text-anchor')).toBe('end');
    const incomerX = n(name, 'x') + 8;
    expect(n(name, 'y')).toBeGreaterThan(fy1);
    // The busbar and every outgoing way's breaker inside; each way and the incomer cross it at a gland mark.
    const bus = board.querySelector<SVGLineElement>('line.bus')!;
    expect(n(bus, 'x1')).toBeGreaterThan(fx1);
    expect(n(bus, 'x2')).toBeLessThan(fx2);
    const busY = n(bus, 'y1');
    expect(fy2).toBeGreaterThanOrEqual(busY + 34);
    const ways = project.feeders.filter((f) => f.boardId === 'MDB-1').length;
    expect(board.querySelectorAll('.plain-frame path')).toHaveLength(ways + 1);
    // Sub-boards keep their board box and get no frame.
    expect(host.querySelector('g.bd[data-lv-id="board:SMDB-GF"] rect.box')).not.toBeNull();
    expect(host.querySelectorAll('.plain-frame')).toHaveLength(1);

    const earth = host.querySelector<SVGGElement>('.earth-pit[data-board-id="MDB-1"]')!;
    // Each pit stands outside the frame on its own conductor and test link (TL1, TL2)…
    const pits = [...earth.querySelectorAll<SVGRectElement>('.earth-electrode rect')];
    const links = [...earth.querySelectorAll<SVGRectElement>('rect.test-link')];
    expect(pits).toHaveLength(2);
    expect(links).toHaveLength(2);
    expect([...earth.querySelectorAll('.test-link-label')].map((t) => t.textContent)).toEqual(['TL1', 'TL2']);
    for (const el of [...pits, ...links]) expect(n(el, 'x') + n(el, 'width')).toBeLessThan(fx1);
    for (const t of earth.querySelectorAll<SVGTextElement>('text')) {
      if (t.closest('.tx-earth')) continue;
      expect(n(t, 'y')).toBeGreaterThan(150);
    }
    // …to a vertical MET inside the frame, left of the incomer.
    const met = earth.querySelector<SVGLineElement>('.met-bar')!;
    expect(n(met, 'x1')).toBe(n(met, 'x2'));
    expect(n(met, 'x1')).toBeGreaterThan(fx1);
    expect(n(met, 'x1')).toBeLessThan(incomerX);
    expect(n(met, 'y1')).toBeGreaterThan(fy1);
    expect(n(met, 'y2')).toBeLessThan(busY);
    for (const route of earth.querySelectorAll('.earth-to-met')) expect(route.getAttribute('d')).toMatch(new RegExp(`^M${n(met, 'x1')} `));
    // The spacing reads clear of the earth symbols.
    const label = [...earth.querySelectorAll<SVGTextElement>('text')].find((t) => / m \(MIN\)$/.test(t.textContent ?? ''))!;
    const w = textWidth(label.textContent!, 7);
    for (const p of pits) expect(Math.abs(n(label, 'x') - (n(p, 'x') + 7))).toBeGreaterThan(w / 2 + 7);
    // The DEWA style keeps its own frame: no standard frame there.
    expect(draw(sampleProject).querySelector('.plain-frame')).toBeNull();
  });

  it('keeps a lone board\'s earth pit spacing clear of the earth symbols', () => {
    for (const project of [newProject('New'), { ...newProject('New'), drawing: { sldStyle: 'standard' as const } }]) {
      const host = draw(project);
      const id = project.boards.find((b) => !b.upstreamId)!.id;
      const earth = host.querySelector<SVGGElement>(`.earth-pit[data-board-id="${id}"]`)!;
      const label = [...earth.querySelectorAll<SVGTextElement>('text')].find((t) => / m \(MIN\)$/.test(t.textContent ?? ''))!;
      const lowest = Math.max(...[...earth.querySelectorAll('.earth-electrode line')].map((l) => Number(l.getAttribute('y2'))));
      expect(Number(label.getAttribute('y')) - 7).toBeGreaterThan(lowest);
      expect(host.querySelector('.plain-frame')).toBeNull();
    }
  });

  it('gives a new project\'s lone DEWA main board its earth detail in a band clear of the incomer', () => {
    const project = newProject('New');
    expect(project.drawing?.sldStyle).not.toBe('standard');
    const host = draw(project);
    const id = project.boards.find((b) => !b.upstreamId)!.id;
    const earth = host.querySelector<SVGGElement>(`.earth-pit[data-board-id="${id}"]`)!;
    const panel = host.querySelector<SVGRectElement>(`g.bd[data-lv-id="board:${id}"] rect.box`)!;
    // No outgoing ways: the board is drawn as a board symbol centred on the incomer line.
    const panelX = Number(panel.getAttribute('x')), panelY = Number(panel.getAttribute('y'));
    const incomerX = panelX + Number(panel.getAttribute('width')) / 2;
    const isMet = (el: Element) => el.classList.contains('met-bar') || el.textContent === 'MET';
    const parts = [...earth.querySelectorAll<SVGGraphicsElement>('rect, text, line')].filter((el) => !el.closest('.tx-earth'));
    const ys = parts.map((el) => Number(el.getAttribute('y') ?? el.getAttribute('y1'))).filter(Number.isFinite);
    // Below the transformer band; all but the MET above the incomer device (34 above the panel).
    expect(Math.min(...ys)).toBeGreaterThan(150);
    expect(Math.max(...parts.filter((el) => !isMet(el)).map((el) => Number(el.getAttribute('y') ?? el.getAttribute('y1'))))).toBeLessThanOrEqual(panelY - 34);
    // The MET bar clears the incomer's voltage label (DEWA draws it higher, where the MET was).
    const volt = [...host.querySelectorAll<SVGTextElement>('g.tx text.m')].find((t) => / V$/.test(t.textContent ?? ''))!;
    const metY = Number(earth.querySelector('.met-bar')!.getAttribute('y1'));
    expect(metY - Number(volt.getAttribute('y'))).toBeGreaterThanOrEqual(8);
    expect(metY).toBeLessThan(panelY);
    // Pits, test link and MET all left of the incomer line; MET outside the panel box.
    for (const el of earth.querySelectorAll<SVGRectElement>('.earth-electrode rect, .test-link')) {
      expect(Number(el.getAttribute('x')) + Number(el.getAttribute('width'))).toBeLessThan(incomerX);
    }
    // Every note ends left of the incomer line too.
    for (const t of earth.querySelectorAll<SVGTextElement>('text')) {
      if (t.closest('.tx-earth') || t.getAttribute('text-anchor')) continue;
      const px = t.classList.contains('b') ? 8 : Number.parseFloat((t.getAttribute('style') ?? '').replace(/.*font-size:\s*/, '')) || 8;
      expect(Number(t.getAttribute('x')) + textWidth(t.textContent ?? '', px, t.classList.contains('b'))).toBeLessThan(incomerX);
    }
    const met = earth.querySelector<SVGLineElement>('.met-bar')!;
    expect(Number(met.getAttribute('x2'))).toBeLessThan(incomerX);
    expect(earth.querySelector('.earth-to-met')!.getAttribute('d')).toMatch(/^M[\d.]+ [\d.]+ V[\d.]+$/);
    // The test link drops left of the voltage label, onto the MET.
    const drop = Number(/^M([\d.]+)/.exec(earth.querySelector('.earth-to-met')!.getAttribute('d')!)![1]);
    expect(drop).toBeLessThan(Number(volt.getAttribute('x')) - textWidth(volt.textContent!, 11));
    expect(drop).toBeGreaterThan(Number(met.getAttribute('x1')));
    // The electrode note is on two lines, keeping the detail narrow.
    const notes = [...earth.querySelectorAll('text')].map((t) => t.textContent);
    expect(notes).toContain('MIN. 3 m ELECTRODE WITH');
    expect(notes).toContain('INSPECTION PIT AND COVER');
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
    expect(Number(pit2.getAttribute('x'))).toBeLessThan(Number(met2.getAttribute('x2')));
  });
});
