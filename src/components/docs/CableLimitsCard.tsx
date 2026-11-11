import { X } from 'lucide-react';
import { useState } from 'react';
import { DEFAULT_CABLE_TYPE } from '../../types';
import { CABLE_TYPES_ALL, cableTypeDef } from '../../model/cableTypes';
import {
  DB_WIRING, DEFAULT_FEEDER, LIMIT_MODES, changedRowCount, rowOrigin,
  type CableLimitRow, type CableLimitSet, type CableLimitTable, type LimitMode
} from '../../calc/authorityLimits';

const KEYS = [DEFAULT_FEEDER, DB_WIRING, ...CABLE_TYPES_ALL];
const keyLabel = (k: string) => (k === DEFAULT_FEEDER ? `Default cable (${cableTypeDef(DEFAULT_CABLE_TYPE).code})` : k === DB_WIRING ? 'DB circuits (type not set)' : k);
const tabLabel = (t: CableLimitTable) => `${t.label || 'New table'}${t.phases === 'single' ? ' · 1-phase' : t.phases === 'three' ? ' · 3-phase' : ''}`;
const newTable = (): CableLimitTable => ({ id: `t-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, label: '', cableTypes: [], rows: [] });

/** Design references → Cable / breaker limits: the reference's limit tables
 * (or those it inherits), read only for built-in references. Editing an
 * inherited set makes this reference's own copy; rows show whether they
 * still match the base reference. */
export function CableLimitsCard({ limits, own, from, base, readOnly, authority, onChange }: {
  /** The limits in effect for the reference (its own or inherited). */
  limits?: CableLimitSet;
  /** Whether the reference has its own copy. */
  own: boolean;
  /** Name of the reference the limits come from, when inherited. */
  from?: string;
  /** The limits of the reference this one builds on or was copied from. */
  base?: CableLimitSet;
  readOnly: boolean;
  /** Authority name for a new set, e.g. "ADDC". */
  authority: string;
  onChange: (limits: CableLimitSet | undefined) => void;
}) {
  const [tabId, setTabId] = useState<string | undefined>();
  if (!limits) {
    return (
      <section className="card u-mb-3">
        <h4 className="u-flush u-mb-2">Cable / breaker limits</h4>
        <p className="m">{readOnly ? 'No cable / breaker limit tables: cables are sized by the calculation only.' : 'No limit tables yet: cables are sized by the calculation only. Add a table of the authority\'s maximum breaker and load for each cable size.'}</p>
        {!readOnly && <button className="chip" onClick={() => { const t = newTable(); setTabId(t.id); onChange({ name: authority, mode: 'size-up', dbFeederMin: { csaMm2: 0, breakerA: 0 }, tables: [t] }); }}>+ Limits</button>}
      </section>
    );
  }
  const tab = limits.tables.find((t) => t.id === tabId) ?? limits.tables[0];
  const edit = (patch: Partial<CableLimitSet>) => onChange({ ...structuredClone(limits), ...patch });
  const setTable = (id: string, patch: Partial<CableLimitTable>) => edit({ tables: limits.tables.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
  const setRow = (t: CableLimitTable, i: number, patch: Partial<CableLimitRow>) => setTable(t.id, { rows: t.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const num = (v: string) => (v === '' ? 0 : +v);
  const changed = base ? changedRowCount(limits, base) : 0;
  const baseTable = tab && base?.tables.find((t) => t.id === tab.id);
  const sub = readOnly
    ? 'built-in, read only — duplicate to customise'
    : !own && from ? `from ${from} — any change makes this reference's own copy`
      : base ? `${changed} row${changed === 1 ? '' : 's'} changed from ${base.name}` : '';

  return (
    <section className="card u-mb-3">
      <div className="stage-head">
        <h4 className="u-flush">Cable / breaker limits {sub && <span className="m" style={{ fontWeight: 400 }}>{sub}</span>}</h4>
        {!readOnly && <div className="row">
          {baseTable && <button className="chip" onClick={() => setTable(tab.id, structuredClone(baseTable))}>Reset table to {base!.name}</button>}
          {own && base && <button className="chip" title={`Use the limits of the reference this one comes from (${base.name})`} onClick={() => onChange(undefined)}>Use {base.name}'s</button>}
        </div>}
      </div>
      <div className="grid2" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <label>Limits
          <select value={limits.mode} disabled={readOnly} onChange={(e) => edit({ mode: e.target.value as LimitMode })}>
            {LIMIT_MODES.map(([m, l]) => <option key={m} value={m}>{l}</option>)}
          </select>
        </label>
        <label>DB feeder minimum cable (mm²)
          <input type="number" min={0} step={0.5} value={limits.dbFeederMin.csaMm2} disabled={readOnly} title="0: no minimum" onChange={(e) => edit({ dbFeederMin: { ...limits.dbFeederMin, csaMm2: num(e.target.value) } })} />
        </label>
        <label>DB feeder minimum breaker (A)
          <input type="number" min={0} value={limits.dbFeederMin.breakerA} disabled={readOnly} title="0: no minimum" onChange={(e) => edit({ dbFeederMin: { ...limits.dbFeederMin, breakerA: num(e.target.value) } })} />
        </label>
      </div>

      <div className="row" style={{ margin: '10px 0 8px' }}>
        <div className="seg" role="tablist" aria-label="Limit tables">
          {limits.tables.map((t) => <button key={t.id} role="tab" className={t.id === tab?.id ? 'on' : ''} aria-selected={t.id === tab?.id} onClick={() => setTabId(t.id)}>{tabLabel(t)}</button>)}
          {!readOnly && <button onClick={() => { const t = newTable(); setTabId(t.id); edit({ tables: [...limits.tables, t] }); }}>+ Table</button>}
        </div>
      </div>

      {tab && <>
        <div className="grid2" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          <label>Table name (shown in remarks)<input value={tab.label} disabled={readOnly} placeholder="e.g. DEWA Table 3" onChange={(e) => setTable(tab.id, { label: e.target.value })} /></label>
          <label>Circuits
            <select value={tab.phases ?? ''} disabled={readOnly} onChange={(e) => setTable(tab.id, { phases: (e.target.value || undefined) as CableLimitTable['phases'] })}>
              <option value="">Single- and three-phase</option><option value="single">Single-phase only</option><option value="three">Three-phase only</option>
            </select>
          </label>
          <div />
          <div style={{ gridColumn: '1 / -1' }}>
            <span className="m">Applies to cable types: </span>
            <span className="row" style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6 }}>
              {tab.cableTypes.map((k) => (
                <span key={k} className="chip on">{keyLabel(k)}{!readOnly && <button type="button" className="icon-btn" aria-label={`Remove ${keyLabel(k)}`} onClick={() => setTable(tab.id, { cableTypes: tab.cableTypes.filter((x) => x !== k) })}><X size={12} /></button>}</span>
              ))}
              {!readOnly && (
                <select aria-label="Add a cable type" value="" onChange={(e) => e.target.value && setTable(tab.id, { cableTypes: [...tab.cableTypes, e.target.value] })}>
                  <option value="">+ type</option>
                  {KEYS.filter((k) => !tab.cableTypes.includes(k)).map((k) => <option key={k} value={k}>{keyLabel(k)}</option>)}
                </select>
              )}
            </span>
          </div>
        </div>

        <div className="ref-scroll" style={{ marginTop: 8 }}>
          <table className="compact"><thead><tr><th className="num">Cable (mm²)</th><th className="num">Max MCB / MCCB (A)</th><th className="num">Max load (A)</th>{base && <th>From</th>}<th /></tr></thead><tbody>
            {tab.rows.map((r, i) => {
              const o = base ? rowOrigin(base, tab.id, r) : undefined;
              return (
                <tr key={i}>
                  <td className="num"><input type="number" min={0} step={0.5} style={{ width: 70 }} aria-label="Cable mm²" value={r.csaMm2} disabled={readOnly} onChange={(e) => setRow(tab, i, { csaMm2: num(e.target.value) })} /></td>
                  <td className="num"><input type="number" min={0} style={{ width: 70 }} aria-label="Max breaker A" value={r.maxBreakerA} disabled={readOnly} onChange={(e) => setRow(tab, i, { maxBreakerA: num(e.target.value) })} /></td>
                  <td className="num"><input type="number" min={0} style={{ width: 70 }} aria-label="Max load A" value={r.maxLoadA} disabled={readOnly} onChange={(e) => setRow(tab, i, { maxLoadA: num(e.target.value) })} /></td>
                  {o && <td className={o.kind === 'base' ? 'm' : ''}>{o.kind === 'base' ? base!.name : <>Here{o.was && <span className="m"> ({base!.name} {o.was.maxBreakerA}{o.was.maxLoadA !== o.was.maxBreakerA ? ` / ${o.was.maxLoadA}` : ''})</span>}</>}</td>}
                  <td>{!readOnly && <button className="icon-btn" aria-label="Remove row" onClick={() => setTable(tab.id, { rows: tab.rows.filter((_, j) => j !== i) })}><X size={14} /></button>}</td>
                </tr>
              );
            })}
            {!tab.rows.length && <tr><td colSpan={5} className="m">No rows yet.</td></tr>}
          </tbody></table>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          {!readOnly && <button className="chip" onClick={() => setTable(tab.id, { rows: [...tab.rows, { csaMm2: 0, maxBreakerA: 0, maxLoadA: 0 }] })}>+ Row</button>}
          {!readOnly && <button className="chip" onClick={() => { setTabId(undefined); edit({ tables: limits.tables.filter((t) => t.id !== tab.id) }); }}>Remove table</button>}
          <span className="m">Sizes are sorted on save. A size between two rows takes the smaller row; outside the table the calculation decides. Parallel runs count as runs × the row.</span>
        </div>
      </>}
    </section>
  );
}
