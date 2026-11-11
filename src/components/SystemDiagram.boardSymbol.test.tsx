// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import SystemDiagram from './SystemDiagram';
import { sampleProject } from '../data/sampleProject';
import type { Board, Feeder, Project } from '../types';
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
const root = (id: string, extra: Partial<Board> = {}): Board => ({ id, name: id, kind: 'MDB', sourceKva: 1500, sourceImpedancePct: 6, ratedCurrentA: 2500, incomerDevice: 'MCCB-NA', ...extra });
const project = (boards: Board[], feeders: Feeder[] = [], style: 'dewa' | 'standard' = 'dewa'): Project =>
  ({ ...sampleProject, boards, feeders, ties: [], earthingPlan: {}, earthPitIds: undefined, drawing: { ...sampleProject.drawing, sldStyle: style } });
const n = (el: Element, a: string) => Number(el.getAttribute(a));
const board = (host: HTMLElement, id: string) => host.querySelector<SVGGElement>(`g.bd[data-lv-id="board:${id}"]`)!;
const texts = (g: Element) => [...g.querySelectorAll('text')].map((t) => t.textContent);

describe('SLD board with no outgoing ways', () => {
  for (const style of ['dewa', 'standard'] as const) {
    it(`ends the incomer on a board symbol with its name, kind and tags beside it (${style})`, () => {
      const host = draw(project([root('MDB-6')], [], style));
      const g = board(host, 'MDB-6');
      const sym = g.querySelector<SVGRectElement>('.board-sym rect.box')!;
      const x = n(sym, 'x') + n(sym, 'width') / 2;
      const bottom = n(sym, 'y') + n(sym, 'height');
      // The incomer comes down onto the symbol's top; nothing hangs below it.
      const incomer = [...host.querySelectorAll<SVGLineElement>('g.tx line.ln')].filter((l) => n(l, 'x1') === x && n(l, 'x2') === x);
      expect(Math.max(...incomer.map((l) => n(l, 'y2')))).toBe(n(sym, 'y'));
      for (const l of g.querySelectorAll<SVGLineElement>(':scope > line')) expect(n(l, 'y1')).toBeLessThan(bottom);
      // Busbar and two ways inside the enclosure.
      expect(g.querySelectorAll('.board-sym path').length).toBe(1);
      expect(texts(g)).toEqual(expect.arrayContaining(['MDB-6', 'MDB', 'NO OUTGOING WAYS']));
      // Every text is right of the symbol, none inside it.
      for (const t of g.querySelectorAll<SVGTextElement>('text')) {
        if (t.closest('.acc')) continue; // the incomer device label, on the line above
        expect(n(t, 'x')).toBeGreaterThan(x + n(sym, 'width') / 2);
      }
    });
  }

  it('frames it with a dashed panel frame in DEWA style, holding the incomer, voltage label and MET, pits outside', () => {
    const host = draw(project([root('MDB-6'), root('MDB-7')]));
    const frame = board(host, 'MDB-7').querySelector<SVGRectElement>('.board-frame rect.frame-ln')!;
    const [x1, y1] = [n(frame, 'x'), n(frame, 'y')], [x2, y2] = [x1 + n(frame, 'width'), y1 + n(frame, 'height')];
    const inside = (x: number, y: number) => x > x1 && x < x2 && y > y1 && y < y2;
    const g = board(host, 'MDB-7');
    const sym = g.querySelector<SVGRectElement>('.board-sym rect.box')!;
    expect(inside(n(sym, 'x'), n(sym, 'y'))).toBe(true);
    expect(inside(n(sym, 'x') + n(sym, 'width'), n(sym, 'y') + n(sym, 'height'))).toBe(true);
    for (const t of g.querySelectorAll<SVGTextElement>('text')) expect(inside(n(t, 'x') + textWidth(t.textContent!, 11, true), n(t, 'y'))).toBe(true);
    const x = n(sym, 'x') + n(sym, 'width') / 2;
    const volt = [...host.querySelectorAll<SVGTextElement>('g.tx text.m')].find((t) => / V$/.test(t.textContent ?? '') && n(t, 'x') === x - 8)!;
    expect(inside(n(volt, 'x') - textWidth(volt.textContent!, 11), n(volt, 'y') - 10)).toBe(true);
    const earth = host.querySelector('.earth-pit[data-board-id="MDB-7"]')!;
    const met = earth.querySelector('.met-bar')!;
    expect(inside(n(met, 'x1'), n(met, 'y1')) && inside(n(met, 'x2'), n(met, 'y1'))).toBe(true);
    for (const pit of earth.querySelectorAll<SVGRectElement>('.earth-electrode rect')) expect(n(pit, 'x') + n(pit, 'width')).toBeLessThan(x1);
    // The previous board's frame ends before this board's earth detail starts.
    const prev = board(host, 'MDB-6').querySelector<SVGRectElement>('.board-frame rect.frame-ln')!;
    const left = Math.min(...[...earth.querySelectorAll('text, rect')].filter((el) => !el.closest('.tx-earth')).map((el) => n(el, 'x')));
    expect(n(prev, 'x') + n(prev, 'width')).toBeLessThan(left);
    // Standard style draws no panel frames.
    expect(draw(project([root('MDB-6')], [], 'standard')).querySelector('.board-frame')).toBeNull();
  });

  it('lists its final circuits from the load schedule instead of "no outgoing ways"', () => {
    const f = (id: string, way: number): Feeder => ({ ...sampleProject.feeders[0], id, boardId: 'MDB-6', feedsBoardId: undefined, phase: 'R', way });
    const host = draw(project([root('MDB-6')], [f('C1', 1), f('C2', 2)]));
    const g = board(host, 'MDB-6');
    expect(texts(g)).not.toContain('NO OUTGOING WAYS');
    expect(g.querySelector('.sched text')!.textContent).toMatch(/^2 circuits/);
  });

  it('draws a DB with one way and a package panel with its control rows', () => {
    const host = draw(project([root('DB-1', { kind: 'DB' }), root('MCC-1', { kind: 'MCC' })]));
    expect(board(host, 'DB-1').querySelector('.board-sym > line:not([style])')).not.toBeNull();
    expect(board(host, 'DB-1').querySelector('.board-sym path')).toBeNull();
    expect(board(host, 'MCC-1').querySelector('.board-sym path')!.getAttribute('d')).toMatch(/H.*M.*H/);
  });

  it('keeps each transformer\'s LV earth detail by its own incomer, clear of the previous incomer\'s labels', () => {
    for (const style of ['dewa', 'standard'] as const) {
      const host = draw(project([root('MDB-6'), root('MDB-7'), root('MDB-8')], [], style));
      const xs = ['MDB-6', 'MDB-7', 'MDB-8'].map((id) => { const r = board(host, id).querySelector('.board-sym rect.box')!; return n(r, 'x') + n(r, 'width') / 2; });
      const devs = [...host.querySelectorAll<SVGTextElement>('text.dev')];
      for (let i = 1; i < 3; i++) {
        const earth = host.querySelector(`.earth-pit[data-board-id="MDB-${6 + i}"]`)!;
        const left = Math.min(...[...earth.querySelectorAll('text, rect, line')].filter((el) => !el.closest('.tx-earth'))
          .map((el) => n(el, el.tagName === 'line' ? 'x1' : 'x')));
        // Right of the previous incomer's device label and the text beside its board symbol...
        const dev = devs.find((t) => Math.abs(n(t, 'x') - 10 - xs[i - 1]) < 0.5)!;
        expect(left).toBeGreaterThan(n(dev, 'x') + textWidth(dev.textContent!, 11, true));
        // ...and nearer its own incomer than the previous one.
        expect(xs[i] - left).toBeLessThan(left - xs[i - 1]);
      }
    }
  });
});
