import { useMemo, useState } from 'react';
import { Modal } from '../ui';
import { circuitCategory, circuitRef, elcbGroups, RCBO_KIND_TEXT, rcbosOf, rcdTypeNeeded, scheduleCircuits, STANDARD_ELCB_A } from '../../calc/loadSchedule';
import { elcbPreview, elcbWaysProblem } from '../../model/elcbs';
import { RCD_TYPES, type Board, type BoardElcb, type Feeder, type Project, type RcdType } from '../../types';

/** What the dialog is for: a 3-phase ELCB over ways (new, or the one over way `at`), the earth leakage setting of an RCBO
 * circuit, or why a circuit has no RCD. */
export type ElcbTarget = { kind: 'elcb'; at?: number; from: number; to: number } | { kind: 'rcbo'; feederId: string } | { kind: 'none'; feederId: string };
export interface ElcbValues { fromWay: number; toWay: number; poles: 3 | 4; ratingA?: number; sensitivityMa?: number; rcdType?: RcdType; reason?: string }

/** Why Auto picks this type: the DB's choice, or the circuit that needs it (e.g. "EV charger, R3"). */
function autoWhy(board: Board, type: RcdType, circuits: Feeder[]): string {
  if (board.rcdType) return 'the DB\'s choice';
  const c = circuits.find((f) => rcdTypeNeeded(f).type === type && rcdTypeNeeded(f).why);
  return c ? `${rcdTypeNeeded(c).why}, ${circuitRef(c) ?? c.id}` : 'general circuits';
}

const MA = [10, 30, 100, 300];
const whole = (v: string) => (v === '' ? NaN : Math.round(+v));
const pick = (v: string) => (v === '' ? undefined : +v);

/** Add / edit an ELCB (RCCB) over ways of a DB, set the sensitivity of an RCBO circuit, or give why a circuit has no RCD. `onSave` returns a
 * reason when it cannot be applied (the dialog stays open and shows it); the Auto values are what the schedule would pick. */
export default function ElcbDialog({ project, board, target, onSave, onClose }: {
  project: Project;
  board: Board;
  target: ElcbTarget;
  onSave: (v: ElcbValues) => string | undefined;
  onClose: () => void;
}) {
  const at = target.kind === 'elcb' ? target.at : undefined;
  const group = at !== undefined ? elcbGroups(project, board).find((g) => g.ways.includes(at)) : undefined;
  const editing: BoardElcb | undefined = group?.byHand;
  const rcboFeeder = target.kind !== 'elcb' ? project.feeders.find((f) => f.id === target.feederId) : undefined;
  const [reason, setReason] = useState(target.kind === 'none' ? rcboFeeder?.noRcd ?? 'Fire alarm panel' : '');
  const [from, setFrom] = useState(target.kind === 'elcb' ? String(editing?.fromWay ?? target.from) : '');
  const [to, setTo] = useState(target.kind === 'elcb' ? String(editing?.toWay ?? target.to) : '');
  const [poles, setPoles] = useState<3 | 4>(editing?.poles ?? 4);
  const [rating, setRating] = useState(editing?.ratingA ? String(editing.ratingA) : '');
  const ownType = target.kind === 'rcbo' ? rcboFeeder?.rcdType : editing?.rcdType;
  const [rcdType, setRcdType] = useState<string>(ownType ?? '');
  const [ma, setMa] = useState((target.kind === 'rcbo' ? rcboFeeder?.rcdMa : editing?.sensitivityMa) ? String(target.kind === 'rcbo' ? rcboFeeder?.rcdMa : editing?.sensitivityMa) : '');
  const [error, setError] = useState<string>();

  const fromWay = whole(from), toWay = whole(to);
  const problem = target.kind === 'elcb' ? elcbWaysProblem({ fromWay, toWay }) : target.kind === 'none' && !reason.trim() ? 'Give the reason, e.g. fire alarm panel' : undefined;

  /** What Auto means here: the schedule's own pick for the group (or RCBO) with nothing chosen by hand. */
  const auto = useMemo(() => {
    const withBoard = (elcbs: BoardElcb[] | undefined, feeders = project.feeders): Project => ({ ...project, feeders, boards: project.boards.map((b) => (b.id === board.id ? { ...b, elcbs } : b)) });
    if (target.kind === 'none') return undefined;
    if (target.kind === 'rcbo') {
      const next = withBoard(board.elcbs, project.feeders.map((f) => (f.id === target.feederId ? { ...f, rcbo: true, rcdMa: undefined, rcdType: undefined } : f)));
      const r = rcbosOf(next, next.boards.find((b) => b.id === board.id)!).find((x) => x.circuit.id === target.feederId);
      return r && { ratingA: r.ratingA, sensitivityMa: r.sensitivityMa, maxPhaseA: 0, category: circuitCategory(next.feeders.find((f) => f.id === target.feederId)!), rcdType: r.rcdType, rcdWhy: autoWhy(board, r.rcdType, [r.circuit]) };
    }
    const g = elcbPreview(project, board.id, { fromWay, toWay, poles }, at);
    return g && { ratingA: g.ratingA, sensitivityMa: g.sensitivityMa, maxPhaseA: g.maxPhaseA, category: g.category === 'lighting' ? 'lighting' as const : 'power' as const, rcdType: g.rcdType, rcdWhy: autoWhy(board, g.rcdType, g.circuits) };
  }, [project, board, target, at, fromWay, toWay, poles]);

  const circuits = target.kind === 'elcb' && !problem ? scheduleCircuits(project, board.id).filter((f) => f.way! >= fromWay && f.way! <= toWay) : [];
  const number = target.kind === 'elcb' ? group?.index : undefined;
  const own = target.kind === 'rcbo' ? rcbosOf(project, board).find((r) => r.circuit.id === target.feederId) : undefined;
  const circuitName = rcboFeeder ? `${circuitRef(rcboFeeder) ?? rcboFeeder.id} ${rcboFeeder.room || rcboFeeder.name}`.trim() : '';
  const title = target.kind === 'rcbo' ? `${own?.name ?? 'RCBO'} — ${circuitName}`
    : target.kind === 'none' ? `No RCD — ${circuitName}`
    : group ? `ELCB-${number ?? ''} — ${board.id}` : `Add 3-phase ELCB — ${board.id}`;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const why = problem ?? onSave({ fromWay, toWay, poles, ratingA: pick(rating), sensitivityMa: pick(ma), rcdType: (rcdType || undefined) as RcdType | undefined, reason: reason.trim() || undefined });
    if (why) setError(why); else onClose();
  };
  const shownError = problem ?? error;

  return (
    <Modal onClose={onClose} className="modal elcb-dialog" onSubmit={submit} label={title}>
      <h3>{title}</h3>
      {target.kind === 'elcb' && (
        <>
          <div className="row">
            <label>Way <input data-field="from" inputMode="numeric" value={from} onChange={(e) => { setFrom(e.target.value); setError(undefined); }} aria-invalid={!!problem} /></label>
            <label>to way <input data-field="to" inputMode="numeric" value={to} onChange={(e) => { setTo(e.target.value); setError(undefined); }} aria-invalid={!!problem} /></label>
          </div>
          {circuits.length > 0 && <p className="m">Covers {circuits.map((f) => `${circuitRef(f)} ${f.room || f.name}`.trim()).join(', ')}.</p>}
          <fieldset>
            <legend>Poles</legend>
            <label className="row"><input type="radio" name="elcb-poles" checked={poles === 4} onChange={() => setPoles(4)} /> 4P (TP&amp;N)</label>
            <label className="row"><input type="radio" name="elcb-poles" checked={poles === 3} onChange={() => setPoles(3)} /> 3P (no neutral)</label>
          </fieldset>
          <label>Rating
            <select value={rating} onChange={(e) => setRating(e.target.value)}>
              <option value="">Auto{auto ? ` — ${auto.ratingA} A (${auto.maxPhaseA.toFixed(1)} A per phase)` : ''}</option>
              {STANDARD_ELCB_A.map((a) => <option key={a} value={a}>{a} A</option>)}
            </select>
          </label>
        </>
      )}
      {target.kind === 'rcbo' && <p className="m">{own ? RCBO_KIND_TEXT[own.kind] : 'RCBO'}, rating {rcboFeeder?.breakerRatingA} A (the circuit&apos;s breaker), {rcboFeeder?.phase === 'RYB' ? '4P' : '2P'}</p>}
      {target.kind === 'none' && (
        <>
          <label>Reason <input data-field="reason" value={reason} onChange={(e) => { setReason(e.target.value); setError(undefined); }} aria-invalid={!!problem} /></label>
          <p className="m">The circuit leaves its ELCB and has no earth leakage device. Its earth fault check then has to pass on the MCB alone. The reason prints in the ELCB column.</p>
        </>
      )}
      {target.kind !== 'none' && <label>Sensitivity
        <select value={ma} onChange={(e) => setMa(e.target.value)}>
          <option value="">Auto{auto ? ` — ${auto.sensitivityMa} mA (${auto.category} circuit)` : ''}</option>
          {MA.map((m) => <option key={m} value={m}>{m} mA</option>)}
        </select>
      </label>}
      {target.kind !== 'none' && <label>RCD type
        <select value={rcdType} onChange={(e) => setRcdType(e.target.value)}>
          <option value="">Auto{auto ? ` — Type ${auto.rcdType} (${auto.rcdWhy})` : ''}</option>
          {RCD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </label>}
      {target.kind === 'elcb' && <p className="m">ELCBs already over these ways give them up; no other ELCB moves. RCBO circuits in these ways keep their RCBO.</p>}
      {shownError && <p className="warn" role="alert">{shownError}</p>}
      <div className="modal-actions">
        <span className="sp" />
        <button type="button" className="chip" onClick={onClose}>Cancel</button>
        <button type="submit" className="chip primary" disabled={!!problem}>{target.kind !== 'elcb' || group ? 'Save' : 'Add ELCB'}</button>
      </div>
    </Modal>
  );
}
