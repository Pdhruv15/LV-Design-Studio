import { useMemo } from 'react';
import type { GridSource, Project, Rmu } from '../types';
import { RMU_CONFIGS } from '../types';
import { gridFaultMva } from '../calc/electrical';
import { gridFaultKa, rmuChecks } from '../calc/hvSupply';
import { addGridSource, removeGridSource, updateGridSource, updateRmu } from '../model/hvSupply';

const OPERATORS = ['DEWA', 'ADDC', 'AADC', 'SEWA', 'FEWA', 'EtihadWE', 'Private network'];
const num = (v: string) => (v.trim() === '' ? undefined : Number(v));
const shown = (v: number | undefined, d = 1) => (v === undefined ? '—' : v.toLocaleString('en-US', { maximumFractionDigits: d }));

/** Panels → Transformers: the authority HV supply (its fault level sets the LV fault levels) and each RMU's details. */
export default function HvSupplyCard({ project, onChange }: { project: Project; onChange: (p: Project) => void }) {
  const grids = project.gridSources ?? [];
  const checks = useMemo(() => rmuChecks(project), [project]);
  const g = (s: GridSource, patch: Partial<GridSource>) => onChange(updateGridSource(project, s.id, patch));
  const r = (name: string, patch: Partial<Rmu>) => onChange(updateRmu(project, name, patch));
  const rec = (name: string) => project.rmus?.find((x) => x.name === name);
  // Typed values commit on blur, like the substation names.
  const numIn = (value: number | undefined, key: string, set: (v: number | undefined) => void, width = 60) => (
    <input className="bi-num" style={{ width }} inputMode="decimal" defaultValue={value ?? ''} key={`${key}-${value ?? ''}`} placeholder="—"
      onBlur={(e) => { const v = num(e.target.value); if (v !== value && (v === undefined || (Number.isFinite(v) && v > 0))) set(v); }} />
  );
  const textIn = (value: string | undefined, key: string, set: (v: string | undefined) => void, width = 90) => (
    <input className="bi-text" style={{ width }} defaultValue={value ?? ''} key={`${key}-${value ?? ''}`} placeholder="—"
      onBlur={(e) => { const v = e.target.value.trim() || undefined; if (v !== value) set(v); }} />
  );

  return (
    <section className="card">
      <h4>HV supply and RMUs</h4>
      <p className="m">The grid fault level from the authority sets the network impedance in front of each transformer. Without one the MV network is taken as infinite.</p>
      <div className="pp-table">
        <table className="bi-table compact">
          <thead><tr><th>Grid source</th><th>Operator</th><th>kV</th><th>Fault MVA</th><th>or kA</th><th>Duration s</th><th>X/R</th><th>Ik″ kA</th><th>Primary substation</th><th>Feeder</th><th></th></tr></thead>
          <tbody>{grids.map((s) => (
            <tr key={s.id}>
              <td>{textIn(s.name, `${s.id}-name`, (v) => g(s, { name: v ?? s.id }), 80)}</td>
              <td><select value={s.operator ?? ''} onChange={(e) => g(s, { operator: e.target.value || undefined })}><option value="">—</option>{[...new Set([...OPERATORS, ...(s.operator ? [s.operator] : [])])].map((o) => <option key={o} value={o}>{o}</option>)}</select></td>
              <td>{numIn(s.kv, `${s.id}-kv`, (v) => v && g(s, { kv: v }), 50)}</td>
              <td>{numIn(s.faultMva, `${s.id}-mva`, (v) => g(s, { faultMva: v }))}</td>
              <td>{numIn(s.faultMva ? undefined : s.faultKa, `${s.id}-ka`, (v) => g(s, { faultKa: v, ...(v ? { faultMva: undefined } : {}) }), 50)}</td>
              <td><select value={s.faultDurationS ?? ''} onChange={(e) => g(s, { faultDurationS: num(e.target.value) })}><option value="">—</option><option value={1}>1</option><option value={3}>3</option></select></td>
              <td>{numIn(s.xr, `${s.id}-xr`, (v) => g(s, { xr: v }), 45)}</td>
              <td title={gridFaultMva(s) ? `${shown(gridFaultMva(s))} MVA at ${shown(s.kv)} kV` : 'Enter the fault level (MVA or kA) from the authority'}>{shown(gridFaultKa(s))}</td>
              <td>{textIn(s.primarySubstation, `${s.id}-pss`, (v) => g(s, { primarySubstation: v }))}</td>
              <td>{textIn(s.feederRef, `${s.id}-fdr`, (v) => g(s, { feederRef: v }), 70)}</td>
              <td><button className="chip" onClick={() => onChange(removeGridSource(project, s.id))} title={`Remove ${s.name}`}>Remove</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <button className="chip" onClick={() => onChange(addGridSource(project))}>Add grid source</button>

      {checks.length > 0 && <>
        <div className="pp-table">
          <table className="bi-table compact">
            <thead><tr><th>RMU</th><th>Ways</th>{grids.length > 1 && <th>Fed from</th>}<th>Rated kV</th><th>A</th><th>Ik kA</th><th>s</th><th>Insulation</th><th>T-off</th><th>Fuse A</th><th>Owner</th><th>Checks</th></tr></thead>
            <tbody>{checks.map((c) => {
              const x = rec(c.rmu);
              return (
                <tr key={c.rmu}>
                  <td title={c.transformers.length ? `Feeds ${c.transformers.join(', ')}` : 'Feeds no transformer'}>{c.rmu}</td>
                  <td><select value={x?.config ?? ''} onChange={(e) => r(c.rmu, { config: e.target.value || undefined })}><option value="">—</option>{[...new Set([...RMU_CONFIGS, ...(x?.config ? [x.config] : [])])].map((o) => <option key={o} value={o}>{o}</option>)}</select></td>
                  {grids.length > 1 && <td><select value={x?.sourceId ?? ''} onChange={(e) => r(c.rmu, { sourceId: e.target.value || undefined })}><option value="">{grids[0].name}</option>{grids.slice(1).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></td>}
                  <td><select value={x?.ratedKv ?? ''} onChange={(e) => r(c.rmu, { ratedKv: num(e.target.value) })}><option value="">—</option>{[12, 24, 36].map((v) => <option key={v} value={v}>{v}</option>)}</select></td>
                  <td>{numIn(x?.ratedA, `${c.rmu}-a`, (v) => r(c.rmu, { ratedA: v }), 50)}</td>
                  <td>{numIn(x?.ikKa, `${c.rmu}-ik`, (v) => r(c.rmu, { ikKa: v }), 45)}</td>
                  <td><select value={x?.ikDurationS ?? ''} onChange={(e) => r(c.rmu, { ikDurationS: num(e.target.value) as 1 | 3 | undefined })}><option value="">—</option><option value={1}>1</option><option value={3}>3</option></select></td>
                  <td><select value={x?.insulation ?? ''} onChange={(e) => r(c.rmu, { insulation: (e.target.value || undefined) as Rmu['insulation'] })}><option value="">—</option><option value="SF6">SF6</option><option value="solid">Solid</option><option value="air">Air</option><option value="eco-gas">Eco-gas</option></select></td>
                  <td><select value={x?.tOff ?? ''} onChange={(e) => r(c.rmu, { tOff: (e.target.value || undefined) as Rmu['tOff'] })}><option value="">—</option><option value="fuse">Switch-fuse</option><option value="vcb">Breaker + relay</option></select></td>
                  <td>{x?.tOff === 'vcb' ? '—' : numIn(x?.fuseA, `${c.rmu}-fuse`, (v) => r(c.rmu, { fuseA: v }), 45)}</td>
                  <td><select value={x?.owner ?? ''} onChange={(e) => r(c.rmu, { owner: (e.target.value || undefined) as Rmu['owner'] })}><option value="">—</option><option value="authority">Authority</option><option value="consumer">Consumer</option></select></td>
                  <td>{c.checks.length ? c.checks.map((k) => <div key={k.label} className={k.status}>{k.text}</div>) : <span className="m">Enter ways and ratings to check</span>}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
        <p className="m">RMUs come from the RMU column above. Short-time ratings are compared at the supply's fault duration (same I²t).</p>
      </>}
    </section>
  );
}
