import { Fragment, useMemo, useState, type ReactNode } from 'react';
import type { Project } from '../../types';
import { conceptToDesign, type ConceptPart, type ConceptRow } from '../../calc/loadAssessmentProgress';

const f0 = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });

/** The assessment, the rooms and the load schedules designed so far, side by side. Nothing
 * is shown while the assessment is the only figure. */
export function ConceptToDesignTable({ project, here, heading }: { project: Project; here?: boolean; heading?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const c = useMemo(() => conceptToDesign(project), [project]);
  if (!c || c.rows.length < 2) return null;
  const many = c.rows.some((r) => r.buildings.length > 1);
  const from = (r: ConceptRow) => r.key === 'assessment' ? `${here ? 'this page' : 'Load assessment'} · MD ${f0(c.mdKva)} kVA`
    : r.key === 'rooms' ? 'Building · no diversity between flats; no lifts, pumps or EV'
    : c.plannedDbs > 0 ? `${c.dbs} of ${c.plannedDbs} DBs` : `${c.boards} boards`;
  const note = (r: ConceptRow) => r.key === 'rooms' && c.mdOfRooms !== undefined ? `MD is ${c.mdOfRooms.toFixed(2)} of it`
    : r.key === 'designed' && c.designedPct !== undefined ? `${Math.round(c.designedPct)} % of the assessment` : undefined;
  const sub = (r: ConceptRow, p: ConceptPart) => <tr key={`${r.key}-${p.id}`}>
    <td><span className="m" style={{ paddingLeft: 16 }}>{p.name}</span></td>
    <td className="m">{r.key === 'designed' && p.plannedDbs ? `${p.dbs ?? 0} of ${p.plannedDbs} DBs` : ''}</td>
    <td>{f0(p.connectedKw)}</td><td>{f0(p.demandKw)}</td><td />
  </tr>;
  return <>
    {heading}
    <table className="bi-table la-table">
      <thead><tr><th>Figure</th><th>From</th><th>Connected kW</th><th>Demand kW</th><th /></tr></thead>
      <tbody>
        {c.rows.map((r) => <Fragment key={r.key}>
          <tr>
            <td>{r.key === 'assessment' ? <><b>Assessment</b> <span className="m">at the transformer</span></>
              : r.key === 'rooms' ? <><b>Rooms</b> <span className="m">sum of rooms and flats</span></>
              : <><b>Designed so far</b> <span className="m">load schedules</span></>}</td>
            <td className="m la-c2d-from">{from(r)}</td>
            <td>{f0(r.connectedKw)}</td>
            <td><b>{f0(r.demandKw)}</b></td>
            <td><div className="la-c2d"><div className="la-bar"><i style={{ width: `${(r.demandKw / c.maxDemandKw) * 100}%` }} /></div>{note(r) && <span className="m">{note(r)}</span>}</div></td>
          </tr>
          {open && r.buildings.length > 1 && r.buildings.map((p) => sub(r, p))}
        </Fragment>)}
      </tbody>
    </table>
    {many && <button className="linkish" style={{ marginLeft: 0 }} onClick={() => setOpen(!open)}>{open ? 'Hide buildings' : 'Per building'}</button>}
  </>;
}
