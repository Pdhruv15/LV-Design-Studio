import { describe, expect, it } from 'vitest';
import { LEGEND_FOOT, LEGEND_GAP, LEGEND_HEAD, LEGEND_LINE, LEGEND_PX_PER_MM, LEGEND_SHEET_ROW, legendHeightMm, legendLineY, legendPxFor, legendRows, plainNotes, stringLegendSvg, stripColumns, wrapLabel } from './legendLayout';

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

describe('legend text height', () => {
  it('a 3.5 mm legend is drawn at 3 px per mm, so the same 10.5 px labels print taller', () => {
    expect(legendPxFor(88, 3.5)).toBeCloseTo(264, 6);
    expect(legendPxFor(88, 2.5)).toBeCloseTo(legendPxFor(88), 6);
  });
});

describe('legend columns and strips', () => {
  const labels = Array.from({ length: 10 }, (_, i) => ({ label: `Entry ${i + 1}` }));
  it('two columns share the entries evenly and halve the height; the second column starts after the gap', () => {
    const one = legendRows(labels, legendPxFor(180), 64, 1), two = legendRows(labels, legendPxFor(180), 64, 2);
    expect(one.rows.every((r) => r.x === 0)).toBe(true);
    expect(two.rows.filter((r) => r.x === 0)).toHaveLength(5);
    expect(two.rows.filter((r) => r.x > 0)).toHaveLength(5);
    expect(two.rows[5].x).toBeCloseTo((legendPxFor(180) - LEGEND_GAP) / 2 + LEGEND_GAP, 6);
    expect(two.h).toBe(LEGEND_HEAD + 5 * LEGEND_SHEET_ROW + LEGEND_FOOT);
    expect(one.h).toBe(LEGEND_HEAD + 10 * LEGEND_SHEET_ROW + LEGEND_FOOT);
  });
  it('knows a legend\'s printed height without drawing it, and how many columns a strip takes', () => {
    expect(legendHeightMm(labels.map((l) => l.label), 88)).toBeCloseTo((LEGEND_HEAD + 10 * LEGEND_SHEET_ROW + LEGEND_FOOT) / 4.2, 6);
    expect(legendHeightMm(labels.map((l) => l.label), 88, 3.5)).toBeCloseTo((LEGEND_HEAD + 10 * LEGEND_SHEET_ROW + LEGEND_FOOT) / 3, 6);
    expect(legendHeightMm([], 88)).toBe(0);
    expect(stripColumns(420 - 30 - 92 - 4)).toBe(3); // A3 beside the column
    expect(stripColumns(841 - 30 - 92 - 4)).toBe(7); // A1
  });
});

describe('string legends and drawing notes', () => {
  it('draws string items as the SLD legend is drawn: the column\'s width, 10.5 px labels, the rows of the layout', () => {
    const items = [{ key: 'a', label: 'Transformer', draw: (x: number, y: number) => `<circle cx="${x}" cy="${y}" r="5"/>` }, { key: 'b', label: 'A tall symbol', draw: () => '<g/>', h: 70 }];
    const svg = stringLegendSvg(items, 88);
    expect(svg).toContain(`data-w="${legendPxFor(88)}"`);
    expect(svg).toContain(`data-h="${LEGEND_HEAD + LEGEND_SHEET_ROW + 70 + LEGEND_FOOT}"`); // the tall row keeps its 70 px
    expect(svg).toContain('font-size="10.5"');
    expect(svg).toContain(`<circle cx="34" cy="${LEGEND_HEAD + 17}" r="5"/>`);
    expect(svg).toContain('>Transformer</text>');
    expect(stringLegendSvg([], 88)).toBe('');
  });
  it('hands drawing notes to the sheet without their heading and numbering', () => {
    expect(plainNotes(['NOTES', '1. FIRST.', '2. SECOND.', '', 'NOT SHOWN: X.'])).toEqual(['FIRST.', 'SECOND.', 'NOT SHOWN: X.']);
  });
});
