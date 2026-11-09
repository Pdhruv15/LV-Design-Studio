// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleProject } from '../../data/sampleProject';
import { LegendSvg } from '../SystemDiagram';
import { RiserLegendSvg } from '../../diagram/RiserDiagram';
import { FeederRiserLegendSvg } from '../../diagram/FeederRiserDiagram';
import { dbRiserLegend } from '../../diagram/dbRiserDrawing';
import { dbRiserLayout } from '../../model/dbRiser';
import { legendPxFor } from '../../diagram/legendLayout';
import { legendEntries } from '../../diagram/IecSymbols';
import { sideInnerMm } from '../../docs/sldSheet';
import { RISER_SIDE_MM } from '../../model/drawingSet';

/** The sheets' legends are drawn for their column (92 mm, or 62 mm on a DB riser sheet), so their labels print at
 * 2.5 mm whatever the labels say; a long label takes two lines. */
const widthOf = (svg: string) => Number(svg.match(/data-w="([\d.]+)"/)?.[1]);
const labelsOf = (svg: string) => [...svg.matchAll(/<text[^>]*class="legend-t"[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);

describe('sheet legends at 2.5 mm', () => {
  it('the SLD legend is as wide as the column, not as its longest label, and long labels wrap', () => {
    const svg = renderToStaticMarkup(<LegendSvg project={sampleProject} widthMm={sideInnerMm()} />);
    expect(widthOf(svg)).toBeCloseTo(legendPxFor(88), 6);
    const labels = labelsOf(svg), entries = legendEntries(sampleProject);
    expect(labels.length).toBeGreaterThanOrEqual(entries.length);
    for (const l of labels) expect(l.length * 5.9).toBeLessThanOrEqual(legendPxFor(88) - 64 - 10);
    // Every label is there, whole, across its lines.
    const text = labels.join(' ');
    for (const e of entries) expect(text).toContain(e.label);
  });

  it('without a column width it is as wide as its longest label (nothing wraps)', () => {
    const svg = renderToStaticMarkup(<LegendSvg project={sampleProject} />);
    expect(labelsOf(svg)).toHaveLength(legendEntries(sampleProject).length);
  });

  it('the riser legends follow the column too', () => {
    const used = new Set(['tx', 'gen', 'ats', 'bus', 'p-db', 'p-mdb']);
    expect(widthOf(renderToStaticMarkup(<RiserLegendSvg used={used} widthMm={88} />))).toBeCloseTo(legendPxFor(88), 6);
    expect(widthOf(renderToStaticMarkup(<FeederRiserLegendSvg used={new Set(['panel', 'breaker', 'bus'])} widthMm={88} />))).toBeCloseTo(legendPxFor(88), 6);
    expect(widthOf(renderToStaticMarkup(<RiserLegendSvg used={used} />))).toBe(300); // the canvas legend as before
  });

  it('the DB riser legend is drawn for its 62 mm column at 10.5 px, so it prints at 2.5 mm (it was 2 mm)', () => {
    const L = dbRiserLayout(sampleProject, sampleProject.building?.buildings?.[0]?.id ?? '');
    const svg = dbRiserLegend(L, 0, sideInnerMm(RISER_SIDE_MM));
    if (L.empty) { expect(svg).toBe(''); return; }
    expect(widthOf(svg)).toBeCloseTo(legendPxFor(58), 6);
    expect(svg).toContain('font-size="10.5"');
  });
});
