import { C_MAX, C_MV, DEFAULT_GRID_XR, DEFAULT_TRANSFORMER_XR, GENERATOR_XD_SUBTRANSIENT_PCT, GENERATOR_XD_TRANSIENT_DEFAULT_PCT, GENERATOR_XR, MOTOR_LOCKED_ROTOR_MULTIPLE, MOTOR_RX, cableImpedance, gridImpedance, transformerImpedance, type Impedance } from './electrical';
import { DEFAULT_BASE_MVA, peakFactor, puBase, type PuValue } from './perUnit';
import type { CableFamily } from './cableFamily';

// Short circuit sketch: a drawn network of buses, sources, transformers, cables, generators and motors, solved in per
// unit with the nodal admittance method (any network, meshes included). Every element takes its impedance from the
// same functions as the board-by-board study (src/calc/electrical.ts), so both give the same numbers where they
// describe the same network. No screen uses it yet.

export interface ScBus { id: string; name: string }
/** Fault MVA wins; else from the fault current: √3 · kV · kA. */
export interface ScSource { id: string; busId: string; kv: number; faultMva?: number; faultKa?: number; xr?: number }
export interface ScTransformer { id: string; name: string; fromBusId: string; toBusId: string; kva: number; primaryKv: number; secondaryKv: number; zPct: number; xr?: number; vectorGroup?: string; tapPct?: number }
export interface ScCable { id: string; fromBusId: string; toBusId: string; csaMm2: number; family: CableFamily; lengthM: number; runs?: number }
export interface ScGenerator { id: string; name: string; busId: string; kva: number; xdSubPct?: number; xdTransPct?: number; sustainedMultiple?: number; xr?: number }
export interface ScMotors { id: string; busId: string; kw: number }
export interface ScFaultPoint { id: string; name: string; busId?: string; cableId?: string; distanceM?: number }
export interface ScSketch {
  id: string; name: string; baseMva?: number;
  buses: ScBus[]; sources: ScSource[]; transformers: ScTransformer[]; cables: ScCable[]; generators: ScGenerator[]; motors: ScMotors[]; faultPoints: ScFaultPoint[];
}

/** Power factor to turn a motor group's kW into rated kVA (the app's motor rows carry their own; the sketch has kW only). */
export const SC_MOTOR_PF = 0.85;
/** Voltage factors for the minimum fault current (IEC 60909-0 Table 1): LV 0.95, MV 1.0. */
export const C_MIN_LV = 0.95;
export const C_MIN_MV = 1.0;
const SQRT3 = Math.sqrt(3);
const isLv = (kv: number): boolean => kv <= 1;
const pos = (v: number | undefined): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const n = (v: number, d = 2): string => String(+v.toFixed(d));

export type ScMode = 'max' | 'min';

// ---- bus voltages ----

export interface BusVoltages { kv: Map<string, number>; warnings: string[] }

export function busVoltagesKv(sketch: ScSketch): BusVoltages {
  const kv = new Map<string, number>(), warnings: string[] = [];
  const name = (id: string) => sketch.buses.find((b) => b.id === id)?.name || id;
  const ids = new Set(sketch.buses.map((b) => b.id));
  const queue: string[] = [];
  const reach = (id: string, v: number, via: string) => {
    if (!ids.has(id)) return;
    const have = kv.get(id);
    if (have === undefined) { kv.set(id, v); queue.push(id); } else if (Math.abs(have - v) > 1e-9 * Math.max(have, v)) warnings.push(`Bus ${name(id)} is reached at two different voltages (${n(have, 3)} kV and ${n(v, 3)} kV, ${via}).`);
  };
  for (const s of sketch.sources) {
    if (!ids.has(s.busId)) { warnings.push(`Source ${s.id} is on a bus that does not exist.`); continue; }
    if (!pos(s.kv)) { warnings.push(`Source ${s.id} has no valid voltage.`); continue; }
    reach(s.busId, s.kv, `source ${s.id}`);
  }
  while (queue.length) {
    const id = queue.shift()!, v = kv.get(id)!;
    for (const c of sketch.cables) {
      if (c.fromBusId === id) reach(c.toBusId, v, `cable ${c.id}`); else if (c.toBusId === id) reach(c.fromBusId, v, `cable ${c.id}`);
    }
    for (const t of sketch.transformers) {
      if (!pos(t.primaryKv) || !pos(t.secondaryKv)) continue;
      if (t.fromBusId === id) {
        if (Math.abs(t.primaryKv - v) > 0.01 * v) warnings.push(`Transformer ${t.name || t.id} has a primary of ${n(t.primaryKv, 3)} kV on a ${n(v, 3)} kV bus.`);
        reach(t.toBusId, t.secondaryKv, `transformer ${t.name || t.id}`);
      } else if (t.toBusId === id) {
        if (Math.abs(t.secondaryKv - v) > 0.01 * v) warnings.push(`Transformer ${t.name || t.id} has a secondary of ${n(t.secondaryKv, 3)} kV on a ${n(v, 3)} kV bus.`);
        reach(t.fromBusId, t.primaryKv, `transformer ${t.name || t.id}`);
      }
    }
  }
  for (const b of sketch.buses) if (!kv.has(b.id)) warnings.push(`Bus ${b.name || b.id} has no voltage: it is not connected to a source.`);
  return { kv, warnings };
}

// ---- elements in per unit ----

export interface ScElement { id: string; kind: 'source' | 'transformer' | 'cable' | 'generator' | 'motors'; name: string; data: string; baseKv: number; pu: PuValue }

interface Branch { a: number; b: number; z: { r: number; x: number } }
interface Shunt { node: number; z: { r: number; x: number } }
interface Network { nodes: { id: string; kv: number }[]; busNode: Map<string, number>; cableNode: Map<string, { d: number; node: number; fpId: string }[]>; branches: Branch[]; shunts: Shunt[]; elements: ScElement[]; warnings: string[]; baseMva: number }

const asPu = (z: Impedance, zBase: number) => ({ r: z.r / zBase, x: z.x / zBase });

function build(sketch: ScSketch, mode: ScMode): Network {
  const { kv, warnings } = busVoltagesKv(sketch);
  const baseMva = pos(sketch.baseMva) ? sketch.baseMva : DEFAULT_BASE_MVA;
  const nodes: Network['nodes'] = [], busNode = new Map<string, number>();
  for (const b of sketch.buses) { busNode.set(b.id, nodes.length); nodes.push({ id: b.id, kv: kv.get(b.id) ?? NaN }); }
  const net: Network = { nodes, busNode, cableNode: new Map(), branches: [], shunts: [], elements: [], warnings, baseMva };
  const bus = (id: string) => busNode.get(id);
  const baseAt = (busId: string) => { const v = kv.get(busId); return v && v > 0 ? puBase(baseMva, v) : undefined; };
  const element = (e: Omit<ScElement, 'pu'>, z: { r: number; x: number }) => net.elements.push({ ...e, pu: { r: z.r, x: z.x, z: Math.hypot(z.r, z.x) } });
  const shunt = (busId: string, z: { r: number; x: number }) => { const k = bus(busId); if (k !== undefined) net.shunts.push({ node: k, z }); };

  for (const s of sketch.sources) {
    const base = baseAt(s.busId), mva = pos(s.faultMva) ? s.faultMva : pos(s.faultKa) && pos(s.kv) ? SQRT3 * s.kv * s.faultKa : undefined;
    if (!base || !mva) { if (bus(s.busId) !== undefined && pos(s.kv)) warnings.push(`Source ${s.id} has no fault level.`); continue; }
    const z = gridImpedance({ id: s.id, name: s.id, kv: s.kv, faultMva: mva, xr: s.xr }, 1000 * base.kv);
    if (!z) continue;
    const pu = asPu(z, base.zOhm);
    element({ id: s.id, kind: 'source', name: `Source ${s.id}`, data: `${n(s.kv)} kV, ${n(mva)} MVA, X/R ${n(pos(s.xr) ? s.xr : DEFAULT_GRID_XR)}`, baseKv: base.kv }, pu);
    shunt(s.busId, pu);
  }
  for (const t of sketch.transformers) {
    const a = bus(t.fromBusId), b = bus(t.toBusId);
    if (a === undefined || b === undefined || !pos(t.kva) || !pos(t.zPct)) { warnings.push(`Transformer ${t.name || t.id} is incomplete (buses, kVA and Z % are needed).`); continue; }
    const secKv = pos(t.secondaryKv) ? t.secondaryKv : kv.get(t.toBusId);
    if (!pos(secKv)) { warnings.push(`Transformer ${t.name || t.id} has no voltage.`); continue; }
    // Tap is ignored for fault levels, as in the board-by-board study.
    const z = transformerImpedance(t.kva, t.zPct, secKv * 1000, pos(t.xr) ? t.xr : DEFAULT_TRANSFORMER_XR);
    const pu = asPu(z, puBase(baseMva, secKv).zOhm);
    element({ id: t.id, kind: 'transformer', name: t.name || t.id, data: `${n(t.kva)} kVA, ${n(t.zPct)} %, ${n(t.primaryKv, 3)} / ${n(secKv, 3)} kV, X/R ${n(pos(t.xr) ? t.xr : DEFAULT_TRANSFORMER_XR)}`, baseKv: secKv }, pu);
    net.branches.push({ a, b, z: pu });
  }
  for (const g of sketch.generators) {
    const base = baseAt(g.busId);
    if (!base || !pos(g.kva)) { if (bus(g.busId) !== undefined) warnings.push(`Generator ${g.name || g.id} is incomplete or on a bus without voltage.`); continue; }
    const v = base.kv * 1000, xr = pos(g.xr) ? g.xr : GENERATOR_XR;
    let z: Impedance, text: string;
    if (mode === 'min' && pos(g.sustainedMultiple)) {
      const iRated = (g.kva * 1000) / (SQRT3 * v), c = isLv(base.kv) ? C_MIN_LV : C_MIN_MV;
      z = { r: (c * v) / (SQRT3 * g.sustainedMultiple * iRated), x: 0 };
      text = `sustained ${n(g.sustainedMultiple)} × rated`;
    } else if (mode === 'min') {
      const xd = pos(g.xdTransPct) ? g.xdTransPct : GENERATOR_XD_TRANSIENT_DEFAULT_PCT;
      z = transformerImpedance(g.kva, xd, v, xr); text = `X′d ${n(xd)} %`;
    } else {
      const xd = pos(g.xdSubPct) ? g.xdSubPct : GENERATOR_XD_SUBTRANSIENT_PCT;
      z = transformerImpedance(g.kva, xd, v, xr); text = `X″d ${n(xd)} %`;
    }
    const pu = asPu(z, base.zOhm);
    element({ id: g.id, kind: 'generator', name: g.name || g.id, data: `${n(g.kva)} kVA, ${text}, X/R ${n(xr)}`, baseKv: base.kv }, pu);
    shunt(g.busId, pu);
  }
  if (mode === 'max') {
    for (const m of sketch.motors) {
      const base = baseAt(m.busId);
      if (!base || !pos(m.kw)) { if (bus(m.busId) !== undefined && !(m.kw === 0)) warnings.push(`Motors ${m.id} are incomplete or on a bus without voltage.`); continue; }
      const kva = m.kw / SC_MOTOR_PF, v = base.kv * 1000;
      const zm = (v * v) / (MOTOR_LOCKED_ROTOR_MULTIPLE * kva * 1000), x = zm / Math.sqrt(1 + MOTOR_RX * MOTOR_RX);
      const pu = asPu({ r: x * MOTOR_RX, x }, base.zOhm);
      element({ id: m.id, kind: 'motors', name: `Motors ${m.id}`, data: `${n(m.kw)} kW, ${MOTOR_LOCKED_ROTOR_MULTIPLE} × rated`, baseKv: base.kv }, pu);
      shunt(m.busId, pu);
    }
  }
  for (const c of sketch.cables) {
    const a = bus(c.fromBusId), b = bus(c.toBusId);
    if (a === undefined || b === undefined) { warnings.push(`Cable ${c.id} is on a bus that does not exist.`); continue; }
    if (!pos(c.csaMm2) || !(Number.isFinite(c.lengthM) && c.lengthM >= 0) || (c.runs !== undefined && !pos(c.runs))) { warnings.push(`Cable ${c.id} has an invalid size, length or number of runs.`); continue; }
    const base = baseAt(c.fromBusId) ?? baseAt(c.toBusId);
    if (!base) continue; // no voltage: reported with the bus
    let z: Impedance;
    try { z = cableImpedance(c.csaMm2, c.lengthM, c.runs ?? 1, c.family); } catch { warnings.push(`Cable ${c.id}: no cable data for ${c.csaMm2} mm².`); continue; }
    const zPer = asPu(z, base.zOhm);
    element({ id: c.id, kind: 'cable', name: `Cable ${c.id}`, data: `${n(c.csaMm2)} mm², ${n(c.lengthM)} m${c.runs && c.runs > 1 ? `, ${c.runs} runs` : ''}`, baseKv: base.kv }, zPer);
    // Fault points inside the cable split it into chained segments.
    const here = sketch.faultPoints.filter((f) => f.cableId === c.id && pos(f.distanceM) && f.distanceM < c.lengthM).sort((p, q) => p.distanceM! - q.distanceM!);
    const list: { d: number; node: number; fpId: string }[] = [];
    let prev = a, prevD = 0;
    for (const f of here) {
      const node = nodes.length; nodes.push({ id: `${c.id}@${f.id}`, kv: base.kv });
      net.branches.push({ a: prev, b: node, z: scale(zPer, (f.distanceM! - prevD) / c.lengthM) });
      list.push({ d: f.distanceM!, node, fpId: f.id });
      prev = node; prevD = f.distanceM!;
    }
    net.branches.push({ a: prev, b, z: scale(zPer, c.lengthM > 0 ? (c.lengthM - prevD) / c.lengthM : 1) });
    net.cableNode.set(c.id, list);
  }
  return net;
}
const scale = (z: { r: number; x: number }, f: number) => ({ r: z.r * f, x: z.x * f });

/** Per-unit R + jX of every element on the sketch's base power and the base voltage of its bus. */
export function scElements(sketch: ScSketch, mode: ScMode = 'max'): { elements: ScElement[]; warnings: string[] } {
  const net = build(sketch, mode);
  return { elements: net.elements, warnings: net.warnings };
}

// ---- solver ----

type C = [number, number];
const cInv = (z: { r: number; x: number }): C => { const d = z.r * z.r + z.x * z.x; return [z.r / d, -z.x / d]; };
const cMul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cDiv = (a: C, b: C): C => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };

/** Solve Y·v = e_k by complex Gaussian elimination with partial pivoting; returns v[k], or undefined when singular. */
function thevenin(Y: C[][], k: number): C | undefined {
  const m = Y.length, A = Y.map((row, i) => [...row.map((c) => [c[0], c[1]] as C), (i === k ? [1, 0] : [0, 0]) as C]);
  for (let col = 0; col < m; col++) {
    let p = col, best = Math.hypot(...A[col][col]);
    for (let i = col + 1; i < m; i++) { const h = Math.hypot(...A[i][col]); if (h > best) { best = h; p = i; } }
    if (!(best > 1e-300)) return undefined;
    [A[col], A[p]] = [A[p], A[col]];
    for (let i = col + 1; i < m; i++) {
      const f = cDiv(A[i][col], A[col][col]);
      if (f[0] === 0 && f[1] === 0) continue;
      for (let j = col; j <= m; j++) { const t = cMul(f, A[col][j]); A[i][j] = [A[i][j][0] - t[0], A[i][j][1] - t[1]]; }
    }
  }
  const v: C[] = new Array(m);
  for (let i = m - 1; i >= 0; i--) {
    let s: C = A[i][m];
    for (let j = i + 1; j < m; j++) { const t = cMul(A[i][j], v[j]); s = [s[0] - t[0], s[1] - t[1]]; }
    v[i] = cDiv(s, A[i][i]);
  }
  return v[k];
}

export interface ScResult {
  id: string; name: string; place: string; kv: number;
  zPu: number; rPu: number; xPu: number; xr: number;
  ikMaxKa: number; ipKa: number; ikMinKa: number;
}
export interface ScSolution { baseMva: number; faultPoints: ScResult[]; buses: ScResult[]; elements: ScElement[]; warnings: string[] }

/** Thevenin impedance (p.u.) at every node of the network, or undefined for a node no source reaches. */
function theveninAll(net: Network): (PuValue | undefined)[] {
  const m = net.nodes.length, Y: C[][] = Array.from({ length: m }, () => Array.from({ length: m }, () => [0, 0] as C));
  const add = (i: number, j: number, y: C) => { Y[i][j] = [Y[i][j][0] + y[0], Y[i][j][1] + y[1]]; };
  const live = new Set<number>(), adj: number[][] = Array.from({ length: m }, () => []);
  for (const br of net.branches) {
    const z = br.z, zz = z.r * z.r + z.x * z.x < 1e-18 ? { r: 1e-9, x: 0 } : z, y = cInv(zz);
    add(br.a, br.a, y); add(br.b, br.b, y); add(br.a, br.b, [-y[0], -y[1]]); add(br.b, br.a, [-y[0], -y[1]]);
    adj[br.a].push(br.b); adj[br.b].push(br.a);
  }
  const stack: number[] = [];
  for (const s of net.shunts) {
    if (!(s.z.r * s.z.r + s.z.x * s.z.x > 0)) continue;
    add(s.node, s.node, cInv(s.z));
    if (!live.has(s.node)) { live.add(s.node); stack.push(s.node); }
  }
  while (stack.length) for (const j of adj[stack.pop()!]) if (!live.has(j)) { live.add(j); stack.push(j); }
  for (let i = 0; i < m; i++) if (!live.has(i)) add(i, i, [1, 0]); // decoupled from every source: kept regular, never reported
  return Array.from({ length: m }, (_, k) => {
    if (!live.has(k)) return undefined;
    const z = thevenin(Y, k);
    if (!z || !Number.isFinite(z[0]) || !Number.isFinite(z[1])) return undefined;
    const zz = Math.hypot(z[0], z[1]);
    return zz > 0 ? { r: z[0], x: z[1], z: zz } : undefined;
  });
}

export function solveSketch(sketch: ScSketch): ScSolution {
  const max = build(sketch, 'max'), min = build(sketch, 'min');
  const zMax = theveninAll(max), zMin = theveninAll(min);
  const warnings = [...max.warnings];
  const result = (nodeIdx: number, id: string, name: string, place: string): ScResult | undefined => {
    const kv = max.nodes[nodeIdx].kv, zx = zMax[nodeIdx], zn = zMin[nodeIdx];
    if (!zx || !zn || !(kv > 0)) { warnings.push(`${name}: no result, no source reaches it.`); return undefined; }
    const ibase = max.baseMva / (SQRT3 * kv), cMax = isLv(kv) ? C_MAX : C_MV, cMin = isLv(kv) ? C_MIN_LV : C_MIN_MV;
    const ik = (cMax * ibase) / zx.z, kappa = peakFactor(zx.r, zx.x);
    return { id, name, place, kv, zPu: zx.z, rPu: zx.r, xPu: zx.x, xr: zx.r > 0 ? zx.x / zx.r : Infinity, ikMaxKa: ik, ipKa: kappa * Math.SQRT2 * ik, ikMinKa: (cMin * ibase) / zn.z };
  };
  const buses: ScResult[] = [];
  for (const b of sketch.buses) { const r = result(max.busNode.get(b.id)!, b.id, b.name || b.id, `Bus ${b.name || b.id}`); if (r) buses.push(r); }
  const faultPoints: ScResult[] = [];
  for (const f of sketch.faultPoints) {
    let k: number | undefined, place = '';
    const nm = f.name || f.id;
    if (f.cableId) {
      const c = sketch.cables.find((x) => x.id === f.cableId);
      if (!c) { warnings.push(`Fault point ${nm} is on a cable that does not exist.`); continue; }
      const d = f.distanceM ?? 0;
      if (!(Number.isFinite(d) && d >= 0 && d <= c.lengthM)) { warnings.push(`Fault point ${nm} is not on its cable (distance ${d} m of ${c.lengthM} m).`); continue; }
      if (d === 0) k = max.busNode.get(c.fromBusId); else if (d >= c.lengthM) k = max.busNode.get(c.toBusId);
      else k = max.cableNode.get(c.id)?.find((e) => e.fpId === f.id)?.node;
      place = `Cable ${c.id}, ${n(d)} m from ${sketch.buses.find((b) => b.id === c.fromBusId)?.name || c.fromBusId}`;
    } else if (f.busId) {
      k = max.busNode.get(f.busId); place = `Bus ${sketch.buses.find((b) => b.id === f.busId)?.name || f.busId}`;
    }
    if (k === undefined) { warnings.push(`Fault point ${nm} is not on a bus or cable.`); continue; }
    const r = result(k, f.id, nm, place);
    if (r) faultPoints.push(r);
  }
  return { baseMva: max.baseMva, faultPoints, buses, elements: max.elements, warnings: [...new Set(warnings)] };
}
