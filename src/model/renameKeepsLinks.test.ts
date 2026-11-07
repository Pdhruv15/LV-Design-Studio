import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import type { Project } from '../types';
import { renamePanels } from './renamePanels';

/** A project where one panel and one of its circuits are linked on a floor plan. */
function linked(): { p: Project; board: string; feeder: string } {
  const p0 = sampleProject as Project;
  const f = p0.feeders.find((x) => x.id.startsWith(`${x.boardId}-`))!;
  const p: Project = {
    ...p0,
    cadPlanLinks: [{ file: 'L1.dwg', routes: { '2A': f.id, '2B': 'other' }, trays: { '3C': 'T1' }, places: { [f.boardId]: { handle: '4D', x: 1, y: 2 } } }],
    cadWiring: [{ feederId: f.id }]
  };
  return { p, board: f.boardId, feeder: f.id };
}

describe('renaming a panel keeps what is linked to it on the floor plan', () => {
  it('cable routes follow the renamed circuit and placed boards follow the renamed panel', () => {
    const { p, board, feeder } = linked();
    const r = renamePanels(p, [{ from: board, to: 'DB-NEW' }]);
    const newFeeder = `DB-NEW${feeder.slice(board.length)}`;
    expect(r.feeders.some((x) => x.id === newFeeder)).toBe(true);
    const links = r.cadPlanLinks![0];
    expect(links.routes).toEqual({ '2A': newFeeder, '2B': 'other' });
    expect(links.trays).toEqual({ '3C': 'T1' });
    expect(links.places).toEqual({ 'DB-NEW': { handle: '4D', x: 1, y: 2 } });
    expect(r.cadWiring).toEqual([{ feederId: newFeeder }]);
  });

  it('no live part of the project still names the old panel', () => {
    const { p, board } = linked();
    const { revisions: _r, ...live } = renamePanels(p, [{ from: board, to: 'DB-NEW' }]);
    const text = JSON.stringify(live);
    expect(text.includes(`"${board}"`)).toBe(false);
  });
});
