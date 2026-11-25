import { describe, expect, it } from 'vitest';
import { detectRooms, MAX_SEEDS, roomLike, seedsOf } from './cadRoomDetect';

type Pt = [number, number];
const sq = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
// Two rooms side by side: a kitchen 0–4 × 0–4 and a bedroom 4–10 × 0–4.
const find = (at: Pt) => (at[1] < 0 || at[1] > 4 ? undefined : at[0] >= 0 && at[0] < 4 ? { points: sq(0, 0, 4, 4), area: 16 } : at[0] >= 4 && at[0] <= 10 ? { points: sq(4, 0, 10, 4), area: 24 } : undefined);

describe('detect rooms from walls (DETECTROOMS)', () => {
  it('room names are seeds; dimensions, levels, grid marks and long notes are not', () => {
    expect(['KITCHEN', 'Bed Room 2', 'WC-01'].map(roomLike)).toEqual([true, true, true]);
    expect(['3.50', '1200 mm', '12 m²', 'FFL +0.00', 'A1', '12', '', 'A very long general note about the finishes of the walls'].map(roomLike)).toEqual([false, false, false, false, false, false, false, false]);
  });

  it('seeds on room-name layers come first; at most MAX_SEEDS', () => {
    const s = seedsOf([{ x: 0, y: 0, s: 'LOBBY', layer: 'A-ANNO' }, { x: 1, y: 1, s: 'KITCHEN', layer: 'A-ROOM-NAME' }, { x: 2, y: 2, s: '3.50', layer: 'A-DIMS' }]);
    expect(s.seeds.map((x) => x.s)).toEqual(['KITCHEN', 'LOBBY']);
    expect(seedsOf(Array.from({ length: MAX_SEEDS + 5 }, (_, i) => ({ x: i, y: 0, s: `ROOM ${i}` }))).capped).toBe(true);
  });

  it('each room once, named by its first text; a second text in it and a seed outside every room are passed over', () => {
    const rooms = detectRooms([{ x: 2, y: 2, s: 'KITCHEN ' }, { x: 2, y: 1, s: '16 m2 store' }, { x: 7, y: 2, s: 'BEDROOM' }, { x: 20, y: 20, s: 'GARDEN' }], find);
    expect(rooms.map((r) => [r.name, r.area])).toEqual([['KITCHEN', 16], ['BEDROOM', 24]]);
    expect(detectRooms([{ x: 2, y: 2, s: 'KITCHEN' }], find, 20)).toEqual([]); // smaller than the least area
  });
});
