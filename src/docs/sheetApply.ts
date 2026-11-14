import { circuitWatts } from '../calc/loadSchedule';
import { addCircuit, updateCircuit } from '../model/schedule';
import type { SheetLink, Sheet } from '../model/sheets';
import type { PointType, Project } from '../types';
import { applySheetEdits, buildDbSheet, isEditable, isItemizedCell, type DbSheet, type SheetColKey, type SheetEdit } from './dbSheet';
import { loadScheduleRows } from './loadScheduleDoc';
import { rowReasons } from './scheduleCheck';
import { LINK_FIELDS } from './sheetLink';

/** Apply to project: what was typed in a linked sheet goes to the project through the same edits the Load schedule tab makes
 * (applySheetEdits, addCircuit, updateCircuit), so the same checks, sizing and refusals apply. No ExcelJS here. */

const COLUMN: Record<string, SheetColKey> = { 'row.mcb': 'mcb', 'row.wire': 'wire', 'row.ecc': 'ecc', 'row.room': 'room', 'row.remarks': 'remarks', 'row.length': 'length' };
const columnOf = (field: string): SheetColKey | undefined => (field.startsWith('row.points.') ? `pt:${field.slice(11)}` as SheetColKey : COLUMN[field]);
const labelOf = (field: string) => LINK_FIELDS.find((f) => f.key === field)?.label ?? field;
const keyOf = (f: { uid?: string; id: string }) => f.uid ?? f.id;
const rowKey = (r: DbSheet['rows'][number]) => (r.type === 'circuit' ? keyOf(r.feeder) : r.type === 'spare' ? `spare:${r.spare.id}` : undefined);
const LIGHT = /\b(light|lights|lighting|ltg|lamp|lamps)\b/i;

interface Ref { cell?: string; row?: number; text: string }
interface Run { project: Project; sheet: Sheet; changed: number; added: number; rejected: string[]; refs: Ref[]; newKeys: Record<number, string> }

function run(project: Project, sheet: Sheet): Run {
  const none: Run = { project, sheet, changed: 0, added: 0, rejected: [], refs: [], newKeys: {} };
  const link = sheet.link, boardId = link?.boardId, board = project.boards.find((b) => b.id === boardId);
  if (!link || !boardId || !board) return none;
  const pend = link.pending ?? {}, news = link.added ?? [];
  const hasText = (o: Record<string, string>) => Object.values(o).some((t) => t.trim() !== '');
  if (!Object.keys(pend).length && !news.some(hasText)) return none;
  const refs: Ref[] = [], rejected: string[] = [];
  const reject = (ref: Ref) => { refs.push(ref); rejected.push(ref.cell ? `${ref.cell}: ${ref.text}` : ref.text); };

  /** One row's typed texts, each tested alone against the table: the edits that pass, the typed load, the letters that passed. */
  const prepare = (p: Project, tbl: DbSheet, key: string, typed: Record<string, string>, cellOf: (letters: string) => string) => {
    const good: SheetEdit[] = [], ok = new Set<string>();
    let watts: number | undefined;
    const y = tbl.rows.findIndex((r) => rowKey(r) === key);
    for (const [letters, text] of Object.entries(typed)) {
      const field = link.columns[letters], cell = cellOf(letters);
      if (!field || field === 'own' || y < 0) continue;
      if (field === 'row.watts') {
        const n = Number(text.trim().replace(',', '.'));
        if (text.trim() !== '' && Number.isFinite(n) && n > 0) { watts = n; ok.add(letters); } else reject({ cell, text: `"${text}" is not a load in watts` });
        continue;
      }
      const ck = columnOf(field), x = tbl.sheetCols.findIndex((c) => c.key === ck);
      if (x < 0) { reject({ cell, text: `${labelOf(field)} is not a column of this DB` }); continue; }
      const row = tbl.rows[y];
      if (row.type === 'spare' && row.spare.kind === 'space' && ck === 'mcb') { reject({ cell, text: 'a space has no breaker' }); continue; }
      if (!isItemizedCell(tbl, y, x) && !isEditable(tbl, y, x)) { reject({ cell, text: `${labelOf(field)} cannot be changed on this row` }); continue; }
      const e: SheetEdit = { y, x, value: text }, r = applySheetEdits(p, tbl, [e]);
      if (r.rejected.length) reject({ cell, text: r.rejected[0].replace(/^[A-Z]+\d+: /, '') }); else { good.push(e); ok.add(letters); }
    }
    return { good, ok, watts };
  };
  /** A typed load: one load item for the whole circuit, named by its description. */
  const setWatts = (p: Project, key: string, w: number): Project => {
    const f = p.feeders.find((x) => keyOf(x) === key);
    if (!f || Math.round(circuitWatts(f, board)) === Math.round(w)) return p;
    const name = (f.room || f.name || '').trim() || 'Load';
    return updateCircuit(p, f.id, { points: {}, loadItems: [{ name, pointType: (LIGHT.test(name) ? 'ltg' : 'spare1') as PointType, quantity: 1, unitWatts: w }] });
  };

  // Board rows.
  let p = project;
  const tbl0 = buildDbSheet(project, boardId), done: Record<string, Set<string>> = {}, edits: SheetEdit[] = [], loads: [string, number][] = [];
  for (const [key, typed] of Object.entries(pend)) {
    const at = link.rows.indexOf(key);
    if (at < 0) continue;
    const r = prepare(project, tbl0, key, typed, (l) => `${l}${link.firstRow + at}`);
    done[key] = r.ok;
    edits.push(...r.good);
    if (r.watts !== undefined) loads.push([key, r.watts]);
  }
  p = applySheetEdits(p, tbl0, edits).project;
  for (const [key, w] of loads) p = setWatts(p, key, w);

  // New rows, each made on a trial first: a row with a value that fails is not made.
  const made: Record<number, string> = {};
  news.forEach((o, a) => {
    if (!hasText(o)) return;
    const at = link.rows.indexOf(`new:${a}`), sheetRow = link.firstRow + (at >= 0 ? at : link.rows.filter((k) => !k.startsWith('new:')).length + a);
    const wants = Object.entries(o).some(([l, t]) => { const f = link.columns[l]; return t.trim() !== '' && (f === 'row.room' || f === 'row.watts' || (f?.startsWith('row.points.') && Number(t) > 0)); });
    if (!wants) { reject({ row: a, text: `Row ${sheetRow}: give a description or a load` }); return; }
    let trial: { project: Project; id: string };
    try { trial = addCircuit(p, boardId); } catch { reject({ row: a, text: `Row ${sheetRow}: no free way on ${boardId}` }); return; }
    const key = keyOf(trial.project.feeders.find((f) => f.id === trial.id)!), tbl = buildDbSheet(trial.project, boardId);
    const before = rejected.length, r = prepare(trial.project, tbl, key, o, (l) => `${l}${sheetRow}`);
    if (rejected.length > before) return;
    p = applySheetEdits(trial.project, tbl, r.good).project;
    if (r.watts !== undefined) p = setWatts(p, key, r.watts);
    made[a] = key;
  });
  const addedN = Object.keys(made).length;
  const changedKeys = Object.keys(done).filter((k) => done[k].size);
  if (!changedKeys.length && !addedN) return { ...none, rejected, refs };

  // The sheet: applied values leave, rejected ones stay; a made row's key is the circuit's, the others are numbered again.
  const pending: NonNullable<SheetLink['pending']> = {};
  for (const [key, typed] of Object.entries(pend)) {
    const left = Object.fromEntries(Object.entries(typed).filter(([l]) => !done[key]?.has(l)));
    if (Object.keys(left).length) pending[key] = left;
  }
  const order = news.map((_, a) => a).filter((a) => !(a in made)), renum = new Map(order.map((a, n) => [a, n]));
  const rows = link.rows.map((k) => { if (!k.startsWith('new:')) return k; const a = Number(k.slice(4)); return a in made ? made[a] : `new:${renum.get(a)}`; });
  const remaining = order.map((a) => news[a]);
  const { pending: _p, added: _a, ...base } = link;
  const out: Sheet = { ...sheet, link: { ...base, rows, ...(Object.keys(pending).length ? { pending } : {}), ...(remaining.length ? { added: remaining } : {}) } };
  return { project: p, sheet: out, changed: changedKeys.length, added: addedN, rejected, refs, newKeys: made };
}

/** Turns what was typed in a linked sheet into edits of the project. The same objects back when there is nothing to apply. */
export function applyLinked(project: Project, sheet: Sheet): { project: Project; sheet: Sheet; changed: number; added: number; rejected: string[] } {
  const { refs: _r, newKeys: _n, ...r } = run(project, sheet);
  return r;
}

/** One mark for each typed cell that is not applied yet, from a dry run of Apply: refused (with the reason), check (the circuit
 * would need a check after Apply, for a typed MCB, cable or earth) or pending. */
export function pendingMarks(project: Project, sheet: Sheet): Record<string, { kind: 'pending' | 'check' | 'refused'; text: string }> {
  const link = sheet.link, boardId = link?.boardId, marks: Record<string, { kind: 'pending' | 'check' | 'refused'; text: string }> = {};
  if (!link || !boardId) return marks;
  const r = run(project, sheet);
  const rows = loadScheduleRows(r.project, boardId).rows;
  const checkOf = (key: string) => { const row = rows.find((x) => keyOf(x.f) === key); const why = row && (row.status !== 'ok' || row.belowMin) ? rowReasons(r.project, row) : []; return why.length ? `After Apply this circuit needs a check: ${why.join('; ')}` : undefined; };
  const mark = (cell: string, field: string, key: string | undefined, a?: number) => {
    const ref = r.refs.find((x) => x.cell === cell || (a !== undefined && x.row === a));
    const text = ref ? undefined : key && ['row.mcb', 'row.wire', 'row.ecc'].includes(field) ? checkOf(key) : undefined;
    marks[cell] = ref ? { kind: 'refused', text: ref.text } : text ? { kind: 'check', text } : { kind: 'pending', text: 'Typed, not applied yet' };
  };
  for (const [key, typed] of Object.entries(link.pending ?? {})) {
    const at = link.rows.indexOf(key);
    if (at >= 0) for (const letters of Object.keys(typed)) mark(`${letters}${link.firstRow + at}`, link.columns[letters], key);
  }
  (link.added ?? []).forEach((o, a) => {
    const at = link.rows.indexOf(`new:${a}`);
    if (at >= 0) for (const [letters, text] of Object.entries(o)) if (text.trim() !== '' && link.columns[letters]) mark(`${letters}${link.firstRow + at}`, link.columns[letters], r.newKeys[a], a);
  });
  return marks;
}
