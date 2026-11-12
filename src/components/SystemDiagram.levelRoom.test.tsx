// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import SystemDiagram from './SystemDiagram';
import { sampleProject } from '../data/sampleProject';
import { DEFAULT_LAYERS, SHEET_LAYERS, type ResultLayers } from '../diagram/annotations';
import type { Board, Feeder, Project } from '../types';

const noop = () => {};
const draw = (project: Project, layers: ResultLayers | undefined, screen = true) => {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(
    <SystemDiagram project={project} calcProject={project} results={[]} layers={layers} lod={screen}
      selectedFeederId={null} selectedBoardId={null} onSelectFeeder={noop} onSelectBoard={noop} onDrawing={noop} />
  );
  return host;
};
const on: ResultLayers = { ...DEFAULT_LAYERS, location: true };
const root = (id: string, extra: Partial<Board> = {}): Board => ({ id, name: id, kind: 'MDB', sourceKva: 1500, sourceImpedancePct: 6, ratedCurrentA: 2500, incomerDevice: 'MCCB-NA', ...extra });
const sub = (id: string, extra: Partial<Board> = {}): Board => ({ id, name: id, kind: 'DB', upstreamId: 'MDB-6', ratedCurrentA: 160, ...extra });
const feeder = (id: string, boardId: string, feedsBoardId?: string): Feeder => ({ ...sampleProject.feeders[0], id, boardId, feedsBoardId, name: id });
const project = (boards: Board[], feeders: Feeder[] = [], style: 'dewa' | 'standard' = 'dewa'): Project => ({
  ...sampleProject, boards, feeders, ties: [], earthingPlan: {}, earthPitIds: undefined, drawing: { ...sampleProject.drawing, sldStyle: style },
  building: { buildings: [{ id: 'V', name: 'Villa', levels: [{ id: 'L2', name: 'Level 2', kind: 'typical', heightM: 3 }] }], rooms: [] }
});
const placed: Partial<Board> = { level: { building: 'V', level: 'L2' }, location: 'Elec. room 2.01' };
const board = (host: HTMLElement, id: string) => host.querySelector<SVGGElement>(`g.bd[data-lv-id="board:${id}"]`)!;
const texts = (g: Element) => [...g.querySelectorAll('text')].map((t) => t.textContent);

describe('Level and room under a board\'s name', () => {
  for (const style of ['dewa', 'standard'] as const) {
    it(`a board with no outgoing ways shows it under its kind only with the tick on (${style})`, () => {
      const p = project([root('MDB-6', placed)], [], style);
      expect(texts(board(draw(p, on), 'MDB-6'))).toContain('Level 2 · Elec. room 2.01');
      expect(texts(board(draw(p, DEFAULT_LAYERS), 'MDB-6'))).not.toContain('Level 2 · Elec. room 2.01');
      // Off, the drawing is the one it always was.
      expect(draw(p, { ...DEFAULT_LAYERS, location: false }).innerHTML).toBe(draw(p, DEFAULT_LAYERS).innerHTML);
      expect(draw(p, SHEET_LAYERS).innerHTML).toBe(draw(p, { ...SHEET_LAYERS, location: undefined }).innerHTML);
    });
  }

  it('a standard-style board with outgoing ways shows it beside its box, same style as its kind', () => {
    const p = project([root('MDB-6', placed), sub('DB-1')], [feeder('F1', 'MDB-6', 'DB-1'), feeder('F2', 'MDB-6'), feeder('F3', 'MDB-6'), feeder('F4', 'MDB-6')], 'standard');
    const g = board(draw(p, on), 'MDB-6');
    const line = [...g.querySelectorAll('text')].find((t) => t.textContent === 'Level 2 · Elec. room 2.01')!;
    expect(line.getAttribute('class')).toBe('m');
    expect(texts(board(draw(p, DEFAULT_LAYERS), 'MDB-6'))).not.toContain('Level 2 · Elec. room 2.01');
  });

  it('a DB drawn as one box shows it under its summary, and its tags move down a line', () => {
    const p = project([root('MDB-6'), sub('DB-1', placed), sub('DB-2')], [feeder('F1', 'MDB-6', 'DB-1'), feeder('F2', 'MDB-6', 'DB-2')], 'standard');
    const host = draw(p, on);
    const lines = [...host.querySelectorAll('text.m')].map((t) => t.textContent);
    expect(lines).toContain('Level 2 · Elec. room 2.01');
    expect(lines).toContain('Not on a plan');
    expect(draw(p, on, false).innerHTML).not.toContain('Not on a plan');
    expect(draw(p, { ...DEFAULT_LAYERS, location: false }).innerHTML).toBe(draw(p, DEFAULT_LAYERS).innerHTML);
  });

  it('writes the level alone or the room alone when only one is set', () => {
    expect(texts(board(draw(project([root('MDB-6', { location: 'Plant room' })]), on), 'MDB-6'))).toContain('Plant room');
    expect(texts(board(draw(project([root('MDB-6', { level: placed.level })]), on), 'MDB-6'))).toContain('Level 2');
  });

  it('a board with neither says "Not on a plan" on the screen, and nothing on a sheet or export', () => {
    const p = project([root('MDB-6')]);
    expect(texts(board(draw(p, on), 'MDB-6'))).toContain('Not on a plan');
    expect(texts(board(draw(p, on, false), 'MDB-6'))).not.toContain('Not on a plan');
    expect(draw(p, on, false).innerHTML).toBe(draw(p, DEFAULT_LAYERS, false).innerHTML);
  });

  it('pushes the board\'s tags down a line rather than over them', () => {
    const p = project([root('MDB-6', placed)]);
    const y = (host: HTMLElement) => Number([...board(host, 'MDB-6').querySelectorAll('text.res')].find((t) => t.textContent === 'NO OUTGOING WAYS')!.getAttribute('y'));
    expect(y(draw(p, on)) - y(draw(p, DEFAULT_LAYERS))).toBe(13);
  });
});
