import { describe, expect, it } from 'vitest';
import { dssComment, dssName, exportDss, uniqueDssNames } from './exportDss';
import type { Project } from '../../types';

// Fixed fixture (independent of the app's sample project, which may change).
const sampleProject: Project = {
  name: 'Demonstration Project — Not for Construction',
  voltageV: 415,
  frequencyHz: 50,
  ambientC: 45,
  vdLimitPct: 4,
  boards: [{ id: 'MDB-1', name: 'Main Distribution Board', sourceKva: 1000, sourceImpedancePct: 5 }],
  feeders: [
    { id: 'SMDB-GF', boardId: 'MDB-1', name: 'Ground floor SMDB', loadKw: 205, demandFactor: 0.8, powerFactor: 0.85, lengthM: 42, cableCsaMm2: 185, cores: 4, breakerRatingA: 400, breakerIcuKa: 36 },
    { id: 'SMDB-FF', boardId: 'MDB-1', name: 'First floor SMDB', loadKw: 138, demandFactor: 0.78, powerFactor: 0.85, lengthM: 55, cableCsaMm2: 120, cores: 4, breakerRatingA: 250, breakerIcuKa: 36 },
    { id: 'DB-AC', boardId: 'MDB-1', name: 'HVAC distribution board', loadKw: 310, demandFactor: 0.92, powerFactor: 0.85, lengthM: 68, cableCsaMm2: 300, cores: 4, breakerRatingA: 500, breakerIcuKa: 50 },
    { id: 'DB-EM', boardId: 'MDB-1', name: 'Emergency board (ATS)', loadKw: 96, demandFactor: 0.81, powerFactor: 0.85, lengthM: 25, cableCsaMm2: 120, cores: 4, breakerRatingA: 250, breakerIcuKa: 36 },
    { id: 'DB-PV', boardId: 'MDB-1', name: 'Solar PV inverter board', loadKw: 50, demandFactor: 1, powerFactor: 0.95, lengthM: 30, cableCsaMm2: 70, cores: 4, breakerRatingA: 160, breakerIcuKa: 25, generation: true }
  ],
  updatedAt: ''
};

const lines = (script: string, prefix: string) => script.split('\n').filter((l) => l.startsWith(prefix));

describe('OpenDSS export', () => {
  it('sanitises names that OpenDSS would misread', () => {
    expect(dssName('DB 1.2/A')).toBe('DB_1_2_A');
    expect(dssName('SMDB-GF')).toBe('SMDB-GF');
  });

  it('keeps sanitised names unique without case-only collisions', () => {
    expect([...uniqueDssNames(['DB 1', 'DB.1', 'db_1', 'DB 1']).values()]).toEqual(['DB_1', 'DB_1_2', 'db_1_3']);
    const project: Project = {
      ...sampleProject,
      boards: [
        { ...sampleProject.boards[0], id: 'Main.1' },
        { id: 'Main 1', name: 'Sub', upstreamId: 'Main.1' }
      ],
      feeders: [
        { ...sampleProject.feeders[0], id: 'Load.1', boardId: 'Main.1', feedsBoardId: 'Main 1' },
        { ...sampleProject.feeders[1], id: 'Load 1', boardId: 'Main 1' }
      ]
    };
    const { script } = exportDss(project);
    expect(script).toContain('buses=[sourcebus bb_Main_1]');
    expect(script).toContain('New Line.Load_1 phases=3 bus1=bb_Main_1 bus2=bb_Main_1_2');
    expect(script).toContain('New Line.Load_1_2 phases=3 bus1=bb_Main_1_2 bus2=ld_Load_1_2');
  });

  it('keeps imported text on its OpenDSS comment line', () => {
    expect(dssComment('first\r\nClear\u2028Solve')).toBe('first Clear Solve');
    const project: Project = {
      ...sampleProject,
      name: 'Project\nClear',
      feeders: [{ ...sampleProject.feeders[0], id: 'F\r\nSolve', name: 'Load\u2029Redirect output' }]
    };
    const { script } = exportDss(project);
    expect(script).toContain('! Project: Project Clear');
    expect(script).toContain('! F Solve — Load Redirect output');
    expect(script.split('\n').filter((line) => line === 'Clear')).toHaveLength(1);
    expect(script.split('\n').filter((line) => line === 'Solve')).toHaveLength(1);
  });

  it('exports the sample project: transformer, a line per feeder, loads and PV', () => {
    const { script, warnings } = exportDss(sampleProject);
    expect(warnings).toEqual([]);

    const [tx] = lines(script, 'New Transformer.');
    expect(tx).toContain('buses=[sourcebus bb_MDB-1]');
    expect(tx).toContain('kVs=[11 0.415]');
    expect(tx).toContain('kVAs=[1000 1000]');
    // 5 % at X/R 5 → R = 0.9806 %, X = 4.9029 %
    expect(tx).toContain('XHL=4.9029');
    expect(tx).toContain('%loadloss=0.9806');

    expect(lines(script, 'New Line.')).toHaveLength(sampleProject.feeders.length);
    expect(lines(script, 'New Load.')).toHaveLength(4);
    const [pv] = lines(script, 'New Generator.');
    expect(pv).toContain('Generator.DB-PV');
    expect(pv).toContain('kW=50');

    // 185 mm²: R = 0.0991 × 1.2 = 0.11892 Ω/km
    expect(script).toContain('New LineCode.cu185_3ph nphases=3 r1=0.11892 x1=0.07');
    expect(script).toContain('Solve mode=faultstudy');
  });

  it('connects an incomer to the downstream busbar with no load, and exports 2-core circuits as single-phase', () => {
    const p: Project = {
      ...sampleProject,
      boards: [...sampleProject.boards, { id: 'SMDB 2', name: 'Sub', upstreamId: 'MDB-1' }],
      feeders: [
        { id: 'RISER', boardId: 'MDB-1', name: 'Riser', loadKw: 0, demandFactor: 1, powerFactor: 0.85, lengthM: 40, cableCsaMm2: 95, cores: 4, breakerRatingA: 200, breakerIcuKa: 36, feedsBoardId: 'SMDB 2' },
        { id: 'LTG', boardId: 'SMDB 2', name: 'Lighting', loadKw: 3, demandFactor: 1, powerFactor: 0.9, lengthM: 25, cableCsaMm2: 2.5, cores: 2, breakerRatingA: 20, breakerIcuKa: 10 }
      ]
    };
    const { script } = exportDss(p);

    expect(script).toContain('New Line.RISER phases=3 bus1=bb_MDB-1 bus2=bb_SMDB_2 linecode=cu95_3ph length=40 units=m');
    expect(lines(script, 'New Load.RISER')).toHaveLength(0);

    // 2.5 mm² single-phase loop: 2 × 7.41 × 1.2 = 17.784 Ω/km
    expect(script).toContain('New LineCode.cu2p5_1ph nphases=1 r1=17.784');
    expect(script).toContain('New Line.LTG phases=1 bus1=bb_SMDB_2.1 bus2=ld_LTG.1');
    expect(script).toContain('New Load.LTG bus1=ld_LTG.1 phases=1 kv=0.2396 kW=3');
  });

  it('exports a capacitor bank as a Capacitor at its rated kvar, not as a zero-power load', () => {
    const cap = { id: 'PFC', boardId: 'MDB-1', name: 'PFC', loadKw: 0, kvar: 150, capSteps: 6, demandFactor: 1, powerFactor: 0, lengthM: 5, cableCsaMm2: 95, cores: 4, loadType: 'capacitor', breakerRatingA: 315, breakerIcuKa: 36 } as const;
    const { script } = exportDss({ ...sampleProject, feeders: [...sampleProject.feeders, cap] });
    expect(script).toContain('New Capacitor.PFC bus1=ld_PFC phases=3 kv=0.415 kvar=150');
    expect(lines(script, 'New Load.PFC')).toHaveLength(0);
  });

  it('warns when the main board has no transformer data', () => {
    const p: Project = { ...sampleProject, boards: [{ id: 'MDB-1', name: 'Main' }] };
    const { script, warnings } = exportDss(p);
    expect(warnings[0]).toMatch(/no transformer data/);
    expect(lines(script, 'New Transformer.')).toHaveLength(0);
  });
});

describe('OpenDSS export: first board on an LV supply', () => {
  const lv = (board: Project['boards'][number]): Project => ({ ...sampleProject, boards: [board] });
  it('a supply fault level becomes a Vsource on the board busbar, not a warning', () => {
    const { script, warnings } = exportDss(lv({ id: 'MDB-1', name: 'Main', supply: { faultKa: 25 } }));
    const mva = (Math.sqrt(3) * 0.415 * 25).toFixed(4);
    expect(lines(script, 'New Vsource.')).toEqual([`New Vsource.SRC_MDB-1 bus1=bb_MDB-1 basekv=0.415 pu=1.0 phases=3 angle=-30 MVAsc3=${Number(mva)} MVAsc1=${Number(mva)} x1r1=5 x0r0=5`]);
    expect(warnings.filter((w) => /no transformer data/.test(w))).toEqual([]);
    expect(lines(script, 'New Transformer.')).toHaveLength(0);
  });
  it('a closed tie to a transformer board keeps the supply source in phase with its delta-wye secondary', () => {
    const { script } = exportDss({
      ...sampleProject,
      boards: [...sampleProject.boards, { id: 'MDB-2', name: 'Main 2', supply: { faultKa: 25 } }],
      ties: [{ id: 'BC1', a: 'MDB-1', b: 'MDB-2', ratingA: 1600, closed: true }]
    });
    expect(lines(script, 'New Transformer.')).toHaveLength(1);
    expect(lines(script, 'New Vsource.')[0]).toContain('angle=-30');
    expect(lines(script, 'New Line.TIE_')).toHaveLength(1);
  });
  it('neither transformer nor fault level keeps the warning; a transformer board has no Vsource', () => {
    const none = exportDss(lv({ id: 'MDB-1', name: 'Main', supply: { ratingA: 400 } }));
    expect(none.warnings[0]).toMatch(/no transformer data/);
    expect(lines(none.script, 'New Vsource.')).toHaveLength(0);
    expect(lines(exportDss(sampleProject).script, 'New Vsource.')).toHaveLength(0);
    expect(exportDss(lv({ id: 'MDB-1', name: 'Main', supply: { faultKa: -5 } })).warnings[0]).toMatch(/no transformer data/); // a fault level must be above zero
  });
});

describe('OpenDSS export: values given from upstream', () => {
  const lv = (supply: NonNullable<Project['boards'][number]['supply']>): Project => ({ ...sampleProject, boards: [{ id: 'MDB-1', name: 'Main', supply }] });
  it('the given X/R sets the source X/R', () => {
    const { script } = exportDss(lv({ faultKa: 25, xr: 3 }));
    expect(lines(script, 'New Vsource.')[0]).toMatch(/x1r1=3 x0r0=3$/);
  });
  it('an incoming cable puts the source on its own bus, joined to the busbar by a Line built like a feeder line', () => {
    const { script } = exportDss(lv({ faultKa: 25, incomer: { cableCsaMm2: 240, lengthM: 30, parallel: 2 } }));
    expect(lines(script, 'New Vsource.')[0]).toContain('bus1=src_MDB-1 ');
    expect(lines(script, 'New Line.SUPPLY_')).toEqual(['New Line.SUPPLY_MDB-1 phases=3 bus1=src_MDB-1 bus2=bb_MDB-1 linecode=cu240_3ph_x2 length=30 units=m']);
    expect(script).toContain('New LineCode.cu240_3ph_x2 '); // defined before it is used
    expect(script.indexOf('New LineCode.cu240_3ph_x2')).toBeLessThan(script.indexOf('New Line.SUPPLY_MDB-1'));
  });
  it('unchanged without the values, with no fault level, and on a transformer board', () => {
    expect(lines(exportDss(lv({ faultKa: 25 })).script, 'New Vsource.')[0]).toContain('bus1=bb_MDB-1 ');
    expect(lines(exportDss(lv({ faultKa: 25 })).script, 'New Line.SUPPLY_')).toEqual([]);
    expect(lines(exportDss(lv({ incomer: { cableCsaMm2: 240, lengthM: 30 } })).script, 'New Line.SUPPLY_')).toEqual([]); // no source to join
    const tx: Project = { ...sampleProject, boards: sampleProject.boards.map((b) => (b.id === 'MDB-1' ? { ...b, supply: { faultKa: 25, xr: 3, incomer: { cableCsaMm2: 240, lengthM: 30 } } } : b)) };
    expect(exportDss(tx).script.replace(/! Exported.*/, '')).toBe(exportDss(sampleProject).script.replace(/! Exported.*/, ''));
  });
});

describe('OpenDSS export: a source with its rating typed', () => {
  const lv = (supply: NonNullable<Project['boards'][number]['supply']>): Project => ({ ...sampleProject, boards: [{ id: 'MDB-1', name: 'Main', supply }] });
  it('a generator becomes a Vsource at its calculated level (250 kVA, X″d 15 %: 2.43 kA) with X/R 10', () => {
    const { script, warnings } = exportDss(lv({ kind: 'generator', ratedKva: 250 }));
    const mva = Number((Math.sqrt(3) * 0.415 * 2.4337).toFixed(2)); // 1.05 × 347.8 A ÷ 0.15 = 2433.7 A
    const line = lines(script, 'New Vsource.')[0];
    expect(line).toMatch(/x1r1=10 x0r0=10$/);
    expect(Number(/MVAsc3=([\d.]+)/.exec(line)![1])).toBeCloseTo(mva, 1);
    expect(warnings.filter((w) => /no transformer data/.test(w))).toEqual([]);
  });
  it('a calculated source warns that it is for the fault study only, in the list and in the script', () => {
    const w = 'source equivalent of MDB-1 is for the fault study only: load-flow voltages are not valid';
    for (const supply of [{ kind: 'pv' as const, ratedKva: 100 }, { kind: 'generator' as const, ratedKva: 250 }]) {
      const { script, warnings } = exportDss(lv(supply));
      expect(warnings).toContain(w);
      expect(script).toContain(`! WARNING: ${w}`);
    }
    expect(exportDss(lv({ faultKa: 12 })).warnings).not.toContain(w); // a typed level is a real source level
  });
  it('an inverter source is nearly resistive (x1r1 0.1); an assumed one stays unconnected', () => {
    expect(lines(exportDss(lv({ kind: 'pv', ratedKva: 100 })).script, 'New Vsource.')[0]).toMatch(/x1r1=0\.1 x0r0=0\.1$/);
    expect(exportDss(lv({ kind: 'pv' })).warnings[0]).toMatch(/no transformer data/);
  });
});
