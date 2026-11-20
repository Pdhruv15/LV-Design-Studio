import type { LvRoutePlan, LvRoutePrecision } from '../../model/lvRoutePlanner';
import { LV_ROUTE_LIMITS } from '../../model/lvRoutePlanner';

export type LvRouteMode = 'manual' | 'optimal';

export default function LvRoutePlannerPanel({ mode, onMode, options, onOptions, precision, onPrecision, plan, selected, onSelected, pickingStart, impact, canApprove, onApprove, onReset }: {
  mode: LvRouteMode;
  onMode: (mode: LvRouteMode) => void;
  options: number;
  onOptions: (count: number) => void;
  precision: LvRoutePrecision;
  onPrecision: (precision: LvRoutePrecision) => void;
  plan: LvRoutePlan | null;
  selected: number;
  onSelected: (index: number) => void;
  pickingStart: boolean;
  impact?: { currentM: number; proposedM: number; detail: string };
  canApprove: boolean;
  onApprove: () => void;
  onReset: () => void;
}) {
  const memory = plan?.ok ? `${(plan.stats.approxBytes / 1024 / 1024).toFixed(1)} MB` : '';
  return (
    <>
      <label>Routing<select aria-label="Cable routing method" value={mode} onChange={(e) => onMode(e.target.value as LvRouteMode)}>
        <option value="manual">Manual points</option>
        <option value="optimal">Optimal LV route</option>
      </select></label>
      {mode === 'manual' ? <span className="m">Click the route's points, Enter to finish.</span> : <>
        <label>Alternatives<select aria-label="LV route alternatives" value={options} onChange={(e) => onOptions(Number(e.target.value))}>
          {Array.from({ length: LV_ROUTE_LIMITS.maxOptions }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}{i === 0 ? ' (least work)' : ''}</option>)}
        </select></label>
        <label>Precision<select aria-label="LV route precision" value={precision} onChange={(e) => onPrecision(e.target.value as LvRoutePrecision)}>
          <option value="fast">Fast · 0.50 m</option>
          <option value="balanced">Balanced · 0.25 m</option>
          <option value="detailed">Detailed · 0.15 m</option>
        </select></label>
        <span className="m">{pickingStart ? 'Start point set — click the destination.' : plan ? 'Choose an option below, then approve it.' : 'Click the source point, then the destination. Only Wall layers are obstacles.'}</span>
        {plan && !plan.ok && <span className="warn">{plan.message}</span>}
        {plan?.ok && <>
          {plan.routes.map((route, i) => <label key={i}>
            <input type="radio" name="lv-route-option" checked={selected === i} onChange={() => onSelected(i)} />
            Route {String.fromCharCode(65 + i)}{i === 0 ? ' · Recommended' : ''} · {route.lengthM.toFixed(1)} m · {route.bends} bend{route.bends === 1 ? '' : 's'}
          </label>)}
          {impact && <span className="m">Feeder length {impact.currentM} → {impact.proposedM} m<br />{impact.detail}</span>}
          <span className="m">Bounded search: {plan.stats.cells.toLocaleString()} / {LV_ROUTE_LIMITS.maxCells.toLocaleString()} cells · {memory} working arrays · {plan.stats.gridM.toFixed(2)} m grid.</span>
          <div className="cad-devbtns">
            <button className="chip primary" disabled={!canApprove} onClick={onApprove}>Approve route {String.fromCharCode(65 + selected)}</button>
            <button className="chip" onClick={onReset}>Start again</button>
          </div>
        </>}
        {!plan?.ok && plan && <div className="cad-devbtns"><button className="chip" onClick={onReset}>Start again</button></div>}
        <span className="m">Maximum 3 alternatives. The main typed arrays are reused; schedules change only when a route is approved.</span>
      </>}
    </>
  );
}
