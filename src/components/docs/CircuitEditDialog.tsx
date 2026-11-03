import { Modal } from '../ui';
import { ask } from '../ConfirmDialog';
import { useEffect, useMemo, useRef, useState } from 'react';
import { POINT_TYPES, type Board, type CircuitLoadItem, type Feeder, type PointType, type Project } from '../../types';
import { cables } from '../../calc/cableTable';
import { defaultCpcMm2, disconnectionLabel } from '../../calc/earthing';
import { izText } from '../../calc/electrical';
import { STATUS_TEXT } from '../../calc/statusText';
import { breakerRatings } from '../../calc/sizing';
import { circuitWatts, normalizeLoadItems, pointLabel, pointsWithItems, type pointColumns } from '../../calc/loadSchedule';
import { findLibraryLoad, loadItemFromLibrary, type LibraryLoad } from '../../database/database';
import type { CircuitPatch } from '../../model/schedule';
import { fitColumns, previewCircuit, roomPresets, sameAsOptions, tabOfField, type CircuitEditTab, type Points } from '../../model/circuitEdit';
import { wiringLengths } from '../../model/cadWiring';
import { txt } from '../../util/format';

const num = (v: string) => (v === '' ? 0 : Math.max(0, Math.round(+v) || 0));
const watts = (v: string) => (v === '' ? 0 : Math.max(0, Number(v.replace(',', '.')) || 0));
const sameItems = (a: CircuitLoadItem[], b: CircuitLoadItem[]) => JSON.stringify(a) === JSON.stringify(b);
const TABS: [CircuitEditTab, string][] = [['loads', 'Loads'], ['protection', 'Protection & wiring'], ['general', 'General']];

/** Double-click edit dialog for one load schedule circuit, in three tabs
 * (Loads, Protection & wiring, General). Edits the same fields as the table
 * row; changes apply on Save. `focus` is the field the user double-clicked
 * (a sheet column key like 'mcb' or 'pt:ltg'); it opens on that field's tab. */
export default function CircuitEditDialog({
  project,
  board,
  feeder,
  circuitRef,
  columns,
  library = [],
  focus,
  onSave,
  onDelete,
  onClose
}: {
  project: Project;
  board: Board;
  feeder: Feeder;
  circuitRef: string;
  columns: ReturnType<typeof pointColumns>;
  /** Loads.xlsx items, for picking load items by reference. */
  library?: LibraryLoad[];
  focus?: string;
  onSave: (patch: CircuitPatch) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const f = feeder;
  const [room, setRoom] = useState(f.room ?? '');
  const [remarks, setRemarks] = useState(f.remarks ?? '');
  const [points, setPoints] = useState<Partial<Record<PointType, number>>>({ ...f.points });
  // Mixed fittings on one circuit (e.g. 6 × L1 10 W + 4 × L2 20 W); each listed type's count is their sum.
  const [items, setItemsState] = useState<CircuitLoadItem[]>(() => normalizeLoadItems(f.loadItems));
  const shownPoints = pointsWithItems(points, items) ?? {};
  const itemized = new Set(items.map((it) => it.pointType));
  // Removing a type's last item leaves its count as it was, now at the DB's WATT / UNIT.
  const setItems = (next: CircuitLoadItem[]) => { setPoints({ ...shownPoints }); setItemsState(next); };
  const setItem = (i: number, change: Partial<CircuitLoadItem>) => setItems(items.map((it, j) => (j === i ? { ...it, ...change } : it)));
  const focusType = focus?.startsWith('pt:') ? (focus.slice(3) as PointType) : undefined;
  // The first item of a type that already has a count takes that count over (at the DB's WATT / UNIT),
  // so splitting "10 LTG" into L1 + L2 starts from the 10 points already there.
  const firstQty = (t: PointType) => (!itemized.has(t) && (shownPoints[t] ?? 0) > 0 ? shownPoints[t]! : 1);
  const addItem = (it: CircuitLoadItem) => setItems([...items, { ...it, quantity: firstQty(it.pointType) }]);
  const totalW = circuitWatts({ ...f, points: shownPoints, loadItems: items }, board);
  const [mcb, setMcb] = useState(f.breakerRatingA);
  const [wire, setWire] = useState(f.cableCsaMm2);
  const [ecc, setEcc] = useState<number | undefined>(f.cpcMm2);
  // A circuit wired in Design CAD takes its length from the plan; typing replaces it.
  const planM = useMemo(() => wiringLengths(project).get(f.id), [project, f.id]);
  const [length, setLength] = useState(String(planM ?? f.lengthM));
  const [fromPlan, setFromPlan] = useState(planM !== undefined);
  const [manual, setManual] = useState(!!f.manualSize);
  const form = useRef<HTMLFormElement>(null);
  const [tab, setTab] = useState<CircuitEditTab>(() => tabOfField(focus));
  const label = (t: PointType) => pointLabel(board, t, project);
  // Point columns: those the circuit used when opened and those that fit it (lighting / power), plus any
  // it uses now; "More columns…" shows the rest. A double-clicked hidden column opens with all shown.
  const [fit] = useState(() => new Set(fitColumns(columns, shownPoints, itemized).map((c) => c.value)));
  const [allColumns, setAllColumns] = useState(() => !!focusType && !fit.has(focusType));
  const shownColumns = allColumns ? columns : columns.filter((c) => fit.has(c.value) || (shownPoints[c.value] ?? 0) > 0 || itemized.has(c.value));
  const applyPoints = (p: Points) => { setItemsState([]); setPoints({ ...p }); };
  const presets = items.length ? [] : roomPresets(project, f, room, shownPoints, label);
  const sameAs = useMemo(() => sameAsOptions(project, f, label), [project, f]); // eslint-disable-line react-hooks/exhaustive-deps
  const lengthOk = Number(length.replace(',', '.')) > 0;

  useEffect(() => {
    const el = form.current?.querySelector<HTMLElement>(`[data-field="${focus}"]`) ?? form.current?.querySelector<HTMLElement>('[role="tabpanel"]:not([hidden]) [data-field]');
    el?.focus();
    if (el instanceof HTMLInputElement) el.select();
  }, [focus]);

  /** The changes made so far; an invalid length is left out (Save refuses it). */
  function changes(): CircuitPatch {
    const len = Number(length.replace(',', '.'));
    const patch: CircuitPatch = {};
    if (room !== (f.room ?? '')) patch.room = room;
    if (remarks !== (f.remarks ?? '')) patch.remarks = remarks || undefined;
    const clean = normalizeLoadItems(items);
    const nextPoints = pointsWithItems(points, clean) ?? {};
    const itemsChanged = !sameItems(clean, normalizeLoadItems(f.loadItems));
    if (itemsChanged) patch.loadItems = clean.length ? clean : undefined;
    if (itemsChanged || POINT_TYPES.some((t) => (nextPoints[t.value] ?? 0) !== (f.points?.[t.value] ?? 0))) patch.points = nextPoints;
    if (len > 0 && len !== f.lengthM) patch.lengthM = len;
    // Only send sizes that changed: sending any of them marks the circuit hand-sized.
    if (manual) {
      if (mcb !== f.breakerRatingA) patch.breakerRatingA = mcb;
      if (wire !== f.cableCsaMm2) patch.cableCsaMm2 = wire;
      if (ecc !== f.cpcMm2) patch.cpcMm2 = ecc;
    }
    if (manual !== !!f.manualSize) patch.manualSize = manual;
    return patch;
  }
  const patch = changes();
  const pv = previewCircuit(project, board, f.id, patch);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!lengthOk) {
      setTab('general');
      setTimeout(() => form.current?.querySelector<HTMLElement>('[data-field="length"]')?.focus());
      return;
    }
    if (Object.keys(patch).length) onSave(patch);
    else onClose();
  }

  return (
    <Modal onClose={onClose} className="modal circuit-edit" onSubmit={submit} boxRef={form}>
      <h3>Edit circuit: {circuitRef}</h3>
      <p className="m ce-sum">
        {board.id} · phase <b className={`ph-${f.phase === 'RYB' ? 'ryb' : (f.phase ?? '').toLowerCase()}`}>{f.phase}</b> · <b>{Math.round(totalW)} W</b>
        {pv && <> · MCB <b>{pv.feeder.breakerRatingA} A</b> · <b>{pv.feeder.cableCsaMm2} mm²</b> · <b className={pv.status}>{STATUS_TEXT[pv.status]}</b></>}
        {' '}· changes apply on Save.
      </p>
      <div className="tabs ptabs" role="tablist">
        {TABS.map(([t, name]) => (
          <button key={t} type="button" role="tab" id={`ce-tab-${t}`} aria-controls={`ce-pane-${t}`} aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            {name}{t === 'general' && !lengthOk && <span className="warn" title="Length must be more than 0"> !</span>}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="ce-pane-loads" aria-labelledby="ce-tab-loads" className="ce-pane" hidden={tab !== 'loads'}>
        {(presets.length > 0 || (sameAs.length > 0 && !items.length)) && (
          <div className="row ce-item-add">
            {presets.map((pr) => <button key={pr.label} type="button" className="chip" title="Use these points (starting values: check them before saving)" onClick={() => applyPoints(pr.points)}>{pr.label}</button>)}
            {sameAs.length > 0 && !items.length && (
              <select value="" aria-label="Copy the points of another circuit on this DB"
                onChange={(e) => { const o = sameAs.find((x) => x.id === e.target.value); if (o) applyPoints(o.points); }}>
                <option value="">Same as…</option>
                {sameAs.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            )}
          </div>
        )}
        <fieldset className="ce-points">
          <legend>Connected loads / points</legend>
          <div className="ce-grid ce-pts">
            {shownColumns.map((t) => (
              <label key={t.value} title={itemized.has(t.value) ? `${t.title}: the sum of the load items below` : t.title}>{label(t.value)}
                <input data-field={`pt:${t.value}`} inputMode="numeric" value={shownPoints[t.value] || ''} readOnly={itemized.has(t.value)}
                  onChange={(e) => setPoints({ ...points, [t.value]: num(e.target.value) })} />
              </label>
            ))}
          </div>
          {shownColumns.length < columns.length || allColumns
            ? <button type="button" className="link-btn" onClick={() => setAllColumns(!allColumns)}>{allColumns ? 'Fewer columns' : `More columns… (${columns.length - shownColumns.length} more)`}</button>
            : null}
          <p className="m">Counts use the DB's WATT / UNIT. For mixed wattages on one circuit (e.g. 6 × L1 10 W and 4 × L2 20 W), list them as load items — their count is then the sum of the items.</p>
          {items.length > 0 && (
            <table className="ce-items">
              <thead><tr><th>Ref.</th><th>Item</th><th>Column</th><th>Qty</th><th>W / unit</th><th>W</th><th /></tr></thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i}>
                    <td><input value={it.reference ?? ''} placeholder="L1" aria-label={`Item ${i + 1} reference`} list={library.length ? 'ce-lib-refs' : undefined}
                      onChange={(e) => {
                        const reference = e.target.value;
                        const lib = reference.trim() ? findLibraryLoad(library, { reference }) : undefined;
                        setItem(i, lib ? { ...loadItemFromLibrary(lib, it.pointType, it.quantity), reference } : { reference: reference || undefined });
                      }} /></td>
                    <td><input value={it.name} placeholder="Description" aria-label={`Item ${i + 1} name`} onChange={(e) => setItem(i, { name: e.target.value })} /></td>
                    <td>
                      <select value={it.pointType} aria-label={`Item ${i + 1} schedule column`} onChange={(e) => setItem(i, { pointType: e.target.value as PointType })}>
                        {[...new Set([...columns.map((c) => c.value), it.pointType])].map((t) => <option key={t} value={t}>{pointLabel(board, t, project)}</option>)}
                      </select>
                    </td>
                    <td><input data-field={`item:${i}:qty`} inputMode="numeric" value={it.quantity || ''} aria-label={`Item ${i + 1} quantity`} aria-invalid={!(it.quantity > 0)}
                      onChange={(e) => setItem(i, { quantity: num(e.target.value) })} /></td>
                    <td><input inputMode="decimal" value={it.unitWatts || ''} placeholder="W" aria-label={`Item ${i + 1} watts per unit`}
                      title={findLibraryLoad(library, it) ? 'From the library — the value follows Loads.xlsx' : undefined}
                      onChange={(e) => setItem(i, { unitWatts: watts(e.target.value) })} /></td>
                    <td className="num">{Math.round(it.quantity * it.unitWatts)}</td>
                    <td><button type="button" className="icon-btn" title="Remove item" aria-label={`Remove item ${i + 1}`} onClick={() => setItems(items.filter((_, j) => j !== i))}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {library.length > 0 && <datalist id="ce-lib-refs">{library.filter((l) => l.reference).map((l) => <option key={l.reference} value={l.reference}>{l.name} ({l.watts} W)</option>)}</datalist>}
          <div className="row ce-item-add">
            {library.length > 0 && (
              <select value="" aria-label="Add a load item from the library"
                onChange={(e) => {
                  const lib = library.find((l) => (l.reference ?? l.name) === e.target.value);
                  if (lib) addItem(loadItemFromLibrary(lib, focusType ?? 'ltg', 1));
                }}>
                <option value="">+ Item from library…</option>
                {library.map((l) => <option key={l.reference ?? l.name} value={l.reference ?? l.name}>{l.reference ? `${l.reference} — ` : ''}{l.name} ({l.watts} W)</option>)}
              </select>
            )}
            <button type="button" className="chip" onClick={() => { const t = focusType ?? 'ltg'; addItem({ name: '', pointType: t, quantity: 1, unitWatts: itemized.has(t) ? 0 : board.pointWatts?.[t] ?? 0 }); }}>+ Load item</button>
            <span className="sp" />
            <span className="m">Connected load: <b>{Math.round(totalW)} W</b></span>
          </div>
        </fieldset>
      </div>
      <div role="tabpanel" id="ce-pane-protection" aria-labelledby="ce-tab-protection" className="ce-pane" hidden={tab !== 'protection'}>
        <fieldset>
          <legend>Protection &amp; wiring</legend>
          <label className="row"><input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} /> Sized by hand <span className="m">(untick to size MCB, wire and ECC from the load again)</span></label>
          <div className="ce-grid">
            <label>MCB (A)
              <select data-field="mcb" value={mcb} disabled={!manual} onChange={(e) => setMcb(+e.target.value)}>
                {[...new Set([...breakerRatings().filter((a) => a <= 125), mcb])].sort((a, b) => a - b).map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
            <label>CCT wire mm²
              <select data-field="wire" value={wire} disabled={!manual} onChange={(e) => setWire(+e.target.value)}>
                {cables().map((c) => <option key={c.csaMm2} value={c.csaMm2}>{c.csaMm2}</option>)}
              </select>
            </label>
            <label>ECC mm²
              <select data-field="ecc" value={ecc ?? ''} disabled={!manual} onChange={(e) => setEcc(e.target.value === '' ? undefined : +e.target.value)}>
                <option value="">{defaultCpcMm2(wire)} (default)</option>
                {cables().filter((c) => c.csaMm2 <= wire).map((c) => <option key={c.csaMm2} value={c.csaMm2}>{c.csaMm2}</option>)}
              </select>
            </label>
          </div>
        </fieldset>
        {pv && (
          <fieldset>
            <legend>Calculated</legend>
            <div className="ce-grid ce-ro">
              <label>Design current Ib<output>{txt.current(pv.result.ib)} A</output></label>
              <label>Cable rating Iz<output>{izText(pv.result.ampacity)} A</output></label>
              <label>Ib ≤ In ≤ Iz<output className={pv.result.protectionStatus}>{STATUS_TEXT[pv.result.protectionStatus]}</output></label>
              <label>Voltage drop<output className={pv.result.vdStatus}>{txt.pct(pv.result.vdPct)} % · {txt.pct(pv.result.vdTotalPct)} % total</output></label>
              <label>Earth fault<output className={pv.earthing.status}>{disconnectionLabel(pv.earthing)}</output></label>
              <label>ELCB<output>{pv.elcb ? `Section ${pv.elcb.index} · ${pv.elcb.label}` : 'None'}</output></label>
            </div>
            <p className="m">Read-only: the result after Save, sized again from the load unless sized by hand.</p>
          </fieldset>
        )}
      </div>
      <div role="tabpanel" id="ce-pane-general" aria-labelledby="ce-tab-general" className="ce-pane" hidden={tab !== 'general'}>
        <div className="ce-grid">
          <label>Room / area<input data-field="room" value={room} placeholder="Room" onChange={(e) => setRoom(e.target.value)} /></label>
          <label>Length (m) <span className="m">{fromPlan ? 'from plan' : 'calc only'}</span>
            <input data-field="length" inputMode="decimal" value={length} onChange={(e) => { setLength(e.target.value); setFromPlan(false); }} aria-invalid={!lengthOk}
              title={fromPlan ? `Wiring length from the circuit's devices in Design CAD${planM !== f.lengthM ? ` (the schedule has ${f.lengthM} m)` : ''}` : undefined} />
          </label>
          <label className="ce-ro">Phase / way<output>{f.phase}{f.way !== undefined ? ` · way ${f.way}` : ''}</output></label>
        </div>
        <label>Remarks<input data-field="remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} /></label>
      </div>
      <div className="modal-actions">
        <button type="button" className="chip bad-btn" onClick={async () => (await ask(`Delete circuit ${circuitRef}?`)) && onDelete()}>Delete circuit</button>
        <span className="sp" />
        <button type="button" className="chip" onClick={onClose}>Cancel</button>
        <button type="submit" className="chip primary">Save changes</button>
      </div>
    </Modal>
  );
}
