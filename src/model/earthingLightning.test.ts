import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import type { LpsInputs } from '../calc/lightningProtection';
import { buildBom } from '../calc/bom';
import { earthingDrawing } from '../diagram/earthingDrawing';
import type { Project } from '../types';
import { earthingLayout, earthLimitOhm, LP_EARTH_KEY, pitStatus, withEarthPitIds } from './earthingPlan';

const study: LpsInputs = { lengthM: 40, widthM: 25, heightM: 18, method: 'mesh', lpsClass: 'II', meshM: 10, downSpacingM: 10, earthPitPerDown: true };
const plain: Project = { ...sampleProject, earthingPlan: sampleProject.earthingPlan ?? {} };
const withLp = (l: Partial<LpsInputs> = {}): Project => ({ ...plain, lightning: { ...study, ...l } });
const lpPits = (p: Project) => earthingLayout(p).pits.filter((x) => x.kind === 'lp');
const svg = (p: Project) => (earthingDrawing(p) as unknown as { svg: string }).svg;

describe('earthing schematic — lightning protection earth', () => {
  it('a project with no study, or a study with no earth pits, is unchanged', () => {
    const base = earthingLayout(plain);
    expect(base.items.some((i) => i.kind === 'lp')).toBe(false);
    expect(earthingLayout(withLp({ earthPitPerDown: false })).items).toEqual(base.items);
    expect(earthingLayout(withLp({ meshM: undefined })).items).toEqual(base.items);
    expect(svg(plain)).toContain('LIGHTNING PROTECTION NOT SHOWN');
    expect(svg(plain)).not.toContain('EB-LP');
  });

  it('adds one pit for each down conductor, after every other pit, in the first substation\'s group', () => {
    const base = earthingLayout(plain), L = earthingLayout(withLp());
    expect(lpPits(withLp()).length).toBe(13);
    expect(L.pits.slice(0, base.pits.length).map((p) => p.id)).toEqual(base.pits.map((p) => p.id));
    const item = L.items.find((i) => i.key === LP_EARTH_KEY)!;
    expect(item.group).toBe(base.items[0].group);
    expect(new Set(L.items.map((i) => i.group)).size).toBe(new Set(base.items.map((i) => i.group)).size);
  });

  it('pit IDs stay with their pits when the study changes', () => {
    const a = withEarthPitIds(withLp());
    const ids = a.earthPitIds![LP_EARTH_KEY];
    const fewer = withEarthPitIds({ ...a, lightning: { ...study, downSpacingM: 30 } });
    expect(earthingLayout(fewer).pits.filter((p) => p.kind === 'lp').map((p) => p.id)).toEqual(ids.slice(0, 5));
  });

  it('has no built-in limit: the engineer\'s entry, or DATA REQUIRED', () => {
    expect(earthLimitOhm(withLp(), 'lp')).toBeUndefined();
    expect(earthLimitOhm(withLp({ earthLimitOhm: 10 }), 'lp')).toBe(10);
    expect(earthLimitOhm(plain, 'lv')).toBe(1);
    expect(earthingLayout(withLp()).checks.some((c) => c.level === 'bad' && /DATA REQUIRED — resistance limit/.test(c.text))).toBe(true);
    expect(earthingLayout(withLp({ earthLimitOhm: 10 })).checks.some((c) => /resistance limit/.test(c.text))).toBe(false);
    expect(lpPits(withLp())[0].limitOhm).toBeUndefined();
    expect(earthingLayout(plain).pits.every((p) => p.limitOhm !== undefined)).toBe(true);
  });

  it('measured pits pass or fail against the entered limit; with no limit they stay untested', () => {
    const ids = withEarthPitIds(withLp()).earthPitIds![LP_EARTH_KEY];
    const measured = Object.fromEntries(ids.map((id) => [id, 60]));
    const at = (l: Partial<LpsInputs>) => earthingLayout({ ...withLp(l), earthPitIds: withEarthPitIds(withLp()).earthPitIds, earthingPlan: { ...plain.earthingPlan, measured } });
    const ok = at({ earthLimitOhm: 10 }).nets.find((n) => n.kind === 'lp')!;
    expect(ok.effectiveOhm).toBeCloseTo(60 / 13, 6);
    expect(ok.ok).toBe(true);
    expect(at({ earthLimitOhm: 2 }).nets.find((n) => n.kind === 'lp')!.ok).toBe(false);
    const none = at({});
    expect(none.nets.find((n) => n.kind === 'lp')!.ok).toBeUndefined();
    expect(pitStatus(none.pits.find((p) => p.kind === 'lp')!)).toBe('untested');
    expect(pitStatus(at({ earthLimitOhm: 100 }).pits.find((p) => p.kind === 'lp')!)).toBe('pass');
  });

  it('says whether the lightning protection earth is bonded to the main earth bar', () => {
    expect(earthingLayout(withLp()).checks.some((c) => c.level === 'warn' && /not bonded to the main earth bar/.test(c.text))).toBe(true);
    expect(earthingLayout(withLp({ bondedToMet: true })).checks.some((c) => c.level === 'ok' && /bonded to the main earth bar/.test(c.text))).toBe(true);
  });

  it('drawing: its own zone, first and last pit of many, every pit in the schedule', () => {
    const s = svg(withLp({ earthLimitOhm: 10, bondedToMet: true }));
    expect(s).toContain('LIGHTNING PROTECTION SYSTEM');
    expect(s).toContain('EB-LP');
    expect(s).toContain('13 pits on the ring earth conductor');
    expect(s).toContain('bonded to MAIN EARTH BAR');
    expect(s).toContain('SHOWN AT CONCEPT STAGE');
    const ids = lpPits(withLp()).map((p) => p.id);
    expect(ids.filter((id) => s.includes(`data-pit="${id}"`))).toEqual([ids[0], ids[12]]);
    for (const n of ['EP-LP-01', 'EP-LP-07', 'EP-LP-13']) expect(s).toContain(n);
    expect(s).not.toMatch(/NaN|undefined/);
    expect(svg(withLp())).toContain('not bonded to the main earth bar');
    expect(svg(withLp())).toContain('Not entered');
  });

  it('drawing: three pits or fewer are all drawn and linked', () => {
    const p = withLp({ lengthM: 6, widthM: 4 });
    const ids = lpPits(p).map((x) => x.id), s = svg(p);
    expect(ids.length).toBe(2);
    expect(ids.every((id) => s.includes(`data-pit="${id}"`))).toBe(true);
    expect(s).not.toContain('pits on the ring earth conductor');
  });

  it('BOQ: the schematic\'s lightning pits are counted only through the study\'s own lines', () => {
    const pits = (p: Project) => buildBom(p).filter((x) => x.key.startsWith('earth-pit:')).map((x) => [x.key, x.qty]);
    expect(pits(withLp())).toEqual(pits(plain));
    expect(buildBom(withLp({ inBoq: true })).find((x) => x.key === 'lps:pit')?.qty).toBe(13);
  });
});
