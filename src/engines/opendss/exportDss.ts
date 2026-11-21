import { DEFAULT_TRANSFORMER_XR, boardDemandKw, resistanceFactor, rOperatingOhmPerKm, runsOf } from '../../calc/electrical';
import { cablesSource } from '../../calc/cableTable';
import { getCable } from '../../calc/cableTable';
import { supplyFaultKa, supplyIncomerFeeder, supplyXr, type Feeder, type Project } from '../../types';

/** Nominal MV voltage the transformer primary is modelled at. The upstream
 * network is a stiff (effectively infinite) source, matching the built-in
 * engine's assumption, so this value doesn't affect LV results. */
const MV_KV = 11;
const STIFF_SOURCE_MVA = 100000;

export interface DssExport {
  script: string;
  warnings: string[];
}

/** OpenDSS element/bus names can't contain spaces or dots (dots separate
 * node numbers), so anything outside [A-Za-z0-9_-] becomes '_'. */
export function dssName(s: string): string {
  return s.replace(/[^A-Za-z0-9_-]/g, '_');
}

/** Stable, case-insensitively unique OpenDSS names for project identifiers. */
export function uniqueDssNames(ids: string[]): Map<string, string> {
  const out = new Map<string, string>();
  const used = new Set<string>();
  for (const id of ids) {
    if (out.has(id)) continue;
    const base = dssName(id) || '_';
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base}_${n}`;
    used.add(name.toLowerCase());
    out.set(id, name);
  }
  return out;
}

/** Keeps imported/user text on one OpenDSS comment line. */
export function dssComment(s: string): string {
  return s.replace(/[\r\n\u2028\u2029]+/g, ' ');
}

const fmt = (n: number, digits = 6) => Number(n.toFixed(digits)).toString();
const busbar = (boardName: string) => `bb_${boardName}`;
const loadBus = (feederName: string) => `ld_${feederName}`;
const isSinglePhase = (f: Feeder) => f.cores === 2;
const lineCodeName = (csa: number, singlePhase: boolean, runs = 1) => `cu${String(csa).replace('.', 'p')}_${singlePhase ? '1ph' : '3ph'}${runs > 1 ? `_x${runs}` : ''}`;
/** The Line of a cable between two buses (a feeder, or the incoming cable of a first board on an LV supply). */
const lineText = (name: string, f: Feeder, bus1: string, bus2: string, nodes = '') =>
  `New Line.${name} phases=${isSinglePhase(f) ? 1 : 3} bus1=${bus1}${nodes} bus2=${bus2}${nodes} ` +
  `linecode=${lineCodeName(f.cableCsaMm2, isSinglePhase(f), runsOf(f))} length=${fmt(f.lengthM, 3)} units=m`;
const sourceBus = (boardName: string) => `src_${boardName}`;

/** Converts a project into a self-contained OpenDSS script (.dss) that
 * builds the same network — transformer, board busbars, feeder cables,
 * loads and PV — and runs a load flow plus a fault study. It can be opened
 * directly in OpenDSS (or loaded through DSS C-API) to cross-check the
 * built-in engine's results. */
export function exportDss(project: Project): DssExport {
  const warnings: string[] = [];
  const kvLL = project.voltageV / 1000;
  const kvLN = kvLL / Math.sqrt(3);
  const out: string[] = [];
  const boardNames = uniqueDssNames(project.boards.map((b) => b.id));
  const feederNames = uniqueDssNames(project.feeders.map((f) => f.id));
  const boardName = (id: string) => boardNames.get(id) ?? dssName(id);
  const feederName = (id: string) => feederNames.get(id) ?? dssName(id);

  out.push(
    `! LV Design Studio — OpenDSS export`,
    `! Project: ${dssComment(project.name)}`,
    `! Exported: ${new Date().toISOString()}`,
    `!`,
    `! Modelling assumptions (same as the built-in engine):`,
    `!  - Stiff upstream MV network (${STIFF_SOURCE_MVA} MVA) at a nominal ${MV_KV} kV.`,
    `!  - Transformer %Z split into R/X by the board's X/R ratio (default ${DEFAULT_TRANSFORMER_XR}).`,
    `!  - A main board with no transformer but a stated supply fault level gets a Vsource on its own busbar (MVAsc = sqrt(3) x U x Ik, X/R as given, else ${DEFAULT_TRANSFORMER_XR}).`,
    `!  - Cable R at operating temperature = ${resistanceFactor(project.vdTempC).toFixed(3)} x R20 (${project.vdTempC === undefined ? 'standard factor 1.2' : `copper at ${project.vdTempC} °C`}); cable data: ${cablesSource()}; capacitance ignored.`,
    `!  - Zero-sequence cable data is a placeholder (R0/X0 = R1/X1). Replace it`,
    `!    before relying on single-phase / earth-fault results.`,
    `!  - 2-core circuits are single-phase: phase + neutral loop modelled as one`,
    `!    conductor with 2x impedance.`,
    `!  - Loads are constant kW/kvar (model=1) at connected kW x demand factor.`,
    `!  - Generation feeders are Generator elements that inject power, whereas the`,
    `!    built-in engine treats them like a load of the same current.`,
    `!  - Capacitor banks are Capacitor elements at their full rated kvar.`,
    ``,
    `Clear`,
    `Set DefaultBaseFrequency=${project.frequencyHz}`,
    `New Circuit.${dssName(project.name) || 'lvds'} basekv=${MV_KV} pu=1.0 phases=3 bus1=sourcebus MVAsc3=${STIFF_SOURCE_MVA} MVAsc1=${STIFF_SOURCE_MVA}`,
    ``
  );

  // --- Transformers: one per main (root) board that has source data ---
  out.push(`! ---- Transformers ----`);
  for (const b of project.boards.filter((b) => !b.upstreamId)) {
    if (!b.sourceKva || !b.sourceImpedancePct) {
      const ka = supplyFaultKa(b);
      if (ka) {
        // LV supply with a stated fault level: a source equivalent on the board's own busbar, at -30 deg
        // like the LV side of the delta-wye transformers, so a closed tie to one of them carries no circulating current.
        // With an incoming cable the source sits on its own bus (the supply point) and the cable joins it to the busbar.
        const xr = supplyXr(b) ?? DEFAULT_TRANSFORMER_XR;
        const mva = fmt(Math.sqrt(3) * kvLL * ka, 4);
        out.push(
          `New Vsource.SRC_${boardName(b.id)} bus1=${supplyIncomerFeeder(b) ? sourceBus(boardName(b.id)) : busbar(boardName(b.id))} basekv=${fmt(kvLL, 4)} pu=1.0 phases=3 angle=-30 ` +
            `MVAsc3=${mva} MVAsc1=${mva} x1r1=${fmt(xr)} x0r0=${fmt(xr)}`
        );
        continue;
      }
      warnings.push(`Main board ${b.id} has no transformer data (kVA / %Z) and was left unconnected.`);
      out.push(`! WARNING: ${dssComment(b.id)} has no transformer data — not connected to a source.`);
      continue;
    }
    const xr = b.sourceXr ?? DEFAULT_TRANSFORMER_XR;
    const rPct = b.sourceImpedancePct / Math.sqrt(1 + xr * xr);
    const xPct = rPct * xr;
    out.push(
      `New Transformer.TX_${boardName(b.id)} phases=3 windings=2 buses=[sourcebus ${busbar(boardName(b.id))}] conns=[delta wye] ` +
        `kVs=[${MV_KV} ${fmt(kvLL)}] kVAs=[${b.sourceKva} ${b.sourceKva}] XHL=${fmt(xPct, 4)} %loadloss=${fmt(rPct, 4)} %noloadloss=0 %imag=0`
    );
  }
  // Closed bus couplers join the main busbars: the transformers run in parallel.
  const roots = new Set(project.boards.filter((b) => !b.upstreamId).map((b) => b.id));
  for (const t of (project.ties ?? []).filter((t) => t.closed && roots.has(t.a) && roots.has(t.b))) {
    out.push(`New Line.TIE_${dssName(t.id)} phases=3 bus1=${busbar(boardName(t.a))} bus2=${busbar(boardName(t.b))} switch=yes`);
  }
  out.push(``);

  // --- Line codes for every cable size in use ---
  out.push(`! ---- Cable line codes (ohm/km) ----`);
  const codes = new Map<string, string>();
  const incomers = project.boards.flatMap((b) => { const f = supplyIncomerFeeder(b); return f && supplyFaultKa(b) ? [{ board: b, feeder: f }] : []; });
  for (const f of [...project.feeders, ...incomers.map((i) => i.feeder)]) {
    const single = isSinglePhase(f);
    const runs = runsOf(f);
    const name = lineCodeName(f.cableCsaMm2, single, runs);
    if (codes.has(name)) continue;
    const k = single ? 2 : 1; // single-phase: go + return conductor
    const r = (rOperatingOhmPerKm(f.cableCsaMm2, project.vdTempC) * k) / runs; // parallel runs
    const x = (getCable(f.cableCsaMm2).xOhmPerKm * k) / runs;
    codes.set(
      name,
      `New LineCode.${name} nphases=${single ? 1 : 3} r1=${fmt(r)} x1=${fmt(x)} r0=${fmt(r)} x0=${fmt(x)} c1=0 c0=0 units=km`
    );
  }
  out.push(...codes.values(), ``);

  // --- Incoming cables: from the supply point (source bus) to the busbar of a first board on an LV supply ---
  if (incomers.length) out.push(`! ---- Supply incomers ----`);
  for (const { board, feeder } of incomers) out.push(lineText(`SUPPLY_${boardName(board.id)}`, feeder, sourceBus(boardName(board.id)), busbar(boardName(board.id))));
  if (incomers.length) out.push(``);

  // --- Feeders: cable + load / generator, or cable to a downstream board ---
  out.push(`! ---- Feeders ----`);
  const boardIds = new Set(project.boards.map((b) => b.id));
  for (const f of project.feeders) {
    if (!boardIds.has(f.boardId)) {
      warnings.push(`Feeder ${f.id} is on unknown board ${f.boardId} and was skipped.`);
      continue;
    }
    const single = isSinglePhase(f);
    const phases = single ? 1 : 3;
    const nodes = single ? '.1' : '';
    const toBus = f.feedsBoardId ? busbar(boardName(f.feedsBoardId)) : loadBus(feederName(f.id));
    const name = feederName(f.id);

    out.push(`! ${dssComment(f.id)} — ${dssComment(f.name)}`);
    out.push(lineText(name, f, busbar(boardName(f.boardId)), toBus, nodes));

    if (f.feedsBoardId) {
      if (single) warnings.push(`Incomer ${f.id} is single-phase; downstream board ${f.feedsBoardId} will only be energised on phase 1.`);
      continue;
    }

    const kv = single ? kvLN : kvLL;
    if (f.kvar) {
      out.push(`New Capacitor.${name} bus1=${loadBus(name)}${nodes} phases=${phases} kv=${fmt(kv, 4)} kvar=${fmt(f.kvar, 3)}`);
      continue;
    }
    const kw = f.loadKw * f.demandFactor;
    const element = f.generation ? 'Generator' : 'Load';
    out.push(
      `New ${element}.${name} bus1=${loadBus(name)}${nodes} phases=${phases} kv=${fmt(kv, 4)} kW=${fmt(kw, 3)} pf=${fmt(f.powerFactor, 3)} model=1`
    );
  }
  out.push(``);

  // --- Solve ---
  const mainKw = project.boards.filter((b) => !b.upstreamId).reduce((s, b) => s + boardDemandKw(project, b.id), 0);
  out.push(
    `! ---- Studies ----`,
    `! Total demand at main board(s): ${fmt(mainKw, 1)} kW`,
    `Set voltagebases=[${MV_KV} ${fmt(kvLL)}]`,
    `Calcvoltagebases`,
    ``,
    `! Load flow`,
    `Solve`,
    `Show Voltages LN Nodes`,
    `Show Currents Elements`,
    ``,
    `! Fault study (3-phase, 1-phase and L-L faults at every bus)`,
    `Solve mode=faultstudy`,
    `Show Faults`,
    ``
  );

  return { script: out.join('\n'), warnings };
}
