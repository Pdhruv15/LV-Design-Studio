import { describe, expect, it } from 'vitest';
import { circuitRoom, nextWithRoom, pointMax, suits } from './circuitRoom';
import type { Feeder } from '../types';

const f = (id: string, boardId: string, points: Feeder['points'] = {}) => ({ id, boardId, name: id, points }) as Feeder;

describe('how full a circuit is', () => {
  it('knows the most points per circuit from the Rules sheet', () => {
    expect(pointMax('ltg')).toBe(10);
    expect(pointMax('s13')).toBe(6);
    expect(pointMax('sac')).toBeUndefined();
    expect(pointMax(undefined)).toBeUndefined();
  });

  it('shows the room against the type being placed, else the type the circuit carries', () => {
    expect(circuitRoom(f('a', 'B', { ltg: 7 }), 'ltg')).toMatchObject({ type: 'ltg', n: 7, max: 10, full: false, text: '7 / 10' });
    expect(circuitRoom(f('a', 'B', { ltg: 10 }), 'ltg')).toMatchObject({ full: true, text: '10 / 10' });
    expect(circuitRoom(f('a', 'B', { s13: 4 }), 'ltg')).toMatchObject({ type: 's13', n: 4, max: 6, text: '4 / 6' });
    expect(circuitRoom(f('a', 'B'), 'ltg').text).toBe('0 / 10');
    expect(circuitRoom(f('a', 'B'), 'sac').text).toBe('empty');
    expect(circuitRoom(f('a', 'B', { sac: 2 })).text).toBe('2 pts');
    expect(circuitRoom(f('a', 'B', { sac: 1 })).text).toBe('1 pt');
  });

  it('says which circuits suit a point type', () => {
    expect(suits(f('a', 'B', { ltg: 2 }), 'ltg')).toBe(true);
    expect(suits(f('a', 'B'), 'ltg')).toBe(true);
    expect(suits(f('a', 'B', { s13: 2 }), 'ltg')).toBe(false);
  });
});

describe('the next circuit with room', () => {
  const a1 = f('A1', 'A', { ltg: 10 }), a2 = f('A2', 'A', { ltg: 10 }), a3 = f('A3', 'A', { s13: 3 }), a4 = f('A4', 'A', { ltg: 4 });
  const b1 = f('B1', 'B', { ltg: 2 });
  it('is none while the circuit has room, or when the type has no limit', () => {
    expect(nextWithRoom([a1, a4], a4, 'ltg')).toBeUndefined();
    expect(nextWithRoom([a1, a4], a1, 'sac')).toBeUndefined();
    expect(nextWithRoom([a1, a4], undefined, 'ltg')).toBeUndefined();
  });
  it('takes the next suiting circuit after it on the board, skipping full and socket circuits', () => {
    expect(nextWithRoom([a1, a2, a3, a4, b1], a1, 'ltg')).toBe(a4);
  });
  it('wraps to the ways before it, then to another board', () => {
    expect(nextWithRoom([a4, a1, b1], a1, 'ltg')).toBe(a4);
    expect(nextWithRoom([a1, a2, a3, b1], a1, 'ltg')).toBe(b1);
  });
});
