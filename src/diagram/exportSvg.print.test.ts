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

  it('prints muted lines black and way numbers solid black, keeping panel frames and muted texts grey', () => {
    document.documentElement.style.setProperty('--mut', 'rgb(1, 2, 3)');
    const muted = getComputedStyle(Object.assign(document.createElement('span'), { style: 'color: var(--mut)' })).color;
    document.body.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">
      <line class="ln" x2="10" style="stroke: ${muted}"/>
      <rect class="frame-ln" width="10" height="5" style="stroke: ${muted}; fill: none"/>
      <text class="acc-t way-no" style="fill: ${muted}; opacity: 0.8">4</text>
      <text class="acc-t" style="fill: ${muted}">36 kA</text></svg>`;
    const out = printableSvg(document.querySelector('svg')!, 100, 50);
    const doc = new DOMParser().parseFromString(out, 'image/svg+xml');
    expect(doc.querySelector('.ln')?.getAttribute('style')).toContain('stroke:#000000');
    expect(doc.querySelector('.frame-ln')?.getAttribute('style')).toContain('stroke:#444444');
    const way = doc.querySelector('.way-no')?.getAttribute('style');
    expect(way).toContain('fill:#000000');
    expect(way).toContain('opacity:1');
    expect(doc.querySelector('text:not(.way-no)')?.getAttribute('style')).toContain('fill:#444444');
    document.documentElement.style.removeProperty('--mut');
  });
});
