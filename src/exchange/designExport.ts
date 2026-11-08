import { breakerTypeOf } from '../calc/earthing';
import { runsOf } from '../calc/electrical';
import { cpcOf } from '../calc/cableTable';
import { circuitRef } from '../calc/loadSchedule';
import { runCalculations, STUDY_KEYS, fingerprint } from '../calc/runs';
import { boardSummary, loadTypeOf } from '../calc/summary';
import { cableTypeOf } from '../model/cableTypes';
import { withUids } from '../model/stableIds';
import type { Project } from '../types';
import { canonicalJson } from './contracts';
import { DESIGN_SCHEMA, DESIGN_VERSION, designPackage, type DesignBoard, type DesignCircuit, type DesignPackage } from './designContract';

/** The project's electrical design as an `lvds.design` package (designContract.ts), calculated now. The same project
 * always gives the same package apart from `exportedAt`, and the same `sha256`. */

const r3 = (x: number) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : 0);
const opt = <K extends string, V>(k: K, v: V | undefined | null): Partial<Record<K, V>> => (v === undefined || v === null || v === '' ? {} : ({ [k]: v } as Record<K, V>));

/** The text a design package's sha256 is taken over: without sha256 and exportedAt. */
export const designHashedText = (pkg: object): string => canonicalJson({ ...pkg, sha256: undefined, exportedAt: undefined });

export function designExport(project0: Project, o: { exportedAt: string; sha256: (text: string) => string; appVersion?: string; file?: string }): DesignPackage {
  const project = withUids(project0);
  const run = runCalculations(project);
  const uidOfBoard = new Map(project.boards.map((b) => [b.id, b.uid!]));
  const uidOfFeeder = new Map(project.feeders.map((f) => [f.id, f.uid!]));
  const incomerOf = new Map(project.feeders.filter((f) => f.feedsBoardId).map((f) => [f.feedsBoardId!, f.uid!]));
  const earth = new Map(run.earthing.map((e) => [e.feeder.id, e]));

  const boards = project.boards.map((b): DesignBoard => {
    const s = boardSummary(project, b);
    return {
      uid: b.uid!, tag: b.id, name: b.name,
      ...opt('kind', b.kind), ...opt('upstreamUid', b.upstreamId ? uidOfBoard.get(b.upstreamId) : undefined), ...opt('incomerUid', incomerOf.get(b.id)),
      ...opt('level', b.level ? `${b.level.building} / ${b.level.level}` : undefined), ...opt('location', b.location), ...opt('ratedCurrentA', b.ratedCurrentA),
      ...(b.sourceKva ? { source: { kva: b.sourceKva, ...opt('impedancePct', b.sourceImpedancePct), ...opt('xr', b.sourceXr), ...opt('vectorGroup', b.vectorGroup) } } : {}),
      results: {
        demandKw: r3(s.demandKw), demandKva: r3(s.demandKva), powerFactor: r3(s.powerFactor), currentA: r3(s.currentA),
        ...opt('loadingPct', s.loadingPct === undefined ? undefined : r3(s.loadingPct)), faultKa: r3(s.faultKA), voltagePct: r3(s.voltagePct)
      }
    };
  });

  const circuits = run.results.map(({ feeder: f, ...r }): DesignCircuit => {
    const e = earth.get(f.id);
    const points = f.points ? Object.fromEntries(Object.entries(f.points).filter(([, n]) => typeof n === 'number' && n > 0)) as Record<string, number> : undefined;
    return {
      uid: f.uid ?? uidOfFeeder.get(f.id)!, tag: f.id, boardUid: uidOfBoard.get(f.boardId) ?? f.boardId,
      ...opt('feedsBoardUid', f.feedsBoardId ? uidOfBoard.get(f.feedsBoardId) : undefined),
      name: f.name, ...opt('ref', circuitRef(f)), ...opt('phase', f.phase), loadType: loadTypeOf(f), ...opt('essential', f.essential),
      load: { kw: r3(f.loadKw), demandFactor: r3(f.demandFactor), powerFactor: r3(f.powerFactor), ...(points && Object.keys(points).length ? { points } : {}), ...opt('generation', f.generation) },
      breaker: { type: breakerTypeOf(f), ratingA: f.breakerRatingA, ...opt('icuKa', f.breakerIcuKa), ...opt('rcdMa', e?.rcdMa ?? f.rcdMa) },
      cable: { type: cableTypeOf(project, f).value, cores: f.cores, runs: runsOf(f), csaMm2: f.cableCsaMm2, cpcMm2: cpcOf(f), lengthM: r3(f.lengthM), ...opt('installMethod', f.installMethod) },
      results: {
        designCurrentA: r3(r.ib), ampacityA: r3(r.ampacity), loadingPct: r3(r.loadingPct), vdPct: r3(r.vdPct), vdTotalPct: r3(r.vdTotalPct),
        breakerFaultKa: r3(r.breakerFaultKA), endFaultKa: r3(r.endFaultKA),
        ...(e ? { zsOhm: r3(e.zsOhm), maxZsOhm: r3(e.maxZsOhm), disconnectionS: r3(e.requiredS) } : {}),
        status: { vd: r.vdStatus, ampacity: r.ampacityStatus, protection: r.protectionStatus, icu: r.icuStatus, ...opt('disconnection', e?.disconnection), overall: r.status }
      }
    };
  });

  const elvDevices = (project.elvDevices ?? []).map((d) => ({
    uid: d.id, type: d.type, buildingId: d.buildingId, levelId: d.levelId, ...opt('roomId', d.roomId), x: r3(d.x), y: r3(d.y), ...opt('rotationDeg', d.rotationDeg)
  }));

  const pkg = {
    schema: DESIGN_SCHEMA, version: DESIGN_VERSION,
    project: { ...opt('id', project.id), name: project.name, voltageV: project.voltageV, frequencyHz: project.frequencyHz, vdLimitPct: project.vdLimitPct },
    source: { app: 'lvds' as const, ...opt('appVersion', o.appVersion), ...opt('file', o.file) },
    exportedAt: o.exportedAt,
    calculation: { fingerprint: o.sha256(JSON.stringify(STUDY_KEYS.map((k) => fingerprint(project, k)))) },
    boards, circuits, elvDevices
  };
  const out = { ...pkg, sha256: o.sha256(designHashedText(pkg)) };
  // Never hand out a package that breaks its own contract.
  return designPackage.parse(out);
}
