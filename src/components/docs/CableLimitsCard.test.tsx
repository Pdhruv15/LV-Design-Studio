import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Feeder, Project } from '../../types';
import {
  DEWA_LIMITS, changedRowCount, cableLimitsOf, dewaTableFor, DEWA_TABLE3, isLimitRemark, limitIssues, normaliseLimits, rowOrigin, tableFor, type CableLimitSet
} from '../../calc/authorityLimits';
import { evaluateFeeder } from '../../calc/electrical';
import { recommend } from '../../calc/sizing';
import {
  BUILT_IN_REFERENCES, applyReference, baseLimitsOf, duplicateReference, limitsChange, newReference, normaliseReference, referenceIssues, resolveReference, saveReference, type DesignReference
} from '../../model/designReference';
import { CableLimitsCard } from './CableLimitsCard';

const project = (feeders: Feeder[], extra: Partial<Project> = {}): Project => ({
  name: 'T', voltageV: 415, frequencyHz: 50, ambientC: 45, vdLimitPct: 4, updatedAt: '',
  boards: [{ id: 'MDB', name: 'M', sourceKva: 1000, sourceImpedancePct: 5 }], feeders, ...extra
});
const feeder = (o: Partial<Feeder>): Feeder => ({
  id: 'F', boardId: 'MDB', name: 'Load', loadKw: 40, demandFactor: 1, powerFactor: 0.85, lengthM: 20,
  cableCsaMm2: 16, cores: 4, breakerRatingA: 80, breakerIcuKa: 50, ...o
});
const DEWA = BUILT_IN_REFERENCES.find((r) => r.id === 'builtin-dewa')!;
const IEC = BUILT_IN_REFERENCES.find((r) => r.id === 'builtin-iec')!;
/** DEWA with 25 mm² on Table 3 cut from 80 A to 63 A. */
const company = (mode: CableLimitSet['mode'] = 'size-up'): DesignReference => {
  const r = duplicateReference(DEWA, 'Company DEWA');
  const t3 = r.cableLimits!.tables.find((t) => t.id === 'dewa-t3')!;
  t3.rows = t3.rows.map((x) => (x.csaMm2 === 25 ? { ...x, maxBreakerA: 63, maxLoadA: 63 } : x));
  r.cableLimits!.mode = mode;
  return r;
};
const list = (...refs: DesignReference[]) => [...BUILT_IN_REFERENCES, ...refs];

describe('cable / breaker limits on design references', () => {
  it('built-in DEWA carries Tables 1–3; IEC has none; a reference built on DEWA inherits them', () => {
    expect(resolveReference(DEWA, list()).cableLimits).toBe(DEWA_LIMITS);
    expect(resolveReference(IEC, list()).cableLimits).toBeUndefined();
    const layered = { ...newReference('Mine'), extends: 'builtin-dewa' };
    const r = resolveReference(layered, list(layered));
    expect(r.cableLimits).toBe(DEWA_LIMITS);
    expect(r.limitsFrom).toBe('DEWA (Dubai)');
    expect(baseLimitsOf(layered, list(layered)).limits).toBe(DEWA_LIMITS);
  });

  it('a duplicate is an editable copy; changed rows are counted against DEWA', () => {
    const r = company();
    expect(r.cableLimits).not.toBe(DEWA_LIMITS);
    const base = baseLimitsOf(r, list(r)).limits!;
    expect(changedRowCount(r.cableLimits!, base)).toBe(1);
    const t3 = r.cableLimits!.tables.find((t) => t.id === 'dewa-t3')!;
    expect(rowOrigin(base, 'dewa-t3', t3.rows[2])).toEqual({ kind: 'changed', was: { csaMm2: 25, maxBreakerA: 80, maxLoadA: 80 } });
    expect(rowOrigin(base, 'dewa-t3', t3.rows[0]).kind).toBe('base');
    expect(rowOrigin(base, 'dewa-t3', { csaMm2: 400, maxBreakerA: 450, maxLoadA: 450 }).kind).toBe('new');
  });

  it('applying copies the limits into the project, rows sorted, and the calculation uses them', () => {
    const r = company();
    r.cableLimits!.tables[3].rows.reverse();
    const f = feeder({ loadKw: 30, breakerRatingA: 80, cableCsaMm2: 25 });
    const before = project([f]);
    expect(evaluateFeeder(before, f).limits?.status).toBe('ok'); // DEWA: 25 mm² up to 80 A
    expect(limitsChange(before, r, list(r))).toBe(true);
    const p = applyReference(before, r, '2026-11-11', list(r));
    expect(p.designReference?.cableLimits?.tables[3].rows.map((x) => x.csaMm2)).toEqual([10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300]);
    expect(evaluateFeeder(p, f).limits).toMatchObject({ status: 'bad', message: 'DEWA Table 3: 80 A breaker on 25 mm² (max 63 A)' });
    expect(recommend(p, f, 'fix').cableCsaMm2).toBe(35);
    expect(limitsChange(p, r, list(r))).toBe(false);
  });

  it('warn only flags the check but leaves the sizing to the calculation; off removes the limits', () => {
    const f = feeder({ loadKw: 40, breakerRatingA: 100, cableCsaMm2: 16 });
    const warn = applyReference(project([f]), company('warn'), '', list());
    expect(recommend(warn, f, 'fix').cableCsaMm2).toBe(25);
    expect(recommend(warn, f, 'fix').remarks).toBeUndefined();
    expect(evaluateFeeder(warn, { ...f, cableCsaMm2: 25 }).limits).toMatchObject({ status: 'bad' });
    const off = applyReference(project([f]), company('off'), '', list());
    expect(cableLimitsOf(off)).toBeUndefined();
    expect(evaluateFeeder(off, { ...f, cableCsaMm2: 25 }).limits).toBeUndefined();
  });

  it('projects that applied DEWA before the limits were stored keep the built-in tables', () => {
    const p = project([], { designReference: { id: 'builtin-dewa', name: 'DEWA (Dubai)', version: 1, appliedAt: '', values: {} } });
    expect(cableLimitsOf(p)).toBe(DEWA_LIMITS);
    expect(cableLimitsOf(applyReference(p, IEC, '', list()))).toBeUndefined();
  });

  it('a table of your own works by its name and cable types, and its remarks are recognised', () => {
    const limits: CableLimitSet = { name: 'ADDC', mode: 'size-up', dbFeederMin: { csaMm2: 0, breakerA: 0 }, tables: [{ id: 'a', label: 'ADDC Table A', cableTypes: ['XLPE/PVC/SWA'], rows: [{ csaMm2: 16, maxBreakerA: 63, maxLoadA: 63 }, { csaMm2: 25, maxBreakerA: 80, maxLoadA: 80 }] }] };
    const ref = { ...newReference('Company ADDC'), extends: 'builtin-addc', cableLimits: limits };
    const f = feeder({ loadKw: 40, breakerRatingA: 100, cableCsaMm2: 16, cableType: 'XLPE/PVC/SWA' });
    const p = applyReference(project([f]), ref, '', list(ref));
    expect(tableFor(limits, f)?.label).toBe('ADDC Table A');
    expect(tableFor(limits, { cores: 4 })).toBeUndefined(); // default cable not listed
    const r = recommend(p, f, 'fix');
    expect(r.remarks).toMatch(/^ADDC Table A: \d+ mm² for 100 A/);
    expect(isLimitRemark(r.remarks, limits)).toBe(true);
    expect(isLimitRemark('ADDC Table A: see drawing', limits)).toBe(false);
    expect(isLimitRemark(r.remarks)).toBe(false);
  });

  it('older free-text cable names still find their table', () => {
    expect(dewaTableFor({ cores: 4, cableType: 'Cu/XLPE/SWA/PVC 4C' })).toBe(DEWA_TABLE3);
    expect(dewaTableFor({ cores: 4, cableType: 'XLPE/SWA AL' })).toBeUndefined();
  });

  it('checks and cleans edited limits', () => {
    const r = company();
    r.cableLimits!.tables[3].rows.push({ csaMm2: 25, maxBreakerA: 70, maxLoadA: 70 });
    r.cableLimits!.tables[2].cableTypes = [];
    r.cableLimits!.tables.push({ id: 'x', label: '', cableTypes: ['PVC/PVC'], rows: [{ csaMm2: 0, maxBreakerA: 0, maxLoadA: 0 }] });
    expect(referenceIssues(r, list())).toEqual(expect.arrayContaining([
      'DEWA Table 3: 25 mm² is listed twice.', 'DEWA Table 2: pick the cable types it applies to.',
      'Cable / breaker limits: give every table a name.', 'A table: every row needs a size, a breaker and a load above 0.'
    ]));
    expect(limitIssues(company().cableLimits)).toEqual([]);
    const n = normaliseLimits({ name: ' ', mode: 'bogus', tables: [{ label: 'T', rows: [{ csaMm2: 16, maxBreakerA: 'x', maxLoadA: 1 }, { csaMm2: '10', maxBreakerA: 40, maxLoadA: 40 }] }] })!;
    expect(n).toMatchObject({ name: 'Authority', mode: 'size-up', dbFeederMin: { csaMm2: 0, breakerA: 0 }, tables: [{ id: 't-0', label: 'T', cableTypes: [], rows: [{ csaMm2: 10, maxBreakerA: 40, maxLoadA: 40 }] }] });
    expect(normaliseReference(company()).cableLimits?.tables).toHaveLength(4);
    const saved = saveReference([], { ...company(), cableLimits: { ...DEWA_LIMITS, tables: [{ ...DEWA_TABLE3, rows: [...DEWA_TABLE3.rows].reverse() }] } });
    expect(saved[0].cableLimits!.tables[0].rows[0].csaMm2).toBe(10);
  });
});

describe('Cable / breaker limits card', () => {
  const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');
  const noop = () => {};
  it('shows built-in DEWA read only, on the first table', () => {
    const html = renderToStaticMarkup(<CableLimitsCard limits={DEWA_LIMITS} own readOnly authority="DEWA" onChange={noop} />);
    const t = text(html);
    expect(t).toContain('built-in, read only — duplicate to customise');
    expect(t).toMatch(/DEWA Table 1 · 1-phase.*DEWA Table 1 · 3-phase.*DEWA Table 2.*DEWA Table 3/);
    expect(t).toContain('DB circuits (type not set)');
    expect(html).not.toContain('+ Row');
    expect(html).toMatch(/aria-label="Max breaker A" disabled="" value="16"/);
  });
  it('shows your copy editable, with each row against DEWA', () => {
    const r = company();
    r.cableLimits!.tables = [r.cableLimits!.tables[3], ...r.cableLimits!.tables.slice(0, 3)];
    const html = renderToStaticMarkup(<CableLimitsCard limits={r.cableLimits} own base={DEWA_LIMITS} readOnly={false} authority="DEWA" onChange={noop} />);
    const t = text(html);
    expect(t).toContain('1 row changed from DEWA');
    expect(t).toContain('Reset table to DEWA');
    expect(t).toContain('Here (DEWA 80)');
    expect(t).toContain('Default cable (XLPE/SWA)');
    expect(t).toContain('+ Row');
    expect(t).toContain('+ Table');
  });
  it('offers to add limits to a reference with none', () => {
    expect(text(renderToStaticMarkup(<CableLimitsCard own={false} readOnly={false} authority="ADDC" onChange={noop} />))).toContain('+ Limits');
  });
});
