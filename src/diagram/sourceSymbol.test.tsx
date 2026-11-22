// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SOURCE_KINDS } from '../types';
import { SourceSym, sourceSymSvg } from './sourceSymbol';
import { supplyPoint } from './supplyPoint';
import { sampleProject } from '../data/sampleProject';

const draw = (kind: Parameters<typeof SourceSym>[0]['kind']) => { const h = document.createElement('div'); h.innerHTML = `<svg>${renderToStaticMarkup(<SourceSym kind={kind} x={100} y={50} />)}</svg>`; return h; };

describe('source symbols', () => {
  it('every kind has a drawing on screen and in print, centred where asked', () => {
    for (const { value } of SOURCE_KINDS) {
      expect(draw(value).querySelector('circle,rect,path')).not.toBeNull();
      expect(sourceSymSvg(value, 100, 50)).toContain('translate(100 50)');
    }
  });
  it('utility is the sine in a circle; generator and wind carry a G; pv and battery are the converter square', () => {
    expect(draw('utility').querySelector('circle')?.getAttribute('r')).toBe('11');
    expect(draw('utility').querySelector('path')?.getAttribute('d')).toBe('M-5 0 q2.5 -6 5 0 t5 0');
    expect(draw('generator').querySelector('text')?.textContent).toBe('G');
    expect(draw('wind').querySelector('text')?.textContent).toBe('G');
    expect(draw('pv').querySelector('rect')?.getAttribute('width')).toBe('22');
    expect(draw('battery').querySelector('rect')).not.toBeNull();
    expect(draw('other').querySelectorAll('path,text')).toHaveLength(0);
  });
  it('an unknown kind is drawn as a utility by supplyPoint (no throw)', () => {
    expect(supplyPoint(sampleProject, { id: 'M', name: 'M', kind: 'MDB', supply: { kind: 'solar' as never } }, false)?.kind).toBe('utility');
  });
  it('pv: two light arrows outside the upper-left corner, the highest point at y = -19', () => {
    const arrows = [...draw('pv').querySelectorAll('path[style*="stroke-width"]')].map((p) => p.getAttribute('d') ?? '');
    expect(arrows).toHaveLength(2);
    expect(arrows[1]).toContain('-19');
  });
});
