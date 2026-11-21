import { useMemo, useState } from 'react';
import { Link2 } from 'lucide-react';
import type { Project } from '../../types';
import { Modal } from '../ui';
import { assess, buildingFigures, laStandards, laTypes, newAssessment, standardOf, type LaSpace, type LoadAssessment } from '../../calc/loadAssessment';
import { countBuildings, keepFigures, laLink, updateFromBuilding, type LaLinkFigure } from '../../calc/loadAssessmentLink';
import { txt } from '../../util/format';

const f0 = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });

function Tag({ f }: { f: LaLinkFigure }) {
  if (f.building === undefined) return null;
  if (!f.differs) return <span className="chip-lite ok">same</span>;
  const p = f.key !== 'floors' && f.pct !== undefined ? Math.round(f.pct) : 0;
  return <span className="chip-lite warn">differs{p ? ` · ${f.pct! > 0 ? '+' : '−'}${Math.abs(p)} %` : ''}</span>;
}

/** What the update would change, as one line, before the user presses Update. */
function resultOf(project: Project, a: LoadAssessment, take: { figures: boolean; schedule: boolean }, spaces: LaSpace[]) {
  const before = assess(a), after = assess(updateFromBuilding(project, a, take, spaces));
  const parts: string[] = [];
  const md = [f0(before.mdKva), f0(after.mdKva)];
  parts.push(md[0] === md[1] ? `MD stays ${md[1]} kVA` : `MD ${md[0]} to ${md[1]} kVA`);
  const va = [f0(before.vaPerM2), f0(after.vaPerM2)];
  parts.push(va[0] === va[1] ? `VA/m² stays ${va[1]}` : `${va[0]} to ${va[1]} VA/m²`);
  if (before.liftCount !== after.liftCount) parts.push(`lifts ${before.liftCount} to ${after.liftCount}`);
  if (after.tx) {
    const t = (x: NonNullable<typeof after.tx>) => `${x.count} × ${f0(x.kva)} kVA`;
    const same = before.tx && t(before.tx) === t(after.tx);
    parts.push(same ? `transformers stay ${t(after.tx)} (${txt.loading((after.mdKva / (after.tx.duty * after.tx.kva)) * 100)} % loaded, limit ${a.supply.maxLoadingPct} %)` : `transformers ${before.tx ? t(before.tx) : '—'} to ${t(after.tx)}`);
  }
  if (after.generatorKva !== undefined) {
    const g = (c: number, k: number) => `${c > 1 ? `${c} × ` : ''}${f0(k)} kVA`;
    const bt = before.generatorKva !== undefined ? g(before.generatorCount, before.generatorKva) : '—', at = g(after.generatorCount, after.generatorKva);
    parts.push(bt === at ? `generator stays ${at}` : `generator ${bt} to ${at}`);
  }
  return parts;
}

export function UpdateFromBuildingDialog({ project, a, spaces, onClose, onApply }: { project: Project; a: LoadAssessment; spaces: LaSpace[]; onClose: () => void; onApply: (next: LoadAssessment, msg: string) => void }) {
  const link = useMemo(() => laLink(project, a, spaces), [project, a, spaces]);
  const anyFigure = link.figures.some((x) => x.differs), hasRooms = link.buildingRows.length > 0;
  const [figures, setFigures] = useState(anyFigure);
  const [schedule, setSchedule] = useState(link.mixDiffers);
  const take = { figures: figures && anyFigure, schedule: schedule && hasRooms };
  const parts = resultOf(project, a, take, spaces);
  const [gfa, floors, parking] = link.figures;
  const diff = [
    gfa.differs && `GFA ${f0(gfa.assessment)} to ${f0(gfa.building!)} m²`,
    floors.differs && `floors ${floors.assessment} to ${floors.building}`,
    parking.differs && `car park ${f0(parking.assessment)} to ${f0(parking.building!)} m²`
  ].filter(Boolean).join(' · ');
  const apply = () => {
    const next = updateFromBuilding(project, a, take, spaces);
    onApply(next, `Updated from Building information: ${[take.figures && 'GFA, floors and car park', take.schedule && 'the area schedule'].filter(Boolean).join(' and ')}`);
  };
  return (
    <Modal onClose={onClose} className="modal" style={{ maxWidth: 640 }}>
      <h3>Update from Building: what changes</h3>
      <div className="la-take"><label><input type="checkbox" checked={take.figures} disabled={!anyFigure} onChange={(e) => setFigures(e.target.checked)} /> {anyFigure ? diff : 'GFA, floors and car park are the same'}</label></div>
      <div className="la-take"><label><input type="checkbox" checked={take.schedule} disabled={!hasRooms} onChange={(e) => setSchedule(e.target.checked)} /> {hasRooms ? <>Area schedule: {link.buildingRows.length} spaces in m² from the rooms and flats <span className="m">(your W/m², services and diversities are kept)</span></> : 'No rooms in Building information'}</label></div>
      <div className="la-result"><b>Result</b> {parts.join(' · ')}</div>
      <div className="modal-actions">
        <span className="m">One undo step.</span>
        <span className="sp" />
        <button className="chip" onClick={onClose}>Cancel</button>
        <button className="chip primary" disabled={!take.figures && !take.schedule} onClick={apply}>Update</button>
      </div>
    </Modal>
  );
}

export function LinkStrip({ project, a, spaces, onChange, onStatus, onOpenBuilding }: { project: Project; a: LoadAssessment; spaces: LaSpace[]; onChange: (next: LoadAssessment) => void; onStatus: (msg: string) => void; onOpenBuilding?: () => void }) {
  const link = useMemo(() => laLink(project, a, spaces), [project, a, spaces]);
  const [open, setOpen] = useState(false);
  if (!link.hasBuilding) {
    return (
      <section className="card la-link">
        <div className="m">No building information yet. Enter the buildings, levels and rooms in Building to compare them with this assessment.</div>
        {onOpenBuilding && <div className="bi-actions"><button className="chip" onClick={onOpenBuilding}>Open Building</button></div>}
      </section>
    );
  }
  const counted = link.buildings.filter((b) => b.counted);
  const many = counted.length > 1;
  const [gfa, floors, parking] = link.figures;
  const tick = (id: string, on: boolean) => {
    const ids = link.buildings.filter((b) => (b.id === id ? on : b.counted)).map((b) => b.id);
    if (ids.length) onChange(countBuildings(project, a, ids));
  };
  const cell = (f: LaLinkFigure, fmt: (n: number) => string) => (
    <tr key={f.key}>
      <td>{{ gfa: 'GFA above ground', floors: 'Floors above ground', parking: 'Basement car park' }[f.key]}</td>
      <td>{f.building === undefined ? '—' : <b>{fmt(f.building)}</b>}
        {f.key === 'gfa' && many && <span className="m"> {counted.map((b) => `${b.name} ${f0(b.gfaM2)}`).join(' + ')}</span>}
        {f.key === 'floors' && many && link.tallest && <span className="m"> tallest building: {link.tallest}</span>}</td>
      <td>{fmt(f.assessment)}</td>
      <td><Tag f={f} /></td>
    </tr>
  );
  const m2 = (n: number) => `${f0(n)} m²`;
  return (
    <section className="card la-link">
      <div className="la-link-head">
        <b>Building information</b><Link2 size={14} aria-hidden /><b>this assessment</b>
        {link.notice ? <span className="chip-lite warn">Building changed after these figures were taken</span> : !link.differs ? <span className="chip-lite ok">Same as Building</span> : <span className="chip-lite">Your own figures are kept</span>}
        <span className="sp" />
        {link.buildings.length > 1 && <>
          <span className="m">Buildings counted:</span>
          {link.buildings.map((b) => <label key={b.id}><input type="checkbox" checked={b.counted} onChange={(e) => tick(b.id, e.target.checked)} /> {b.name}</label>)}
        </>}
      </div>
      <table className="bi-table la-table">
        <thead><tr><th>Figure</th><th>Building information now</th><th>This assessment</th><th /></tr></thead>
        <tbody>
          {cell(gfa, m2)}
          {cell(floors, (n) => String(n))}
          {cell(parking, m2)}
          <tr>
            <td>Space mix</td>
            <td>{link.buildingRows.length ? <><b>{link.buildingRows.length} spaces · {m2(link.buildingAreaM2)}</b> <span className="m">rooms and flats, above ground</span></> : '—'}</td>
            <td>{a.areaMode === 'pct' ? `“${a.typeLabel}” mix, % of GFA` : `${a.rows.length} spaces · ${m2(assess(a).areaM2)}`}</td>
            <td>{link.buildingRows.length > 0 && (link.mixDiffers ? <span className="chip-lite warn">differs · see the Building m² column</span> : <span className="chip-lite ok">same</span>)}</td>
          </tr>
        </tbody>
      </table>
      <div className="bi-actions">
        <button className="chip primary" disabled={!link.differs} onClick={() => setOpen(true)}>Update from Building…</button>
        {link.notice && <button className="chip" onClick={() => { onChange(keepFigures(project, a, spaces)); onStatus('Your figures are kept — the notice returns when Building information changes again'); }}>Keep my figures</button>}
        {onOpenBuilding && <button className="chip" onClick={onOpenBuilding}>Open Building</button>}
        <span className="m">Nothing moves until you press Update.</span>
      </div>
      {open && <UpdateFromBuildingDialog project={project} a={a} spaces={spaces} onClose={() => setOpen(false)} onApply={(next, msg) => { onChange(next); onStatus(msg); setOpen(false); }} />}
    </section>
  );
}

/** One line on the Building information page: the load assessment those buildings feed. */
export function AssessmentLine({ project, use, onChange, onStatus, onOpen }: { project: Project; use?: string; onChange: (p: Project) => void; onStatus: (msg: string) => void; onOpen?: () => void }) {
  const a = project.loadAssessment;
  const spaces = standardOf(a?.standard, laStandards()).spaces; // not memoised: the catalogue changes outside React state
  const link = useMemo(() => (a ? laLink(project, a, spaces) : undefined), [project, a, spaces]);
  const [open, setOpen] = useState(false);
  if (!a || !link) {
    const start = () => {
      const t = use?.trim() ? laTypes().find((x) => { const u = use.trim().toLowerCase(), l = x.label.toLowerCase(); return u.includes(l) || l.includes(u); }) : undefined;
      if (t) {
        const fig = buildingFigures(project);
        onChange({ ...project, loadAssessment: newAssessment(t, { ...(fig.gfaM2 ? { gfaM2: fig.gfaM2 } : {}), ...(fig.floors ? { floors: fig.floors } : {}), parkingM2: fig.parkingM2 ?? (fig.gfaM2 ? 0 : 8000) }) });
        onStatus(`Load assessment started as “${t.label}” from the buildings`);
      }
      onOpen?.();
    };
    return <div className="bi-kpis la-line"><span className="m">No load assessment yet</span><button className="chip" onClick={start}>Start load assessment</button></div>;
  }
  const r = assess(a);
  const names = link.buildings.length > 1 ? link.buildings.filter((b) => b.counted).map((b) => b.name).join(' + ') : '';
  const gfa = link.figures[0];
  return (
    <div className="bi-kpis la-line">
      <span>Load assessment {names && <span className="m">{names}</span>} <b>MD {f0(r.mdKva)} kVA</b>
        {r.tx && <> · <b>{r.tx.count} × {f0(r.tx.kva)} kVA</b> transformers</>}
        {r.generatorKva !== undefined && <> · <b>{r.generatorCount > 1 ? `${r.generatorCount} × ` : ''}{f0(r.generatorKva)} kVA</b> generator</>}
        {' '}· <b>{f0(r.vaPerM2)} VA/m²</b></span>
      {link.notice && <span className="chip-lite warn">{gfa.differs ? `taken at GFA ${f0(a.gfaM2)} m² · Building is now ${f0(gfa.building ?? 0)} m²` : 'Building changed after the assessment was taken'}</span>}
      <span className="sp" />
      <span className="la-line-acts">
        {link.differs && <button className="chip primary" onClick={() => setOpen(true)}>Update the assessment…</button>}
        {onOpen && <button className="chip" onClick={onOpen}>Open load assessment</button>}
      </span>
      {open && <UpdateFromBuildingDialog project={project} a={a} spaces={spaces} onClose={() => setOpen(false)} onApply={(next, msg) => { onChange({ ...project, loadAssessment: next }); onStatus(msg); setOpen(false); }} />}
    </div>
  );
}
