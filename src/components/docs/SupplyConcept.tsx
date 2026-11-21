import { useMemo, type ReactNode } from 'react';
import type { Project } from '../../types';
import { settingsOf } from '../../types';
import { generatorProgress, supplyProgress, type SupplyRow } from '../../calc/supplyProgress';

const f0 = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });

/** The transformers from the load assessment, the space plan and the network, side by side. Nothing is shown while there is only one. */
export function SupplyConceptTable({ project, heading, withStudy }: { project: Project; heading?: ReactNode; withStudy?: boolean }) {
  const rows = useMemo(() => supplyProgress(project, withStudy), [project, withStudy]);
  if (rows.length < 2) return null;
  const from = (r: SupplyRow) => r.key === 'assessment' ? 'Load assessment · MD at the transformer'
    : r.key === 'plan' ? `areas on MDBs, MDBs on transformers${r.rmus ? `, ${r.rmus} RMU${r.rmus === 1 ? '' : 's'}` : ''}`
    : r.key === 'study' ? `network demand + ${settingsOf(project).futureGrowthPct} % growth, at ${settingsOf(project).transformerMaxLoadingPct} % loading`
    : 'Panels → Transformers';
  return <>
    {heading}
    <table className="bi-table la-table">
      <thead><tr><th>Figure</th><th>From</th><th>Transformers</th><th>MD kVA</th><th>Loading</th></tr></thead>
      <tbody>
        {rows.map((r) => <tr key={r.key}>
          <td className="la-c2d-fig"><b>{r.key === 'assessment' ? 'Assessment' : r.key === 'plan' ? 'Space plan' : r.key === 'study' ? 'This study' : 'Network'}</b></td>
          <td className="m la-c2d-from">{from(r)}</td>
          <td className={r.differs ? 'warn' : undefined}>{r.differs ? <b>{r.transformers}</b> : r.transformers}</td>
          <td>{f0(r.demandKva)}</td>
          <td><div className="la-c2d"><div className="la-bar"><i style={{ width: `${Math.min(100, r.loadingPct)}%` }} /></div><span className="m">{Math.round(r.loadingPct)} %</span></div></td>
        </tr>)}
      </tbody>
    </table>
  </>;
}

/** The standby generator from the load assessment, this study and the network, side by side. Nothing is shown while there is only one. */
export function GeneratorConceptTable({ project, heading }: { project: Project; heading?: ReactNode }) {
  const g = useMemo(() => generatorProgress(project), [project]);
  if (g.rows.length < 2) return null;
  const margin = project.loadAssessment?.supply.genMargin;
  const from = (key: string) => key === 'assessment' ? `each category's share on the generator, × ${margin ?? ''}`
    : key === 'study' ? 'boards and essential circuits; the largest motor started last'
    : 'generator on the EMDB / ATS';
  return <>
    {heading}
    <table className="bi-table la-table">
      <thead><tr><th>Figure</th><th>From</th><th>Essential kW</th><th>Needed kVA</th><th>Set</th></tr></thead>
      <tbody>
        {g.rows.map((r) => <tr key={r.key}>
          <td className="la-c2d-fig"><b>{r.key === 'assessment' ? 'Assessment' : r.key === 'study' ? 'This study' : 'Network'}</b></td>
          <td className="m la-c2d-from">{from(r.key)}</td>
          <td>{r.essentialKw === undefined ? '—' : f0(r.essentialKw)}</td>
          <td>{r.neededKva === undefined ? '—' : f0(r.neededKva)}</td>
          <td className={r.differs ? 'warn' : undefined}>{r.differs ? <b>{r.setText}</b> : r.setText}</td>
        </tr>)}
      </tbody>
    </table>
    {g.standInFeeders > 0 && <div className="m">Of the essential load, {f0(g.standInKw)} kW are still stand-in feeders made from the load assessment or the space plan ({g.standInFeeders} feeders). They are counted because they are marked essential.</div>}
  </>;
}
