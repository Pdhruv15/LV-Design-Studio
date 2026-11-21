import { useMemo, useState } from 'react';
import { Link2 } from 'lucide-react';
import type { Project, SpacePlan } from '../../types';
import { Modal } from '../ui';
import type { LoadAssessment } from '../../calc/loadAssessment';
import { summarize } from '../../calc/spacePlan';
import { assessmentLoads, keepPlanFigures, planLink, takeLoads, withAssessmentSettings, type PlanLinkRow } from '../../calc/spacePlanLink';

const f0 = (n: number) => Math.round(n).toLocaleString('en-US');
const FIGURE: Record<PlanLinkRow['key'], string> = { md: 'Maximum demand', tx: 'Transformers', sizes: 'Transformer sizes', settings: 'Max loading · power factor · spare · coincidence' };

function Tag({ row }: { row: PlanLinkRow }) {
  if (!row.differs) return <span className="chip-lite ok">same</span>;
  const p = row.key === 'md' && row.pct !== undefined ? Math.round(row.pct) : 0;
  return <span className="chip-lite warn">differs{p ? ` · ${row.pct! > 0 ? '+' : '−'}${Math.abs(p)} %` : ''}</span>;
}

/** What taking the loads would change, as one line, before the user presses Take loads. */
export function TakeLoadsDialog({ project, plan, a, onClose, onApply }: { project: Project; plan: SpacePlan; a: LoadAssessment; onClose: () => void; onApply: (next: SpacePlan, msg: string) => void }) {
  const [settings, setSettings] = useState(true);
  const rows = useMemo(() => assessmentLoads(project, a), [project, a]);
  const replaced = plan.areas.filter((x) => x.from === 'la' || x.id.startsWith('room-') || x.id.startsWith('unit-')).length;
  const typed = plan.areas.length - replaced;
  const perBuilding = [...rows.reduce((m, x) => m.set(x.building, (m.get(x.building) ?? 0) + 1), new Map<string, number>())].map(([b, n]) => `${b} ${n}`).join(', ');
  const next: SpacePlan = { ...takeLoads(project, plan, a), settings: settings ? withAssessmentSettings(plan.settings, a) : plan.settings };
  const before = summarize(plan), after = summarize(next);
  const md = [f0(before.demandKva), f0(after.demandKva)];
  const tx = [`${before.requiredTransformers} × ${f0(before.transformerKva)} kVA`, `${after.requiredTransformers} × ${f0(after.transformerKva)} kVA`];
  const parts = [
    md[0] === md[1] ? `MD stays ${md[1]} kVA` : `MD ${md[0]} to ${md[1]} kVA`,
    tx[0] === tx[1] ? `transformers stay ${tx[1]}` : `transformers ${tx[0]} to ${tx[1]}`,
    ...(before.requiredRmus !== after.requiredRmus ? [`RMUs ${before.requiredRmus} to ${after.requiredRmus}`] : [])
  ];
  return (
    <Modal onClose={onClose} className="modal" style={{ maxWidth: 640 }}>
      <h3>Take loads from the load assessment: what changes</h3>
      <div className="la-take"><b>{rows.length} load rows by building</b>{replaced ? ` replace ${replaced} rows taken from the rooms or taken before` : ' are added'} <span className="m">{perBuilding}</span></div>
      {typed > 0 && <div className="la-take">{typed} rows you typed are kept.</div>}
      <div className="la-take m">Each row carries its category's diversity. A category is shared between the buildings by their floor area.</div>
      <div className="la-take"><label><input type="checkbox" checked={settings} onChange={(e) => setSettings(e.target.checked)} /> Also use the assessment's settings (max loading, power factor, spare, coincidence)</label></div>
      <div className="la-result"><b>Result</b> {parts.join(' · ')}</div>
      <div className="modal-actions">
        <span className="m">Panels already given to rows are kept. One undo step.</span>
        <span className="sp" />
        <button className="chip" onClick={onClose}>Cancel</button>
        <button className="chip primary" onClick={() => onApply(next, `Took ${rows.length} load rows from the load assessment — press Auto-assign to place them`)}>Take loads</button>
      </div>
    </Modal>
  );
}

/** The load assessment against this plan: figures side by side, and the buttons that take them over. */
export function PlanLinkStrip({ project, plan, onPlan, onStatus, onOpenAssessment }: { project: Project; plan: SpacePlan; onPlan: (next: SpacePlan, step?: boolean) => void; onStatus: (m: string) => void; onOpenAssessment?: () => void }) {
  const a = project.loadAssessment;
  const link = useMemo(() => planLink(project), [project]);
  const [open, setOpen] = useState(false);
  if (!a || !link) {
    return (
      <section className="card la-link">
        <div className="m">No load assessment yet. The plan can take its loads and settings from Concept → Load assessment.</div>
        {onOpenAssessment && <div className="bi-actions"><button className="chip" onClick={onOpenAssessment}>Open load assessment</button></div>}
      </section>
    );
  }
  const settingsRow = link.rows.find((x) => x.key === 'settings')!;
  return (
    <section className="card la-link">
      <div className="la-link-head">
        <b>Load assessment</b><Link2 size={14} aria-hidden /><b>this plan</b>
        {link.notice ? <span className="chip-lite warn">The plan and the assessment differ</span> : !link.differs ? <span className="chip-lite ok">Same as the assessment</span> : <span className="chip-lite">Your own figures are kept</span>}
      </div>
      <table className="bi-table la-table">
        <thead><tr><th>Figure</th><th>Load assessment</th><th>This plan</th><th /></tr></thead>
        <tbody>
          {link.rows.map((r) => (
            <tr key={r.key}><td>{FIGURE[r.key]}</td><td><b>{r.assessment}</b></td><td>{r.plan}</td><td><Tag row={r} /></td></tr>
          ))}
        </tbody>
      </table>
      <div className="bi-actions">
        <button className="chip primary" onClick={() => setOpen(true)}>Take loads from the assessment…</button>
        <button className="chip" disabled={!settingsRow.differs} onClick={() => { onPlan({ ...plan, settings: withAssessmentSettings(plan.settings, a) }, true); onStatus('Max loading, power factor, spare and coincidence taken from the load assessment'); }}>Use the assessment's settings</button>
        {link.notice && <button className="chip" onClick={() => { onPlan(keepPlanFigures(plan, a)); onStatus('Your figures are kept — the notice returns when the load assessment changes'); }}>Keep my figures</button>}
        {onOpenAssessment && <button className="chip" onClick={onOpenAssessment}>Open load assessment</button>}
        <span className="m">Nothing moves until you press a button.</span>
      </div>
      {open && <TakeLoadsDialog project={project} plan={plan} a={a} onClose={() => setOpen(false)} onApply={(next, msg) => { onPlan(next, true); onStatus(msg); setOpen(false); }} />}
    </section>
  );
}
