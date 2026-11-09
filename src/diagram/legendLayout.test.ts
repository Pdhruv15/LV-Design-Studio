import { describe, expect, it } from 'vitest';
import { LEGEND_FOOT, LEGEND_HEAD, LEGEND_LINE, LEGEND_PX_PER_MM, LEGEND_SHEET_ROW, legendLineY, legendPxFor, legendRows, wrapLabel } from './legendLayout';

/** A sheet legend is drawn for its column's width, so its 10.5 px labels print at 2.5 mm, and labels wrap instead of
 * the legend shrinking to fit the longest one. */
describe('legend layout', () => {
  it('draws 4.2 px per mm of the column: 10.5 px labels print at 2.5 mm', () => {
    expect(LEGEND_PX_PER_MM).toBeCloseTo(4.2, 6);
    expect(legendPxFor(88)).toBeCloseTo(369.6, 6); // the 92 mm column less 2 mm padding each side
    expect(legendPxFor(58)).toBeCloseTo(243.6, 6); // a DB riser's 62 mm column
  });

  it('wraps a label at spaces so no line is wider than the room, and never splits a word', () => {
    const lines = wrapLabel('Earth leakage protection (RCD / ELR toroid), device named beside it', 296);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(l.length * 5.9).toBeLessThanOrEqual(296);
    expect(lines.join(' ')).toBe('Earth leakage protection (RCD / ELR toroid), device named beside it');
    expect(wrapLabel('Busbar', 296)).toEqual(['Busbar']);
    expect(wrapLabel('Supercalifragilistic', 20)).toEqual(['Supercalifragilistic']);
  });

  it('gives every entry a row, taller by a line for each wrapped line, and the legend its height', () => {
    const entries = [{ label: 'Busbar' }, { label: 'Earth leakage protection (RCD / ELR toroid), device named beside it' }, { label: 'Transformer' }];
    const { rows, h } = legendRows(entries, legendPxFor(88), 64);
    expect(rows.map((r) => r.lines.length)).toEqual([1, 2, 1]);
    expect(rows[0].y).toBe(LEGEND_HEAD + 17);
    expect(rows[1].y).toBe(LEGEND_HEAD + LEGEND_SHEET_ROW + 17 + LEGEND_LINE / 2); // centred on its two lines
    expect(rows[2].y).toBe(LEGEND_HEAD + 2 * LEGEND_SHEET_ROW + LEGEND_LINE + 17);
    expect(h).toBe(LEGEND_HEAD + 3 * LEGEND_SHEET_ROW + LEGEND_LINE + LEGEND_FOOT);
    // The two lines sit a line apart, either side of the symbol's centre.
    expect(legendLineY(rows[1].y, 2, 1) - legendLineY(rows[1].y, 2, 0)).toBe(LEGEND_LINE);
    expect((legendLineY(rows[1].y, 2, 0) + legendLineY(rows[1].y, 2, 1)) / 2).toBe(rows[1].y + 4);
  });

  it('with a generous width nothing wraps (the design canvas legend)', () => {
    const { rows } = legendRows([{ label: 'Earth leakage protection (RCD / ELR toroid), device named beside it' }], 1000, 64);
    expect(rows[0].lines).toHaveLength(1);
  });
});
