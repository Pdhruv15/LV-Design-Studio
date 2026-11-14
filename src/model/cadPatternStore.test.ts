// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { keepComputerPatterns, loadComputerPatterns, saveComputerPatterns } from './cadPatternStore';
import { parsePat } from './cadHatch';

const { patterns } = parsePat('*MYGRID, Office grid\n0, 0,0, 0,5\n90, 0,0, 0,5\n*OTHER\n45, 0,0, 0,2');

describe('patterns kept on this computer', () => {
  beforeEach(() => localStorage.clear());

  it('keeps patterns for every project and reads them back; one of the same name is replaced', () => {
    expect(loadComputerPatterns()).toEqual([]);
    expect(keepComputerPatterns([patterns[0]])).toEqual([patterns[0]]);
    expect(keepComputerPatterns([patterns[1], { ...patterns[0], label: 'New' }]).map((c) => c.label)).toEqual([undefined, 'New']);
    expect(loadComputerPatterns().map((c) => c.name)).toEqual(['OTHER', 'MYGRID']);
  });

  it('leaves out what is not a valid pattern, caps the list at 500, and survives a storage that is refused or damaged', () => {
    localStorage.setItem('lvds.cadPatterns.computer', JSON.stringify([patterns[0], { name: 'bad name!', lines: [] }, 7]));
    expect(loadComputerPatterns()).toEqual([patterns[0]]);
    const many = Array.from({ length: 600 }, (_, i) => ({ ...patterns[0], name: `P${i}` }));
    expect(saveComputerPatterns(many)).toBe(true);
    expect(loadComputerPatterns()).toHaveLength(500);
    localStorage.setItem('lvds.cadPatterns.computer', '{not json');
    expect(loadComputerPatterns()).toEqual([]);
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full'); });
    expect(saveComputerPatterns([patterns[0]])).toBe(false);
    set.mockRestore();
  });
});
