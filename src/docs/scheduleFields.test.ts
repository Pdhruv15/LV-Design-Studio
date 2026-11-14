import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { scheduleCircuits } from '../calc/loadSchedule';
import { balancePhases } from '../model/schedule';
import { addSpareWay } from '../model/spareWays';
import { scheduleRowKeys, templateData, TEMPLATE_FIELDS } from './scheduleFields';

const AT = new Date('2026-10-27T10:00:00Z');
const withSpare = addSpareWay(sampleProject, 'DB-GF1', 'spare').project;

describe('row.phase and row.length', () => {
  it('a circuit gives its phase and length, a spare its phase and no length', () => {
    const d = templateData(withSpare, 'DB-GF1', AT);
    const circuit = scheduleCircuits(withSpare, 'DB-GF1')[0];
    const row = d.rows.find((r) => r['row.ref'] === `${circuit.phase}${circuit.way}`)!;
    expect(row['row.phase']).toBe(circuit.phase);
    expect(row['row.length']).toBe(circuit.lengthM);
    const spare = d.rows.find((r) => r['row.room'] === 'SPARE')!;
    expect(spare['row.phase']).toMatch(/^(R|Y|B|RYB)$/);
    expect(spare['row.length']).toBe('');
  });
  it('are in the field list', () => {
    const keys = TEMPLATE_FIELDS.map((f) => f.key);
    expect(keys).toContain('row.phase');
    expect(keys).toContain('row.length');
  });
});

describe('scheduleRowKeys', () => {
  it('has one unique key per row, a spare apart from the circuits', () => {
    const keys = scheduleRowKeys(withSpare, 'DB-GF1');
    expect(keys).toHaveLength(templateData(withSpare, 'DB-GF1').rows.length);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.filter((k) => k.startsWith('spare:'))).toHaveLength(1);
  });
  it('a circuit keeps its key when the phases are balanced, by id and by uid', () => {
    const ids = new Set(scheduleCircuits(withSpare, 'DB-GF1').map((f) => f.id));
    const keysOf = (p: typeof withSpare) => new Set(scheduleRowKeys(p, 'DB-GF1').filter((k) => !k.startsWith('spare:')));
    expect(keysOf(balancePhases(withSpare, 'DB-GF1'))).toEqual(ids);
    const uids = { ...withSpare, feeders: withSpare.feeders.map((f, i) => ({ ...f, uid: `u${i}` })) };
    const before = keysOf(uids);
    expect([...before].every((k) => /^u\d+$/.test(k))).toBe(true);
    expect(keysOf(balancePhases(uids, 'DB-GF1'))).toEqual(before);
  });
});
