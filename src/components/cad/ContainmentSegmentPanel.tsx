import type { ContainmentCheckResult, ContainmentSegmentCheck, ContainmentSegmentStatus } from '../../model/cadContainmentCheck';
import { CONTAINMENT_CHECK_LIMITS } from '../../model/cadContainmentCheck';

const STATUS: Record<ContainmentSegmentStatus, string> = {
  'within-limit': 'Within limit',
  review: 'Review',
  overloaded: 'Overloaded',
  unassigned: 'Route not assigned',
  limited: 'Check limit reached'
};

const mark = (status: ContainmentSegmentStatus) => status === 'within-limit' ? '✓' : status === 'overloaded' ? '!' : '⚠';
const pct = (value: number | undefined) => value === undefined ? '—' : `${value.toFixed(1)}%`;

export default function ContainmentSegmentPanel({ result, selectedId, onSelect, onApply, onOpenAssignments }: {
  result: ContainmentCheckResult;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onApply: (segment: ContainmentSegmentCheck) => void;
  onOpenAssignments: () => void;
}) {
  const selected = result.segments.find((segment) => segment.id === selectedId);
  const canApply = !!selected?.recommendedWidthMm && selected.recommendedTiers === 1 && selected.recommendedWidthMm !== selected.installedWidthMm;
  return (
    <>
      <h4>Containment check <span className="m">LV only</span></h4>
      <div className="cad-devform">
        <span className="m">{result.segments.length} segment{result.segments.length === 1 ? '' : 's'} checked on this drawing · {result.issues} to review. Click a tray segment or choose it below.</span>
        {result.truncated && <span className="m">Only the first {CONTAINMENT_CHECK_LIMITS.segments} tray segments are checked in one run.</span>}
      </div>
      <div className="cad-layers" role="list" aria-label="LV containment segments">
        {result.segments.map((segment) => (
          <button key={segment.id} type="button" role="listitem" aria-current={segment.id === selectedId || undefined} onClick={() => onSelect(segment.id)}>
            <b>{mark(segment.status)} {segment.name}</b>{segment.routeName ? ` · Route ${segment.routeName}` : ''}<span className="m">{pct(segment.fillPct)} · {STATUS[segment.status]}</span>
          </button>
        ))}
      </div>
      {!result.segments.length ? <p className="m">No cable-tray runs are drawn in this file.</p> : !selected ? <p className="m">Select a segment to see its installed size, LV cables and recommendation.</p> : (
        <>
          <h4>{selected.name} <span className="m">{STATUS[selected.status]}</span></h4>
          <dl className="cad-props">
            <dt>Route</dt><dd>{selected.routeName ?? 'Not assigned'}</dd>
            <dt>Installed tray</dt><dd>{selected.installedWidthMm} mm{selected.depthMm ? ` × ${selected.depthMm} mm` : ''}</dd>
            <dt>Assigned LV cables</dt><dd>{selected.cableCount ?? '—'}</dd>
            <dt>Usable fill</dt><dd>{pct(selected.fillPct)}</dd>
            <dt>Design limit</dt><dd>{selected.fillLimitPct === undefined ? '—' : `${selected.fillLimitPct}%`}</dd>
            <dt>Sizing basis</dt><dd>{selected.method === 'fill' ? 'Fill area' : selected.method === 'spacing' ? `Cable spacing + ${selected.sparePct}% spare` : '—'}</dd>
            <dt>Recommendation</dt><dd>{selected.recommendedWidthMm ? `${selected.recommendedTiers && selected.recommendedTiers > 1 ? `${selected.recommendedTiers} tiers × ` : ''}${selected.recommendedWidthMm} mm` : selected.routeName ? 'Complete the cable assignments and sizes first' : 'Assign a valid route first'}</dd>
          </dl>
          {selected.notes.length > 0 && <div className="cad-devform">{selected.notes.map((note) => <span className="m" key={note}>{note}</span>)}</div>}
          <div className="cad-devbtns">
            <button type="button" className="chip primary" disabled={!canApply} onClick={() => onApply(selected)}>Apply recommended size</button>
            <button type="button" className="chip" onClick={onOpenAssignments}>Open cable assignments</button>
          </div>
          {selected.recommendedTiers && selected.recommendedTiers > 1 && <p className="m">The recommendation needs multiple tiers; update the tray schedule before changing this segment.</p>}
        </>
      )}
      <p className="m">Calculated only while this tool is open. No route index is saved; temporary results are discarded when the check closes. Limits: {CONTAINMENT_CHECK_LIMITS.segments} segments, {CONTAINMENT_CHECK_LIMITS.routes} routes, {CONTAINMENT_CHECK_LIMITS.cableInstancesPerRoute.toLocaleString('en-GB')} cable instances per route.</p>
    </>
  );
}
