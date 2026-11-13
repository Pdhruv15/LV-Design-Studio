import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import type { LpsInputs } from './lightningProtection';
import { buildBom } from './bom';

const lightning: LpsInputs = { lengthM: 40, widthM: 25, heightM: 18, method: 'mesh', lpsClass: 'II', meshM: 10, downSpacingM: 10, earthPitPerDown: true };
const lps = (p: Parameters<typeof buildBom>[0]) => buildBom(p).filter((x) => x.key.startsWith('lps:'));

describe('BOQ — lightning protection quantities', () => {
  it('are not in the BOQ unless the engineer chooses', () => {
    expect(lps({ ...sampleProject, lightning })).toEqual([]);
    expect(buildBom({ ...sampleProject, lightning })).toEqual(buildBom(sampleProject));
  });

  it('go with the earthing items, marked as from the study', () => {
    const items = lps({ ...sampleProject, lightning: { ...lightning, inBoq: true } });
    expect(items.map((x) => [x.key, x.qty, x.unit])).toEqual(expect.arrayContaining([['lps:roof', 285, 'm'], ['lps:down', 234, 'm'], ['lps:joint', 13, 'no'], ['lps:pit', 13, 'no'], ['lps:ring', 130, 'm']]));
    expect(items.length).toBe(5);
    expect(items.every((x) => x.section === 'I' && x.quantitySource === 'Lightning protection study')).toBe(true);
  });

  it('leave the earthing schematic\'s own pits as they are', () => {
    const pits = (p: Parameters<typeof buildBom>[0]) => buildBom(p).filter((x) => x.key.startsWith('earth-pit:')).map((x) => [x.key, x.qty]);
    expect(pits({ ...sampleProject, lightning: { ...lightning, inBoq: true } })).toEqual(pits(sampleProject));
  });

  it('a study with data missing adds nothing', () => {
    expect(lps({ ...sampleProject, lightning: { ...lightning, inBoq: true, meshM: undefined } })).toEqual([]);
  });
});
