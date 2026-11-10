// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { printableSvg } from './exportSvg';

describe('printed SLD colours', () => {
  vi.stubGlobal('SVGTextElement', class {}); // not in jsdom

  it('prints revision clouds and cable references black, other colours as mapped', () => {
    document.body.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">
      <g class="rev-cloud"><path d="M0 0 H10" style="stroke: rgb(255, 93, 108)"/></g>
      <circle class="cable-ref-c" r="7" style="stroke: rgb(255, 93, 108)"/>
      <line class="other" x2="10" style="stroke: rgb(1, 2, 3)"/></svg>`;
    const out = printableSvg(document.querySelector('svg')!, 100, 50);
    const doc = new DOMParser().parseFromString(out, 'image/svg+xml');
    expect(doc.querySelector('.rev-cloud path')?.getAttribute('style')).toContain('stroke:#000000');
    expect(doc.querySelector('.cable-ref-c')?.getAttribute('style')).toContain('stroke:#000000');
    expect(doc.querySelector('.other')?.getAttribute('style')).toContain('stroke:rgb(1, 2, 3)');
  });

  it('drops the check-status dots and prints failing circuits black', () => {
    document.body.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">
      <circle class="status-dot" r="4" style="fill: rgb(46, 204, 113)"/>
      <line class="ln bad" x2="10" style="stroke: rgb(255, 93, 108)"/>
      <circle class="load warn" r="18" style="stroke: rgb(255, 180, 0); fill: rgb(255, 255, 255)"/>
      <g class="icon bad"><path d="M0 0 H5" style="stroke: rgb(255, 93, 108); fill: rgb(255, 93, 108)"/></g></svg>`;
    const out = printableSvg(document.querySelector('svg')!, 100, 50);
    const doc = new DOMParser().parseFromString(out, 'image/svg+xml');
    expect(doc.querySelector('.status-dot')).toBeNull();
    expect(doc.querySelector('.ln')?.getAttribute('style')).toContain('stroke:#000000');
    expect(doc.querySelector('.load')?.getAttribute('style')).toContain('stroke:#000000');
    expect(doc.querySelector('.icon path')?.getAttribute('style')).toMatch(/stroke:#000000.*fill:#000000/);
  });

  it('prints study colouring black, heavy only over the limit', () => {
    document.body.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">
      <line class="ln heat ok-feeder" x2="10" style="stroke: hsl(130 80% 52%); stroke-width: 3.5px"/>
      <line class="ln heat heat-over over-feeder" x2="10" style="stroke: hsl(0 80% 58%); stroke-width: 3.5px"/>
      <line class="bus heat heat-over" x2="10" style="stroke: hsl(0 80% 58%)"/></svg>`;
    const live = document.querySelector('.ok-feeder') as SVGElement;
    const out = printableSvg(document.querySelector('svg')!, 100, 50);
    const doc = new DOMParser().parseFromString(out, 'image/svg+xml');
    const style = (sel: string) => doc.querySelector(sel)?.getAttribute('style') ?? '';
    expect(style('.ok-feeder')).toContain('stroke:#000000');
    expect(style('.ok-feeder')).not.toContain('stroke-width:3.5px');
    expect(live.style.strokeWidth).toBe('3.5px'); // the screen keeps its thick line
    expect(style('.over-feeder')).toMatch(/stroke:#000000.*stroke-width:3.5px/);
    expect(style('.bus')).toMatch(/stroke:#000000.*stroke-width:7px/);
  });
});
