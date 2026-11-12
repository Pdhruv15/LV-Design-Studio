import { EXTERNAL_ENGINES } from '../engines';
import type { SupplyMode } from '../calc/scenario';
import { CircleCheck, CircleX, TriangleAlert, X } from 'lucide-react';
import { fmtTime } from '../util/format';

export type ResultSource = 'builtin' | string; // or an external engine id

/** The state of the results on the diagram: the operating scenario while it is not the normal one, whether the
 * studies are up to date, and whether the values come from the built-in engine or a full engine study. Which values
 * show, the colouring and the scenario are chosen on the SLD ribbon (Results). */
export default function DiagramResultsBar({
  source,
  onSource,
  onRun,
  running,
  note,
  supply,
  onSupply,
  calc
}: {
  source: ResultSource;
  onSource: (s: ResultSource) => void;
  onRun: () => void;
  running: boolean;
  note?: { text: string; cls?: string };
  supply: SupplyMode;
  onSupply: (m: SupplyMode) => void;
  /** State of the network studies: out of date (with what), failing checks, and when they last ran. */
  calc?: { stale: number; staleWhat?: string; fails: number; at?: number; onRun: () => void };
}) {
  const supplyLabel = supply === 'generator' ? 'On generator' : supply.startsWith('outage:') ? `Transformer of ${supply.slice(7)} failed` : '';
  const dot = note?.cls?.includes('bad') ? 'var(--bad)' : note?.cls?.includes('warn') || note?.cls?.includes('stale') ? 'var(--warn)' : 'var(--ok)';
  return (
    <>
      {supplyLabel && <button className="chip supply-pick active" onClick={() => onSupply('normal')} title="Back to normal supply" aria-label={`${supplyLabel} — back to normal supply`}>{supplyLabel} <X size={13} aria-hidden /></button>}
      {calc && (calc.stale ? (
        <button className="chip calc-chip warn" onClick={calc.onRun} title={`Out of date: ${calc.staleWhat ?? 'the studies'} — click to run (F5)`}><TriangleAlert size={13} aria-hidden /> Out of date · Run</button>
      ) : (
        <span className={`calc-chip ${calc.fails ? 'bad' : 'ok'}`} title={`Calculations up to date${calc.at ? ` — run at ${fmtTime(calc.at)}` : ''}${calc.fails ? ` · ${calc.fails} check(s) failing — see the results below` : ''}`}>
          {calc.fails ? <><CircleX size={13} aria-hidden /> {calc.fails} failing</> : <><CircleCheck size={13} aria-hidden /> Calculated</>}{calc.at ? <span className="m"> · {fmtTime(calc.at)}</span> : null}
        </span>
      ))}
      <label className="results-src" title={note?.text}>
        {source !== 'builtin' && <span className="res-dot" style={{ background: dot }} />}
        <select className="chip" value={supply === 'generator' ? 'builtin' : source} disabled={supply === 'generator'} onChange={(e) => onSource(e.target.value)} aria-label="Results from">
          <option value="builtin">Results: built-in</option>
          {EXTERNAL_ENGINES.map((e) => <option key={e.id} value={e.id}>Results: {e.name} load flow</option>)}
        </select>
      </label>
      {source !== 'builtin' && <button className="chip primary" disabled={running} onClick={onRun}>{running ? 'Running…' : 'Run simulation'}</button>}
      {note && source !== 'builtin' && <span className={`results-note ${note.cls ?? 'm'}`}>{note.text}</span>}
    </>
  );
}
