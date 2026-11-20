import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { breakerTypeOf, rcdOf } from '../calc/earthing';
import { designCurrentA, runsOf, voltageDropPct } from '../calc/electrical';
import { scheduleCircuits } from '../calc/loadSchedule';
import { cableTypeOf } from '../model/cableTypes';
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

describe('custom template output fields', () => {
  it('exposes project information, useful circuit parameters and summary aliases', () => {
    const p = { ...withSpare, info: { ...withSpare.info, owner: 'Example Owner', consultant: 'Example Consultant', projectNo: 'P-100' } };
    const d = templateData(p, 'DB-GF1', AT), circuit = scheduleCircuits(p, 'DB-GF1')[0];
    const row = d.rows.find((r) => r['row.ref'] === `${circuit.phase}${circuit.way}`)!;
    expect(d.fields).toMatchObject({ 'project.owner': 'Example Owner', 'project.consultant': 'Example Consultant', 'project.number': 'P-100' });
    expect(d.fields['panel.connectedLoadW']).toBe(d.fields['total.all']);
    expect(d.fields['panel.maximumDemandW']).toBe(d.fields['md.all']);
    expect(row).toMatchObject({
      'row.description': circuit.room || circuit.name,
      'row.demandFactor': circuit.demandFactor,
      'row.powerFactor': circuit.powerFactor,
      'row.breakerType': breakerTypeOf(circuit),
      'row.breakerIcu': circuit.breakerIcuKa,
      'row.cableType': cableTypeOf(p, circuit).value,
      'row.cores': circuit.cores,
      'row.runs': runsOf(circuit),
      'row.rcdMa': rcdOf(p, circuit) ?? '',
    });
    expect(row['row.designCurrent']).toBe(Math.round(designCurrentA(circuit, p) * 100) / 100);
    expect(row['row.voltageDrop']).toBe(Math.round(voltageDropPct(circuit, p) * 100) / 100);
  });

  it('lists the extended fields for Excel placeholders', () => {
    const keys = TEMPLATE_FIELDS.map((f) => f.key);
    for (const key of ['project.owner', 'project.number', 'panel.connectedLoadW', 'row.description', 'row.designCurrent', 'row.breakerType', 'row.cableType', 'row.voltageDrop']) expect(keys).toContain(key);
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
