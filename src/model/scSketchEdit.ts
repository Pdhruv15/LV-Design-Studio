import { DEFAULT_FAMILY } from '../calc/cableFamily';
import { busVoltagesKv, type ScSketch } from '../calc/scSketch';

// Edits and drawing layout of a short circuit sketch (src/calc/scSketch.ts): pure functions, no screen code.

export type ScKind = 'bus' | 'source' | 'transformer' | 'cable' | 'generator' | 'motors' | 'fault';
export interface ScSel { kind: ScKind; id: string }
export interface ScEdit { sketch: ScSketch; sel: ScSel }

export const SC_DEFAULTS = {
  source: { kv: 11, faultMva: 500, xr: 10 },
  transformer: { kva: 1000, secondaryKv: 0.415, zPct: 5, vectorGroup: 'Dyn11' },
  cable: { csaMm2: 240, lengthM: 50, runs: 1 },
  generator: { kva: 800, xdSubPct: 15, xdTransPct: 25 },
  motors: { kw: 100 }
};

export const newSketchId = (list: ScSketch[]): string => {
  let i = list.length + 1;
  while (list.some((s) => s.id === `SK${i}`)) i++;
  return `SK${i}`;
};
export const emptySketch = (list: ScSketch[]): ScSketch => {
  let i = list.length + 1;
  while (list.some((s) => s.name === `Sketch ${i}`)) i++;
  return { id: newSketchId(list), name: `Sketch ${i}`, buses: [], sources: [], transformers: [], cables: [], generators: [], motors: [], faultPoints: [] };
};

/** The next free id with this prefix (B1, B2…); `taken` are the ids already used. */
const nextIn = (prefix: string, taken: string[]): string => {
  let i = 1;
  while (taken.includes(`${prefix}${i}`)) i++;
  return `${prefix}${i}`;
};
const nextBus = (s: ScSketch) => nextIn('B', s.buses.flatMap((b) => [b.id, b.name]));

const busKv = (s: ScSketch, busId: string): number => busVoltagesKv(s).kv.get(busId) ?? SC_DEFAULTS.source.kv;

/** The first item of an empty sketch: a bus with the source on it. Undefined when the sketch already has buses. */
export function addSource(s: ScSketch): ScEdit | undefined {
  if (s.buses.length) return undefined;
  const d = SC_DEFAULTS.source, bus = nextBus(s), id = nextIn('S', s.sources.map((x) => x.id));
  return { sketch: { ...s, buses: [{ id: bus, name: bus }], sources: [{ id, busId: bus, kv: d.kv, faultMva: d.faultMva, xr: d.xr }] }, sel: { kind: 'source', id } };
}

export function addTransformer(s: ScSketch, busId: string): ScEdit | undefined {
  if (!s.buses.some((b) => b.id === busId)) return undefined;
  const d = SC_DEFAULTS.transformer, bus = nextBus(s), n = nextIn('T', s.transformers.map((t) => t.id)), name = `TX-${n.slice(1)}`;
  return {
    sketch: { ...s, buses: [...s.buses, { id: bus, name: bus }], transformers: [...s.transformers, { id: n, name, fromBusId: busId, toBusId: bus, kva: d.kva, primaryKv: busKv(s, busId), secondaryKv: d.secondaryKv, zPct: d.zPct, vectorGroup: d.vectorGroup }] },
    sel: { kind: 'transformer', id: n }
  };
}

export function addCable(s: ScSketch, busId: string): ScEdit | undefined {
  if (!s.buses.some((b) => b.id === busId)) return undefined;
  const d = SC_DEFAULTS.cable, bus = nextBus(s), id = nextIn('C', s.cables.map((c) => c.id));
  return { sketch: { ...s, buses: [...s.buses, { id: bus, name: bus }], cables: [...s.cables, { id, fromBusId: busId, toBusId: bus, csaMm2: d.csaMm2, family: { ...DEFAULT_FAMILY }, lengthM: d.lengthM, runs: d.runs }] }, sel: { kind: 'cable', id } };
}

export function addGenerator(s: ScSketch, busId: string): ScEdit | undefined {
  if (!s.buses.some((b) => b.id === busId)) return undefined;
  const d = SC_DEFAULTS.generator, id = nextIn('G', s.generators.map((g) => g.id));
  return { sketch: { ...s, generators: [...s.generators, { id, name: `GEN-${id.slice(1)}`, busId, kva: d.kva, xdSubPct: d.xdSubPct, xdTransPct: d.xdTransPct }] }, sel: { kind: 'generator', id } };
}

export function addMotors(s: ScSketch, busId: string): ScEdit | undefined {
  if (!s.buses.some((b) => b.id === busId)) return undefined;
  const id = nextIn('M', s.motors.map((m) => m.id));
  return { sketch: { ...s, motors: [...s.motors, { id, busId, kw: SC_DEFAULTS.motors.kw }] }, sel: { kind: 'motors', id } };
}

/** A fault point on the selected bus, or at the end of the selected cable (its distance is edited in the form). */
export function addFault(s: ScSketch, at: ScSel): ScEdit | undefined {
  const id = nextIn('F', s.faultPoints.map((f) => f.id));
  let point;
  if (at.kind === 'bus' && s.buses.some((b) => b.id === at.id)) point = { id, name: id, busId: at.id };
  else if (at.kind === 'cable') { const c = s.cables.find((x) => x.id === at.id); if (c) point = { id, name: id, cableId: c.id, distanceM: c.lengthM }; }
  if (!point) return undefined;
  return { sketch: { ...s, faultPoints: [...s.faultPoints, point] }, sel: { kind: 'fault', id } };
}

/** Everything that hangs below a bus (through transformers and cables), the bus included. */
function below(s: ScSketch, busId: string, buses = new Set<string>(), cables = new Set<string>(), trs = new Set<string>()) {
  if (buses.has(busId)) return { buses, cables, trs };
  buses.add(busId);
  for (const c of s.cables) if (c.fromBusId === busId && !cables.has(c.id)) { cables.add(c.id); below(s, c.toBusId, buses, cables, trs); }
  for (const t of s.transformers) if (t.fromBusId === busId && !trs.has(t.id)) { trs.add(t.id); below(s, t.toBusId, buses, cables, trs); }
  return { buses, cables, trs };
}

/** How many items go with this one: the item itself and everything below a bus, cable or transformer. */
export function deleteCount(s: ScSketch, sel: ScSel): number {
  return s.buses.length + s.sources.length + s.transformers.length + s.cables.length + s.generators.length + s.motors.length + s.faultPoints.length
    - (() => { const r = deleteItem(s, sel); return r.buses.length + r.sources.length + r.transformers.length + r.cables.length + r.generators.length + r.motors.length + r.faultPoints.length; })();
}

/** Deletes an item. A bus, source, transformer or cable takes everything below it along (buses, branches, and the
 * generators, motors and fault points on them). */
export function deleteItem(s: ScSketch, sel: ScSel): ScSketch {
  if (sel.kind === 'generator') return { ...s, generators: s.generators.filter((x) => x.id !== sel.id) };
  if (sel.kind === 'motors') return { ...s, motors: s.motors.filter((x) => x.id !== sel.id) };
  if (sel.kind === 'fault') return { ...s, faultPoints: s.faultPoints.filter((x) => x.id !== sel.id) };
  let root: string | undefined; const cut: { cables: Set<string>; trs: Set<string> } = { cables: new Set(), trs: new Set() };
  if (sel.kind === 'bus') root = sel.id;
  else if (sel.kind === 'source') root = s.sources.find((x) => x.id === sel.id)?.busId;
  else if (sel.kind === 'cable') { const c = s.cables.find((x) => x.id === sel.id); root = c?.toBusId; cut.cables.add(sel.id); }
  else { const t = s.transformers.find((x) => x.id === sel.id); root = t?.toBusId; cut.trs.add(sel.id); }
  if (root === undefined) return s;
  const r = below(s, root);
  r.cables.forEach((c) => cut.cables.add(c)); r.trs.forEach((t) => cut.trs.add(t));
  // The branch that feeds a deleted bus goes too, so none is left pointing at nothing.
  s.cables.forEach((c) => { if (r.buses.has(c.toBusId)) cut.cables.add(c.id); });
  s.transformers.forEach((t) => { if (r.buses.has(t.toBusId)) cut.trs.add(t.id); });
  return {
    ...s,
    buses: s.buses.filter((b) => !r.buses.has(b.id)),
    sources: s.sources.filter((x) => !r.buses.has(x.busId)),
    transformers: s.transformers.filter((t) => !cut.trs.has(t.id)),
    cables: s.cables.filter((c) => !cut.cables.has(c.id)),
    generators: s.generators.filter((g) => !r.buses.has(g.busId)),
    motors: s.motors.filter((m) => !r.buses.has(m.busId)),
    faultPoints: s.faultPoints.filter((f) => !(f.busId && r.buses.has(f.busId)) && !(f.cableId && cut.cables.has(f.cableId)))
  };
}

// ---- layout ----

export const LAYOUT = { top: 110, gap: 190, leafW: 130, branchW: 270, faultStep: 150, labelW: 130 };

export interface LBus { id: string; x0: number; x1: number; y: number; inX: number }
export interface LBranch { kind: 'transformer' | 'cable'; id: string; x: number; y1: number; y2: number }
export interface LLeaf { kind: 'generator' | 'motors'; id: string; x: number; y: number }
export interface LFault { id: string; x: number; y: number; onCable: boolean }
export interface LSource { id: string; x: number; y: number }
export interface Layout { buses: LBus[]; branches: LBranch[]; leaves: LLeaf[]; faults: LFault[]; sources: LSource[]; width: number; height: number }

/** Automatic tree layout from the source down: a bus is a horizontal bar, branches go down from it, generators and
 * motors hang from it, fault points sit on it (or on the line of a cable). Meshed links to a bus that is already
 * drawn are not drawn. */
export function layoutSketch(s: ScSketch): Layout {
  const L = LAYOUT, out: Layout = { buses: [], branches: [], leaves: [], faults: [], sources: [], width: 0, height: 0 };
  const busIds = new Set(s.buses.map((b) => b.id));
  const kids = (id: string) => [
    ...s.transformers.filter((t) => t.fromBusId === id && busIds.has(t.toBusId)).map((t) => ({ kind: 'transformer' as const, id: t.id, to: t.toBusId })),
    ...s.cables.filter((c) => c.fromBusId === id && busIds.has(c.toBusId)).map((c) => ({ kind: 'cable' as const, id: c.id, to: c.toBusId }))
  ];
  const leavesOf = (id: string): { kind: 'generator' | 'motors'; id: string }[] => [
    ...s.generators.filter((g) => g.busId === id).map((g) => ({ kind: 'generator' as const, id: g.id })),
    ...s.motors.filter((m) => m.busId === id).map((m) => ({ kind: 'motors' as const, id: m.id }))
  ];
  const faultsOf = (id: string) => s.faultPoints.filter((f) => f.busId === id);
  // The tree: each bus is drawn once, under the first branch that reaches it.
  const children = new Map<string, ReturnType<typeof kids>>(), seen = new Set<string>(), width = new Map<string, number>();
  const hasParent = new Set([...s.transformers.map((t) => t.toBusId), ...s.cables.map((c) => c.toBusId)]);
  const roots = [...s.buses.filter((b) => !hasParent.has(b.id)).map((b) => b.id), ...s.buses.filter((b) => hasParent.has(b.id)).map((b) => b.id)];
  const measure = (id: string): number => {
    seen.add(id);
    const list = kids(id).filter((k) => !seen.has(k.to));
    children.set(id, list);
    const cols = list.reduce((a, k) => a + Math.max(L.branchW, measure(k.to)), 0) + leavesOf(id).length * L.leafW;
    const top = faultsOf(id).length + Math.max(0, s.sources.filter((x) => x.busId === id).length - 1);
    const bar = Math.max(cols - 50, top ? 80 + (top - 1) * L.faultStep + 110 : 170, 170);
    const w = bar + L.labelW;
    width.set(id, w);
    return w;
  };
  const placed = new Set<string>();
  let maxDepth = 0;
  const place = (id: string, x0: number, depth: number) => {
    placed.add(id);
    maxDepth = Math.max(maxDepth, depth);
    const w = width.get(id)!, y = L.top + depth * L.gap, x1 = x0 + w - L.labelW;
    out.buses.push({ id, x0, x1, y, inX: x0 + 40 });
    let cursor = x0;
    for (const k of children.get(id) ?? []) {
      const cw = Math.max(L.branchW, width.get(k.to)!);
      out.branches.push({ kind: k.kind, id: k.id, x: cursor + 40, y1: y, y2: y + L.gap });
      place(k.to, cursor, depth + 1);
      cursor += cw;
    }
    for (const g of leavesOf(id)) { out.leaves.push({ kind: g.kind, id: g.id, x: cursor + 40, y }); cursor += L.leafW; }
    faultsOf(id).forEach((f, i) => out.faults.push({ id: f.id, x: x0 + 80 + i * L.faultStep, y, onCable: false }));
    const nf = faultsOf(id).length;
    s.sources.filter((x) => x.busId === id).forEach((src, i) => out.sources.push({ id: src.id, x: i === 0 ? x0 + 40 : x0 + 80 + (nf + i - 1) * L.faultStep, y }));
  };
  let x = 20;
  for (const r of roots) {
    if (seen.has(r)) continue;
    const w = measure(r);
    place(r, x, 0);
    x += Math.max(w, L.branchW);
  }
  for (const f of s.faultPoints) {
    if (!f.cableId) continue;
    const br = out.branches.find((b) => b.kind === 'cable' && b.id === f.cableId), c = s.cables.find((q) => q.id === f.cableId);
    if (!br || !c) continue;
    const frac = c.lengthM > 0 ? Math.min(1, Math.max(0, (f.distanceM ?? 0) / c.lengthM)) : 1;
    out.faults.push({ id: f.id, x: br.x, y: Math.max(br.y1 + 12, br.y1 + frac * (br.y2 - br.y1)), onCable: true });
  }
  out.width = Math.max(x, 400);
  out.height = L.top + maxDepth * L.gap + 110;
  return out;
}
