import type { ElvSystem } from '../../elv/defaults';
import { checkElvRoute, ELV_ROUTE_RULES } from './elvCadRoutes';
import { SYSTEMS } from './elvLabels';

type Precision = 'fast' | 'balanced' | 'detailed';
type Plan = null | { ok: false; message: string } | { ok: true; routes: { lengthM: number; bends: number }[]; stats: { cells: number; gridM: number; approxBytes: number } };

export default function ElvRoutePlannerPanel({ system, onSystem, options, onOptions, precision, onPrecision, plan, selected, onSelected, pickingStart, lvObstacles, preferredRuns, maxOptions, maxCells, canApprove, onApprove, onReset }: {
  system: ElvSystem;
  onSystem: (system: ElvSystem) => void;
  options: number;
  onOptions: (count: number) => void;
  precision: Precision;
  onPrecision: (precision: Precision) => void;
  plan: Plan;
  selected: number;
  onSelected: (index: number) => void;
  pickingStart: boolean;
  lvObstacles: number;
  preferredRuns: number;
  maxOptions: number;
  maxCells: number;
  canApprove: boolean;
  onApprove: () => void;
  onReset: () => void;
}) {
  const rule = ELV_ROUTE_RULES[system];
  const memory = plan?.ok ? `${(plan.stats.approxBytes / 1024 / 1024).toFixed(1)} MB` : '';
  return (
    <>
      <label>ELV system<select aria-label="ELV route system" value={system} onChange={(e) => onSystem(e.target.value as ElvSystem)}>
        {SYSTEMS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select></label>
      <label>Alternatives<select aria-label="ELV route alternatives" value={options} onChange={(e) => onOptions(Number(e.target.value))}>
        {Array.from({ length: maxOptions }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}{i === 0 ? ' (least work)' : ''}</option>)}
      </select></label>
      <label>Precision<select aria-label="ELV route precision" value={precision} onChange={(e) => onPrecision(e.target.value as Precision)}>
        <option value="fast">Fast · 0.50 m</option><option value="balanced">Balanced · 0.25 m</option><option value="detailed">Detailed · 0.15 m</option>
      </select></label>
      <span className="m">{rule.lengthRule}<br />Keep {rule.separationM.toFixed(1)} m from LV routes · {rule.containment}.</span>
      <span className="m">{lvObstacles ? `${lvObstacles} LV route piece${lvObstacles === 1 ? '' : 's'} used as segregation exclusions.` : 'No LV cable route is drawn on this plan; segregation cannot be checked yet.'}<br />{preferredRuns ? `${preferredRuns} matching containment run${preferredRuns === 1 ? '' : 's'} preferred.` : 'No matching containment run is drawn; a new route may be proposed.'}</span>
      <span className="m">{pickingStart ? 'Source set — click the destination.' : plan ? 'Choose a compliant option below, then approve it.' : 'Click the source, then the destination. Wall layers remain hard obstacles.'}</span>
      {plan && !plan.ok && <span className="warn">{plan.message}</span>}
      {plan?.ok && <>
        {plan.routes.map((route, i) => {
          const check = checkElvRoute(system, route.lengthM);
          return <label key={i}><input type="radio" name="elv-route-option" checked={selected === i} onChange={() => onSelected(i)} /> Route {String.fromCharCode(65 + i)}{i === 0 ? ' · Recommended' : ''} · {route.lengthM.toFixed(1)} m · {route.bends} bend{route.bends === 1 ? '' : 's'} · {check.status === 'pass' ? 'Pass' : check.status === 'fail' ? 'Fail' : 'Review'}<br /><span className={check.status === 'fail' ? 'warn' : 'm'}>{check.text}</span></label>;
        })}
        <span className="m">Bounded search: {plan.stats.cells.toLocaleString()} / {maxCells.toLocaleString()} cells · {memory} working arrays · {plan.stats.gridM.toFixed(2)} m grid.</span>
        <div className="cad-devbtns"><button className="chip primary" disabled={!canApprove} onClick={onApprove}>Approve route {String.fromCharCode(65 + selected)}</button><button className="chip" onClick={onReset}>Start again</button></div>
      </>}
      {!plan?.ok && plan && <div className="cad-devbtns"><button className="chip" onClick={onReset}>Start again</button></div>}
      <span className="m">Maximum {maxOptions} alternatives. Search arrays are reused and discarded; only the approved route is stored.</span>
    </>
  );
}
