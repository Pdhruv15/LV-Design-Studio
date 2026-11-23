import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { startSamples, sampleFileText } from './startSamples';
import { parseProject } from '../headless/project';
import { checkReferences } from './integrity';
import { projectInputIssues } from './projectValidate';
import { supplyMode } from '../diagram/supplyPoint';
import { runCalculations } from '../calc/runs';
import { faultCurrentKA, impedanceToBoard, supplySourceLevel } from '../calc/electrical';
import type { Project } from '../types';

const DIR = path.resolve(process.cwd(), 'docs/samples/start-levels');
const WRITE = process.env.WRITE_START_SAMPLES === '1';
const samples = startSamples();
const by = (n: number) => samples[n - 1];
const kA = (p: Project, id: string) => Number(faultCurrentKA(impedanceToBoard(p, id), p.voltageV).toFixed(2));
const vd = (p: Project, id: string) => Number(runCalculations(p).results.find((r) => r.feeder.id === id)!.vdTotalPct.toFixed(2));

describe('start-level sample projects', () => {
  it(WRITE ? 'writes the sample files' : 'the committed files are what the builder makes', () => {
    if (WRITE) {
      fs.mkdirSync(DIR, { recursive: true });
      for (const s of samples) fs.writeFileSync(path.join(DIR, s.file), sampleFileText(s.project));
      return;
    }
    expect(samples.map((s) => s.file)).toEqual(['01-final-db.lvds', '02-sub-main-board.lvds', '03-main-board-lv-source.lvds', '04-transformer-main-board.lvds', '05-rmu-one-transformer.lvds', '06-rmu-two-transformers.lvds', '07-ring-two-substations.lvds', '08-generator-and-solar.lvds']);
    for (const s of samples) {
      const onDisk = fs.existsSync(path.join(DIR, s.file)) ? fs.readFileSync(path.join(DIR, s.file), 'utf-8') : undefined;
      expect(onDisk === sampleFileText(s.project), `${s.file} is not what src/model/startSamples.ts builds. Run: npm run samples:start-levels`).toBe(true);
    }
  });

  it('each file opens like the app opens it and comes back unchanged', () => {
    for (const s of samples) {
      const text = sampleFileText(s.project);
      expect(parseProject(text, s.file)).toEqual({ ...s.project, format: 'lvds.project' });
    }
  });

  it('is deterministic: building twice gives the same text', () => {
    expect(startSamples().map((s) => sampleFileText(s.project))).toEqual(samples.map((s) => sampleFileText(s.project)));
  });

  it('has no dangling reference and no input issue', () => {
    for (const s of samples) {
      expect(checkReferences(s.project), s.file).toEqual([]);
      expect(projectInputIssues(s.project), s.file).toEqual([]);
    }
  });

  it('names no authority or supplier', () => {
    for (const s of samples) expect(`${sampleFileText(s.project)}\n${s.title}\n${s.note}`).not.toMatch(/DEWA|ADDC|SEWA|FEWA|Etihad/i);
  });

  it('starts where each sample says', () => {
    const modes = (n: number) => by(n).project.boards.filter((b) => !b.upstreamId).map((b) => supplyMode(b));
    expect(modes(1)).toEqual(['board']);
    expect(modes(2)).toEqual(['board']);
    expect(modes(3)).toEqual(['source']);
    expect(modes(4)).toEqual(['transformer']);
    expect(modes(5)).toEqual(['transformer']);
    expect(modes(6)).toEqual(['transformer', 'transformer']);
    expect(modes(7)).toEqual(['transformer', 'transformer']);
    expect(modes(8)).toEqual(['source', 'source']);
    expect(by(1).project.boards[0].kind).toBe('DB');
    expect(by(2).project.boards[0].kind).toBe('SMDB');
    expect(by(3).project.boards[0].supply?.fedFrom).toBe('Source');
    expect(by(5).project.rmus?.length).toBe(1);
    expect(by(6).project.ties?.map((t) => t.id)).toEqual(['BC-1']);
    expect(by(6).project.rmus?.length).toBe(1);
    expect(by(7).project.substations?.length).toBe(2);
    expect(by(7).project.rmus?.length).toBe(2);
    expect(by(7).project.gridSources?.length).toBe(1);
  });

  it('calculates: fault level at the first board, voltage drop of one circuit', () => {
    const p = (n: number) => by(n).project;
    // Fault level at the first board's busbar (kA): given (01-03), from the transformer (04-07), calculated from the source (08).
    expect(kA(p(1), 'DB-1')).toBe(2.22);   // 15 kA given upstream, X/R 4, then 35 m of incoming cable
    expect(kA(p(2), 'SMDB-1')).toBe(5.17); // 22 kA given upstream, X/R 5, then 60 m of incoming cable
    expect(kA(p(3), 'MDB-1')).toBe(25);    // 25 kA given at the busbar
    expect(kA(p(4), 'MDB-1')).toBe(29.22); // 1000 kVA, 5 %
    expect(kA(p(5), 'MDB-1')).toBe(29.22);
    expect(kA(p(6), 'MDB-1')).toBe(29.22);
    expect(kA(p(6), 'MDB-2')).toBe(29.22);
    expect(kA(p(7), 'MDB-1')).toBe(29.22);
    expect(kA(p(7), 'MDB-2')).toBe(29.22);
    // 08: generator 250 kVA, X″d 15 %, X/R 10: |Z| = X″d × U² ÷ S = 0.15 × 415² ÷ 250 000 = 0.1033 Ω, Ik = c·U ÷ (√3·|Z|) = 1.05 × 415 ÷ (√3 × 0.1033) = 2.43 kA.
    //     Inverter source: 1.2 × rated current of 100 kVA at 415 V = 1.2 × 139.1 A = 0.17 kA.
    const [gen, pv] = p(8).boards.filter((b) => !b.upstreamId);
    expect(supplySourceLevel(p(8), gen).basis).toBe('calculated');
    expect(Number(supplySourceLevel(p(8), gen).ka.toFixed(2))).toBe(2.43);
    expect(supplySourceLevel(p(8), pv).basis).toBe('calculated');
    expect(Number(supplySourceLevel(p(8), pv).ka.toFixed(2))).toBe(0.17);
    expect(kA(p(8), gen.id)).toBe(2.43);
    expect(kA(p(8), pv.id)).toBe(0.17);
    // Total voltage drop (%) of one circuit, source to the end of the cable.
    expect(vd(p(1), 'DB-1-R1')).toBe(3.1);
    expect(vd(p(2), 'DB-1-R1')).toBe(3.15);
    expect(vd(p(3), 'DB-1-R1')).toBe(3.32);
    expect(vd(p(4), 'DB-1-R1')).toBe(3.32);
    expect(vd(p(5), 'DB-1-R1')).toBe(3.32);
    expect(vd(p(6), 'DB-2-R1')).toBe(2.43);
    expect(vd(p(7), 'DB-2-R1')).toBe(2.43);
    expect(vd(p(8), 'DB-1-R1')).toBe(2.43);
    expect(vd(p(8), 'DB-2-R1')).toBe(1.97);
  });

  it('shows no failing check, except what the note of 08 says', () => {
    for (const s of samples) {
      const r = runCalculations(s.project);
      expect(r.results.filter((x) => x.status === 'bad').map((x) => x.feeder.id), s.file).toEqual([]);
      expect(r.earthing.filter((x) => x.disconnection === 'bad' || x.adiabatic === 'bad').map((x) => x.feeder.id), s.file).toEqual([]);
      if (s.file !== '08-generator-and-solar.lvds') expect(r.earthing.filter((x) => x.disconnection === 'warn').map((x) => x.feeder.id), s.file).toEqual([]);
    }
    const g = runCalculations(by(8).project).earthing.filter((x) => x.subTransientOnly);
    expect(g.length).toBeGreaterThan(0);
  });
});
