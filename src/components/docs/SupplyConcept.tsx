import { useMemo, type ReactNode } from 'react';
import type { Project } from '../../types';
import { supplyProgress, type SupplyRow } from '../../calc/supplyProgress';

const f0 = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });

/** The transformers from the load assessment, the space plan and the network, side by side. Nothing is shown while there is only one. */
export function SupplyConceptTable({ project, heading }: { project: Project; heading?: ReactNode }) {
  const rows = useMemo(() => supplyProgress(project), [project]);
  if (rows.length < 2) return null;
  const from = (r: SupplyRow) => r.key === 'assessment' ? 'Load assessment · MD at the transformer'
    : r.key === 'plan' ? `areas on MDBs, MDBs on transformers${r.rmus ? `, ${r.rmus} RMU${r.rmus === 1 ? '' : 's'}` : ''}`
    : 'Panels → Transformers';
  return <>
    {heading}
    <table className="bi-table la-table">
      <thead><tr><th>Figure</th><th>From</th><th>Transformers</th><th>MD kVA</th><th>Loading</th></tr></thead>
      <tbody>
        {rows.map((r) => <tr key={r.key}>
          <td className="la-c2d-fig"><b>{r.key === 'assessment' ? 'Assessment' : r.key === 'plan' ? 'Space plan' : 'Network'}</b></td>
          <td className="m la-c2d-from">{from(r)}</td>
          <td className={r.differs ? 'warn' : undefined}>{r.differs ? <b>{r.transformers}</b> : r.transformers}</td>
          <td>{f0(r.demandKva)}</td>
          <td><div className="la-c2d"><div className="la-bar"><i style={{ width: `${Math.min(100, r.loadingPct)}%` }} /></div><span className="m">{Math.round(r.loadingPct)} %</span></div></td>
        </tr>)}
      </tbody>
    </table>
  </>;
}
