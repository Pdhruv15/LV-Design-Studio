import { useMemo } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { Project, Rmu } from '../types';
import { DM_TYPES, type DmSubstationType } from '../calc/dmSubstation';
import { addRmuTo, addSubstation, canMoveSubstation, moveSubstation, renameSubstation, setSubstationOwner, substationRows, updateSubstation, type SubstationRmu } from '../model/substations';
import { txTags } from '../model/transformers';

/** One RMU on the card: name, configuration, tee-off protection and its normally open switch. */
const rmuText = (m: SubstationRmu) => [m.name, m.config ?? '—', m.tOff === 'vcb' ? 'CB' : m.fuseA ? `fuse ${m.fuseA} A` : undefined, m.normallyOpen ? `N/O ${m.normallyOpen}` : undefined].filter(Boolean).join(' · ');

/** Panels → Transformers → Substations (proposal 2026-11-18, part 4): one row per substation in ring order, with its
 * DM-D-013 type and location (the Substation area page's record), its RMUs and transformers, the owner of its RMUs and
 * its checks. ▲ ▼ change the ring order the SLD draws. */
export default function SubstationsCard({ project, onChange, onStatus }: { project: Project; onChange: (p: Project) => void; onStatus: (m: string) => void }) {
  const rows = useMemo(() => substationRows(project), [project]);
  const tags = useMemo(() => txTags(project), [project]);
  const byId = useMemo(() => new Map(project.boards.map((b) => [b.id, b])), [project]);
  function add() {
    const r = addSubstation(project);
    onChange(r.project);
    onStatus(`${r.name} added: put transformers in it in the table above, or right-click a transformer on the SLD → Substation`);
  }
  /** A blank or taken name puts the old one back. */
  function rename(input: HTMLInputElement, from: string) {
    const r = renameSubstation(project, from, input.value);
    if (r.problem) onStatus(r.problem);
    if (r.project !== project) onChange(r.project); else input.value = from;
  }
  function addRmu(ss: string) {
    const r = addRmuTo(project, ss);
    onChange(r.project);
    onStatus(`${r.name} added to ${ss} (RRT, no transformer yet): pick it in a transformer's RMU column`);
  }

  return (
    // After the other cards, across the whole row: none of them moves, and the table has room.
    <section className="card" style={{ gridColumn: '1 / -1' }}>
      <h4>Substations</h4>
      <p className="m">In ring order: the SLD draws them left to right, and the ring runs through their RMUs in this order. The type and location are the Substation area page's (DM-D-013).</p>
      {rows.length ? (
        <div className="pp-table">
          <table className="bi-table compact">
            <thead><tr><th></th><th>Substation</th><th>Type (DM-D-013)</th><th>Location</th><th>RMUs</th><th>Transformers</th><th>Owner</th><th>Checks</th></tr></thead>
            <tbody>{rows.map((r, i) => {
              const owners = new Set(r.rmus.map((m) => m.owner ?? ''));
              const owner = owners.size === 1 ? [...owners][0] : 'mixed';
              const spares = r.rmus.reduce((s, m) => s + m.spares, 0);
              return (
                <tr key={r.name.toLowerCase()}>
                  <td>
                    <button className="icon-btn" disabled={!canMoveSubstation(rows, i, -1)} title="One place earlier on the ring" aria-label={`Move ${r.name} up`} onClick={() => onChange(moveSubstation(project, r.name, -1))}><ArrowUp size={14} /></button>
                    <button className="icon-btn" disabled={!canMoveSubstation(rows, i, 1)} title="One place later on the ring" aria-label={`Move ${r.name} down`} onClick={() => onChange(moveSubstation(project, r.name, 1))}><ArrowDown size={14} /></button>
                  </td>
                  <td><input className="bi-text" style={{ width: 80 }} defaultValue={r.name} key={`${r.name}-name`} aria-label="Substation name" onBlur={(e) => rename(e.target, r.name)} /></td>
                  <td><select value={r.record?.type ?? ''} aria-label={`${r.name} type`} onChange={(e) => e.target.value && onChange(updateSubstation(project, r.name, { type: e.target.value as DmSubstationType }))}>
                    {!r.record && <option value="">—</option>}
                    {DM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select></td>
                  <td><input className="bi-text" style={{ width: 110 }} defaultValue={r.record?.building ?? ''} key={`${r.name}-${r.record?.building ?? ''}`} placeholder="—" aria-label={`${r.name} location`}
                    onBlur={(e) => e.target.value.trim() !== (r.record?.building ?? '') && onChange(updateSubstation(project, r.name, { building: e.target.value }))} /></td>
                  <td>
                    {r.rmus.map((m) => <div key={m.name} title={m.feeds.length ? `Feeds ${m.feeds.map((id) => tags.get(id) ?? id).join(', ')}` : 'Feeds no transformer yet'}>{rmuText(m)}</div>)}
                    <button className="chip" title={`A new RMU in ${r.name}, RRT, feeding no transformer yet`} onClick={() => addRmu(r.name)}>+ RMU</button>
                  </td>
                  <td>
                    {r.transformers.map((id) => <div key={id}>{[tags.get(id) ?? 'no transformer', byId.get(id)?.sourceKva ? `${byId.get(id)!.sourceKva} kVA` : undefined, id].filter(Boolean).join(' · ')}</div>)}
                    {spares > 0 && <div className="m">{spares} tee-off{spares === 1 ? '' : 's'} spare</div>}
                    {!r.transformers.length && !spares && <span className="m">None yet</span>}
                  </td>
                  <td>{r.rmus.length ? (
                    <select value={owner} aria-label={`${r.name} owner`} title="Set on each of its RMUs" onChange={(e) => e.target.value !== 'mixed' && onChange(setSubstationOwner(project, r.name, (e.target.value || undefined) as Rmu['owner']))}>
                      <option value="">—</option><option value="authority">Authority</option><option value="consumer">Consumer</option>
                      {owner === 'mixed' && <option value="mixed" disabled>Mixed</option>}
                    </select>
                  ) : <span className="m" title="The owner is kept on the RMUs">—</span>}</td>
                  <td>{r.checks.length ? r.checks.map((k) => <div key={k.text} className={k.status}>{k.text}</div>) : <span className="m">—</span>}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      ) : <p className="m">No substations yet: name one on a transformer above, or add one.</p>}
      <button className="chip" onClick={add}>+ Substation</button>
    </section>
  );
}
