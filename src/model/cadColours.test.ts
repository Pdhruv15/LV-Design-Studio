import { describe, expect, it } from 'vitest';
import { colourIndex, colourLabel, INDEX_COLOURS, indexColour, parseColour, colourCss } from './cadColours';
import { effective } from './cadLayerStyle';

describe('Design CAD colours: index colours 1–255 and true colours', () => {
  it('has a screen colour for every index 1–255', () => {
    expect(INDEX_COLOURS.slice(1).every((c) => /^#[0-9a-f]{6}$/.test(c))).toBe(true);
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => INDEX_COLOURS[n])).toEqual(['#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ffffff', '#808080', '#c0c0c0']);
    // 10–249: hue groups of ten, full then half saturation, five shades.
    expect([10, 11, 12, 14, 20, 250, 255].map((n) => INDEX_COLOURS[n])).toEqual(['#ff0000', '#ff8080', '#a50000', '#7f0000', '#ff4000', '#333333', '#ffffff']);
  });

  it('keeps an index as its number and draws it with its screen colour', () => {
    expect(indexColour(8)).toBe('idx:8');
    expect(colourIndex('idx:8')).toBe(8);
    expect(colourIndex('idx:0')).toBeUndefined();
    expect(colourIndex('idx:256')).toBeUndefined();
    expect(colourCss('idx:9')).toBe('#c0c0c0');
    expect(colourCss('#FF3B30')).toBe('#ff3b30');
    expect(colourCss('')).toBeUndefined();
    expect(colourCss('red')).toBeUndefined();
  });

  it('names colours the way the engineer reads them', () => {
    expect(colourLabel('idx:8')).toBe('Grey (8)');
    expect(colourLabel('idx:130')).toBe('Colour 130');
    expect(colourLabel('#ff3b30')).toBe('Red');
    expect(colourLabel('#12ab34')).toBe('RGB 18,171,52');
    expect(colourLabel(undefined, 'As drawn')).toBe('As drawn');
  });

  it('reads a typed index, hex or r,g,b', () => {
    expect(parseColour('8')).toBe('idx:8');
    expect(parseColour('colour 9')).toBe('idx:9');
    expect(parseColour('255')).toBe('idx:255');
    expect(parseColour('0')).toBeUndefined();
    expect(parseColour('300')).toBeUndefined();
    expect(parseColour('#AbC')).toBe('#aabbcc');
    expect(parseColour('12ab34')).toBe('#12ab34');
    expect(parseColour('18, 171, 52')).toBe('#12ab34');
    expect(parseColour('rgb(1,2,3)')).toBe('#010203');
    expect(parseColour('256,0,0')).toBeUndefined();
    expect(parseColour('blue-ish')).toBeUndefined();
  });

  it('an object or layer with an index colour draws with that colour', () => {
    const line = { id: 'a', kind: 'line' as const, layer: 'L1', pts: [[0, 0], [1, 1]] as [number, number][] };
    expect(effective(line, { L1: { color: 'idx:8' } }).color).toBe('#808080');
    expect(effective({ ...line, color: 'idx:1' }, { L1: { color: 'idx:8' } }).color).toBe('#ff0000');
  });
});
