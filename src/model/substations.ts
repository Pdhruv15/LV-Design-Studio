import type { DmSubstationRoom, Project, Rmu } from '../types';
import { dmType, type DmSubstationType } from '../calc/dmSubstation';
import type { Status } from '../calc/electrical';
import { rmuGrow, rmuRecord, rmuTeeOffs, rmuWays } from '../calc/hvSupply';
import { mvPlan, ssRank } from '../diagram/mvArrangement';
import { txUnits } from './earthingPlan';
import { updateRmu } from './hvSupply';
import type { DropResult } from './sldEdit';
import { mainBoards, nextRmus, rmuNames, setRmu, setSubstation, txTag } from './transformers';

/** The substations of a project and the edits of its MV arrangement (proposal 2026-11-18, part 4): the Substations card
 * in Panels → Transformers, and the SLD's right-click Substation, RMU, Configuration and Normally open. A substation is
 * the name on its main boards (`Board.substation`), so old projects open unchanged. Its type and location are the record
 * the Substation area page (DM-D-013) keeps, and the records' order is the ring order (mvArrangement ssRank). */

const key = (s: string) => s.trim().toLowerCase();
const clean = (s?: string) => s?.trim() || undefined;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
let seq = 0;
const newId = () => `ss-${Date.now().toString(36)}-${(seq++).toString(36)}`;

/** The two DM-D-013 types that hold fewer transformers than the form's 15. */
const LIMITED: Partial<Record<DmSubstationType, string>> = { pocket: 'POCKET type', 'conventional-open': 'Open roof' };

export interface SubstationRmu {
  name: string;
  config?: string;
  tOff?: Rmu['tOff'];
  fuseA?: number;
  normallyOpen?: Rmu['normallyOpen'];
  owner?: Rmu['owner'];
  /** The main boards whose transformers it feeds. */
  feeds: string[];
  /** Tee-offs of its configuration with no transformer. */
  spares: number;
}
export interface SubstationCheck { status: Status; text: string }
export interface SubstationRow {
  name: string;
  record?: DmSubstationRoom;
  /** The ring it is on (an index into mvPlan's rings); undefined while nothing of it is on the SLD. */
  ring?: number;
  rmus: SubstationRmu[];
  /** Main boards with their transformer, in the SLD's order. */
  transformers: string[];
  checks: SubstationCheck[];
}

/** Every substation in ring order, as the SLD draws them: the ones on a ring first, ring by ring, then the ones nothing
 * is drawn of yet (a record or an RMU with no transformer), in their records' order. Each row has its RMUs (with
 * their spare tee-offs), its transformers and its checks. */
export function substationRows(project: Project): SubstationRow[] {
  const plan = mvPlan(project);
  const recs = project.substations ?? [];
  const rows: SubstationRow[] = [];
  const byKey = new Map<string, SubstationRow>();
  const row = (name: string, ring?: number) => {
    let r = byKey.get(key(name));
    if (!r) { r = { name: name.trim(), record: recs.find((s) => key(s.name) === key(name)), ring, rmus: [], transformers: [], checks: [] }; byKey.set(key(name), r); rows.push(r); }
    return r;
  };
  const units = txUnits(project);
  const unitsOf = (ids: string[]) => ids.reduce((s, id) => s + (units.get(id) ?? 1), 0);
  plan.rings.forEach((ring, ri) => {
    for (const it of ring.items) {
      if (it.substation === undefined) continue;
      const r = row(it.substation, ri);
      if (it.kind === 'tap') { r.transformers.push(it.boardId); continue; }
      const feeds = it.tees.filter((t): t is string => !!t);
      const rec = rmuRecord(project, it.name);
      const tOffs = it.config ? rmuWays(it.config).tOff : undefined;
      r.rmus.push({ name: it.name, config: it.config, tOff: it.tOff, fuseA: it.fuseA, normallyOpen: it.normallyOpen, owner: rec?.owner, feeds, spares: tOffs === undefined ? 0 : Math.max(0, tOffs - unitsOf(feeds)) });
      r.transformers.push(...feeds);
    }
  });
  // RMUs that feed no transformer yet, in the substation their record names: the ones mvPlan holds are listed above.
  const inUse = new Set([...rmuNames(project), ...plan.rings.flatMap((r) => r.items.flatMap((it) => (it.kind === 'rmu' ? [it.name] : [])))]);
  for (const rec of project.rmus ?? []) {
    const ss = clean(rec.substation);
    if (!ss || inUse.has(rec.name)) continue;
    const config = rec.config?.trim().toUpperCase() || undefined;
    const ringWays = config ? Math.max(1, rmuWays(config).ring) : 2; // as mvPlan draws it
    row(ss).rmus.push({ name: rec.name, config, tOff: rec.tOff, fuseA: rec.fuseA, normallyOpen: ringWays >= 2 ? rec.normallyOpen : undefined, owner: rec.owner, feeds: [], spares: config ? rmuWays(config).tOff : 0 });
  }
  for (const s of recs) if (s.name.trim()) row(s.name);
  const rank = ssRank(project);
  const out = [...rows.filter((r) => r.ring !== undefined), ...rows.filter((r) => r.ring === undefined).sort((a, b) => rank(a.name) - rank(b.name))];
  // Normally open points per ring: more than one leaves the RMUs between them without supply.
  const nops = new Map<number, number>();
  for (const r of out) if (r.ring !== undefined) nops.set(r.ring, (nops.get(r.ring) ?? 0) + r.rmus.filter((m) => m.normallyOpen && m.feeds.length).length);
  const byId = new Map(project.boards.map((b) => [b.id, b]));
  for (const r of out) r.checks = checksOf(project, r, unitsOf, byId, r.ring !== undefined ? nops.get(r.ring) ?? 0 : 0);
  return out;
}

function checksOf(project: Project, r: SubstationRow, unitsOf: (ids: string[]) => number, byId: Map<string, { substation?: string }>, ringNops: number): SubstationCheck[] {
  const checks: SubstationCheck[] = [];
  const n = unitsOf(r.transformers);
  // The DM-D-013 type: a POCKET type takes 2 transformers, an open roof substation 1, the form covers 15.
  if (r.record) {
    const t = dmType(r.record.type), short = LIMITED[r.record.type];
    if (n > t.maxTransformers) checks.push({ status: 'bad', text: short ? `${plural(n, 'transformer')}: ${short} takes ${t.maxTransformers}` : `${plural(n, 'transformer')}: the DM-D-013 form covers ${t.maxTransformers}` });
    else if (short) checks.push({ status: 'ok', text: `${short}: up to ${plural(t.maxTransformers, 'transformer')}` });
    if (n && r.record.transformers !== n && n <= t.maxTransformers) checks.push({ status: 'warn', text: `Substation area form: ${plural(r.record.transformers, 'transformer')}` });
  }
  // Tee-offs: an RMU with more transformers than its configuration has tee-offs, else what is free.
  const withConfig = r.rmus.filter((m) => m.config);
  const over = withConfig.filter((m) => unitsOf(m.feeds) > rmuWays(m.config!).tOff);
  for (const m of over) checks.push({ status: 'bad', text: `${m.name}: ${plural(unitsOf(m.feeds), 'transformer')} on ${plural(rmuWays(m.config!).tOff, 'tee-off')}` });
  if (withConfig.length && !over.length) {
    const spares = withConfig.reduce((s, m) => s + m.spares, 0);
    const total = withConfig.reduce((s, m) => s + rmuWays(m.config!).tOff, 0);
    checks.push({ status: 'ok', text: spares ? `${plural(spares, 'tee-off')} spare` : `${total - spares} of ${plural(total, 'tee-off')} used` });
  }
  // An RMU feeding transformers named in another substation (it is drawn in the first one's).
  for (const m of r.rmus) {
    const others = [...new Set(m.feeds.map((id) => clean(byId.get(id)?.substation)).filter((s) => !s || key(s) !== key(r.name)).map((s) => s ?? 'no substation'))];
    if (others.length) checks.push({ status: 'warn', text: `${m.name} also feeds ${others.join(', ')}` });
  }
  if (ringNops > 1 && r.rmus.some((m) => m.normallyOpen && m.feeds.length)) checks.push({ status: 'warn', text: `${ringNops} normally open points on this ring` });
  return checks;
}

/** The substation names in ring order (the right-click Substation list). */
export const substationNames = (project: Project): string[] => substationRows(project).map((r) => r.name);

/** Next free "SS-n" name. */
export function newSubstationName(project: Project): string {
  const used = new Set([...substationRows(project).map((r) => key(r.name)), ...project.boards.map((b) => key(b.substation ?? ''))]);
  let n = Math.max(0, ...[...used].map((x) => Number(/^ss-(\d+)$/.exec(x)?.[1] ?? 0)));
  let name: string;
  do { name = `SS-${++n}`; } while (used.has(key(name)));
  return name;
}

/** Every substation as a record, in the card's order (a new record for a name that has none, with its transformer count
 * for the DM-D-013 form): the first edit on the card keeps the order it shows. Records of no row stay, last. */
function pinned(project: Project, rows: SubstationRow[]): DmSubstationRoom[] {
  const units = txUnits(project);
  const used = new Set<DmSubstationRoom>();
  const out = rows.map((r): DmSubstationRoom => {
    if (r.record) { used.add(r.record); return r.record; }
    return { id: newId(), name: r.name, type: 'conventional', transformers: Math.max(1, r.transformers.reduce((s, id) => s + (units.get(id) ?? 1), 0)) };
  });
  return [...out, ...(project.substations ?? []).filter((s) => !used.has(s))];
}

/** + Substation: a new record after the others (conventional, one transformer on its DM-D-013 form). */
export function addSubstation(project: Project): { project: Project; name: string } {
  const name = newSubstationName(project);
  return { project: { ...project, substations: [...pinned(project, substationRows(project)), { id: newId(), name, type: 'conventional', transformers: 1 }] }, name };
}

/** A substation's type or location (its record, made on the first change); a blank location is dropped. */
export function updateSubstation(project: Project, name: string, patch: { type?: DmSubstationType; building?: string }): Project {
  const substations = pinned(project, substationRows(project)).map((s) => {
    if (key(s.name) !== key(name)) return s;
    const next: DmSubstationRoom = { ...s, ...(patch.type ? { type: patch.type } : {}) };
    if ('building' in patch) { const { building: _b, ...rest } = next; return patch.building?.trim() ? { ...rest, building: patch.building.trim() } : rest; }
    return next;
  });
  return { ...project, substations };
}

/** Whether row i can move one place up (-1) or down (1): only next to a substation on the same ring, or among the ones not
 * on the SLD yet. */
export function canMoveSubstation(rows: SubstationRow[], i: number, dir: -1 | 1): boolean {
  const j = i + dir;
  return i >= 0 && j >= 0 && j < rows.length && rows[i].ring === rows[j].ring;
}

/** ▲ ▼: one place earlier or later in ring order (the SLD draws them in this order). */
export function moveSubstation(project: Project, name: string, dir: -1 | 1): Project {
  const rows = substationRows(project);
  const i = rows.findIndex((r) => key(r.name) === key(name));
  if (!canMoveSubstation(rows, i, dir)) return project;
  const order = [...rows];
  [order[i], order[i + dir]] = [order[i + dir], order[i]];
  return { ...project, substations: pinned(project, order) };
}

/** Rename a substation on its main boards, its RMU records and its record; refused when another has the name. */
export function renameSubstation(project: Project, from: string, to: string): { project: Project; problem?: string } {
  const t = to.trim();
  if (!t || t === from.trim()) return { project };
  if (substationRows(project).some((r) => key(r.name) === key(t) && key(r.name) !== key(from))) return { project, problem: `${t} is already a substation` };
  const same = (s?: string) => !!s && key(s) === key(from);
  return {
    project: {
      ...project,
      boards: project.boards.map((b) => (same(b.substation) ? { ...b, substation: t } : b)),
      ...(project.rmus ? { rmus: project.rmus.map((r) => (same(r.substation) ? { ...r, substation: t } : r)) } : {}),
      ...(project.substations ? { substations: project.substations.map((s) => (same(s.name) ? { ...s, name: t } : s)) } : {})
    }
  };
}

/** The owner of a substation's equipment: set on each of its RMUs (the RMU table's Owner). */
export function setSubstationOwner(project: Project, name: string, owner: Rmu['owner']): Project {
  const row = substationRows(project).find((r) => key(r.name) === key(name));
  return (row?.rmus ?? []).reduce((p, m) => updateRmu(p, m.name, { owner }), project);
}

/** + RMU: a new RMU in this substation, feeding no transformer yet; it starts as RRT. */
export function addRmuTo(project: Project, substation: string): { project: Project; name: string } {
  const name = nextRmus(project, 1)[0];
  return { project: updateRmu(project, name, { config: 'RRT', substation: substation.trim() }), name };
}

// ---- One transformer's RMU and substation (the transformer table and right-click on the SLD) ----------------------

export interface RmuChoice {
  name: string;
  config?: string;
  /** Transformer units on it with this one (when it is on it already) or without. */
  count: number;
  max: number;
  /** This transformer is on it now. */
  current: boolean;
  /** It cannot take this transformer as it is. */
  full: boolean;
  /** The configuration it would become to take it (RRT → RRTT, RRTT → RRTTT). */
  grow?: string;
}

/** The RMUs a transformer can go on: the ones in use, then the records that feed no transformer yet. A board with
 * N+1 transformers counts its units (txUnits, which a table of transformers works out once and passes in). */
export function rmuChoices(project: Project, mainId: string, units: Map<string, number> = txUnits(project)): RmuChoice[] {
  const u = (id: string) => units.get(id) ?? 1;
  const me = project.boards.find((b) => b.id === mainId);
  const need = u(mainId);
  const txs = mainBoards(project).filter((b) => b.sourceKva);
  const names = [...new Set([...rmuNames(project), ...(project.rmus ?? []).map((r) => r.name)])];
  return names.map((name) => {
    const current = clean(me?.rmu) === name;
    const others = txs.filter((b) => clean(b.rmu) === name && b.id !== mainId).reduce((s, b) => s + u(b.id), 0);
    const max = rmuTeeOffs(project, name);
    const config = rmuRecord(project, name)?.config?.trim().toUpperCase() || undefined;
    const full = others + need > max;
    const g = full && !current ? rmuGrow(config) : undefined;
    return { name, config, count: others + (current ? need : 0), max, current, full, ...(g && others + need <= rmuWays(g).tOff ? { grow: g } : {}) };
  });
}

/** Short text of a choice: "RMU-5 · RRTT · 1 free", "RMU-1 · RRT → RRTT", "RMU-2 · RRT · full". */
export function rmuChoiceText(c: RmuChoice): string {
  const head = [c.name, c.config].filter(Boolean).join(' · ');
  if (c.current) return head;
  if (c.grow) return `${head} → ${c.grow}`;
  return c.full ? `${head} · full` : `${head} · ${c.max - c.count} free`;
}

/** The substation an RMU is in for a transformer joining it: its first other transformer's, else its record's. */
function rmuSubstation(project: Project, rmu: string, except: string): string | undefined {
  const first = mainBoards(project).find((b) => clean(b.rmu) === rmu && b.id !== except);
  return first ? clean(first.substation) ?? clean(rmuRecord(project, rmu)?.substation) : clean(rmuRecord(project, rmu)?.substation);
}

/** Put a transformer on an RMU ('' none, '+' a new one, which starts as RRT). A full RRT or RRTT unit becomes RRTT or
 * RRTTT; the transformer joins the RMU's substation. */
export function txRmu(project: Project, mainId: string, value: string): DropResult {
  const b = project.boards.find((x) => x.id === mainId);
  const tag = txTag(project, mainId) ?? mainId;
  if (!b) return { project, message: '' };
  if (!value) return { project: setRmu(project, mainId, undefined), message: `${tag} is on no RMU now` };
  if (value === '+') {
    const name = nextRmus(project, 1)[0];
    return { project: setRmu(updateRmu(project, name, { config: 'RRT' }), mainId, name), message: `${tag} now on a new RMU, ${name} (RRT)` };
  }
  const c = rmuChoices(project, mainId).find((x) => x.name === value);
  if (!c || c.current) return { project, message: c ? `${tag} is on ${value} already` : `No RMU ${value}` };
  if (c.full && !c.grow) return { project, message: `${value} is full: ${c.count} of ${plural(c.max, 'tee-off')} in use` };
  let p = setRmu(project, mainId, value);
  const said = [`${tag} now on ${value}`];
  if (c.grow) { p = updateRmu(p, value, { config: c.grow }); said.push(`${value} is now ${c.grow}`); }
  const ss = rmuSubstation(project, value, mainId);
  if (ss && ss !== clean(b.substation)) { p = setSubstation(p, mainId, ss); said.push(`in ${ss}`); }
  return { project: p, message: said.join(' · ') };
}

/** Put a transformer in a substation ('' none). An RMU it shares with transformers that stay lets it go; an RMU of its
 * own goes with it. */
export function txSubstation(project: Project, mainId: string, name: string): DropResult {
  const b = project.boards.find((x) => x.id === mainId);
  const tag = txTag(project, mainId) ?? mainId;
  const to = name.trim();
  if (!b) return { project, message: '' };
  if (key(to) === key(b.substation ?? '')) return { project, message: to ? `${tag} is in ${to} already` : `${tag} is in no substation` };
  let p = setSubstation(project, mainId, to);
  const said = [to ? `${tag} is now in ${to}` : `${tag} is in no substation now`];
  const rmu = clean(b.rmu);
  if (rmu) {
    const shared = mainBoards(project).some((x) => x.id !== mainId && clean(x.rmu) === rmu);
    if (shared) { p = setRmu(p, mainId, undefined); said.push(`off ${rmu}, which stays`); }
    else if (rmuRecord(project, rmu)?.substation) p = updateRmu(p, rmu, { substation: to || undefined });
  }
  return { project: p, message: said.join(' · ') };
}

/** An RMU's configuration; one with a single ring switch keeps no normally open point. */
export function rmuConfig(project: Project, name: string, config: string): DropResult {
  let p = updateRmu(project, name, { config });
  if (rmuWays(config).ring < 2 && rmuRecord(p, name)?.normallyOpen) p = updateRmu(p, name, { normallyOpen: undefined });
  return { project: p, message: `${name} is now ${config}` };
}

/** An RMU's normally open ring switch (none, R1 or R2). */
export function rmuNormallyOpen(project: Project, name: string, way: Rmu['normallyOpen']): DropResult {
  return { project: updateRmu(project, name, { normallyOpen: way }), message: way ? `${name}: ${way} normally open` : `${name}: no normally open switch` };
}
