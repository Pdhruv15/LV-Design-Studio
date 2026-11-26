import { useMemo, useState } from 'react';
import { form4SizeText } from '../calc/form4';
import type { Board, Project } from '../types';
import { gridSourceOf, izText, type FeederResult } from '../calc/electrical';
import { boardRatedA, boardSummary } from '../calc/summary';
import BoardFields from './BoardFields';
import SupplyFields from './SupplyFields';
import { supplyPoint } from '../diagram/supplyPoint';
import { fedFromOfBoard, suppliedFromText } from '../model/supplyEdit';
import { roleOf } from '../model/emergency';
import { txt } from '../util/format';

export type BoardTab = 'general' | 'supply' | 'electrical' | 'protection' | 'location';
type Tab = BoardTab;

const statusLabel = { ok: 'Within limits', warn: 'Near rating (> 80 %)', bad: 'Overloaded' } as const;

/** Properties of a board: editable equipment data (General), the chain that
 * feeds it and the transformer at its head (Supply), computed electrical
 * values (Electrical), the incomer's settings and its protective device's
 * checks (Protection), and where it is and who makes it (Location), plus a
 * loading summary. What the SLD draws sits under General. */
const TABS: [Tab, string][] = [['general', 'General'], ['supply', 'Supply'], ['electrical', 'Electrical'], ['protection', 'Protection'], ['location', 'Location']];

export default function BoardPanel({
  project,
  board,
  results,
  onChange,
  onSelectFeeder,
  tab: tabProp,
  onTab,
  onEnclosure,
  main
}: {
  project: Project;
  board: Board;
  results: FeederResult[];
  onChange: (b: Board) => void;
  onSelectFeeder: (id: string) => void;
  /** Opens Design → Enclosure sizing for this board. */
  onEnclosure?: () => void;
  /** The live main board at the head of this board's chain: its transformer
   * is edited on the Supply tab (for a main board, the board itself). */
  main?: Board;
  /** Optional controlled tab (the ribbon's Board button opens General). */
  tab?: Tab;
  onTab?: (t: Tab) => void;
}) {
  const [localTab, setLocalTab] = useState<Tab>('general');
  const [headHeld, setHeadHeld] = useState<string>(); // the head's transformer fields stay while its rating is blank
  const tab = tabProp ?? localTab;
  const setTab = onTab ?? setLocalTab;
  const s = useMemo(() => boardSummary(project, board), [project, board]);
  const incomerResult = s.incomer ? results.find((r) => r.feeder.id === s.incomer!.id) : undefined;
  const isMain = !board.upstreamId;
  // Transformer → main board → … → this board.
  const chain = useMemo(() => {
    const out: Board[] = [];
    for (let b: Board | undefined = board; b && out.length < 50; b = b.upstreamId ? project.boards.find((x) => x.id === b!.upstreamId) : undefined) out.unshift(b);
    return out;
  }, [project, board]);
  const head = main ?? (isMain ? board : undefined);
  const headData = head ? fedFromOfBoard(head) : undefined;
  const headMode = head && headData !== 'transformer' && headHeld === head.id && !head.sourceKva ? 'transformer' : headData;
  const incomerCable = board.supply?.incomer && board.supply.incomer.cableCsaMm2 > 0 && board.supply.incomer.lengthM > 0 ? `${board.supply.incomer.cableCsaMm2} mm² × ${board.supply.incomer.lengthM} m` : '—';
  const firstIncomer = fedFromOfBoard(board) === 'transformer' ? 'Transformer secondary' : incomerCable;

  return (
    <>
      <div className="pn">
        <h3>
          {board.id}
          {s.loadingStatus && <span className={`pill ${s.loadingStatus}`}>{s.loadingStatus === 'ok' ? 'In service' : statusLabel[s.loadingStatus]}</span>}
        </h3>
        <div className="tabs ptabs" role="tablist">
          {TABS.map(([t, label]) => (
            <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'general' && <BoardFields board={board} onChange={onChange} section="general" groups={['board', 'sld']} />}
        {tab === 'location' && <BoardFields board={board} onChange={onChange} section="general" building={project.building} earthing={project.earthingPlan} groups={['location']} />}
        {tab === 'general' && ['DB', 'EDB'].includes(roleOf(project, board)) && (
          <p className="m enc-link">Enclosure: {board.enclosure ? <b>{board.enclosure.range} {board.enclosure.config.ref}{board.enclosure.dims ? ` · H${board.enclosure.dims.h} × W${board.enclosure.dims.w} × D${board.enclosure.dims.d} mm` : ''}</b> : board.form4 ? <b>Form-4 · {form4SizeText(board.form4.dims)}</b> : 'not sized'}
            {board.enclosure && <span> ({board.enclosure.supplier} rev. {board.enclosure.revision}{board.enclosure.confirmNeeded ? ', supplier to confirm' : ''})</span>}
            {onEnclosure && <> <button className="chip" onClick={onEnclosure}>Enclosure sizing…</button></>}</p>
        )}

        {tab === 'supply' && (
          <>
            <p className="supply-chain">
              <span>{head && headMode !== 'transformer' ? supplyPoint(project, head, false)?.title ?? 'Supply not set' : head?.sourceKva ? `Transformer · ${head.sourceKva} kVA` : 'Transformer'}</span>
              {chain.map((b) => <span key={b.id}><i aria-hidden="true">→</i><b className={b.id === board.id ? 'on' : ''}>{b.id}</b></span>)}
            </p>
            {head ? (
              isMain ? <SupplyFields project={project} board={board} onChange={onChange} />
              : headMode === 'transformer' ? (
                <>
                  <h4>Transformer (supplies {head.id})</h4>
                  {!head.sourceKva && <p className="m warn">No transformer rating yet — enter it below.</p>}
                  <BoardFields board={head} onChange={(nb) => { if (!nb.sourceKva) setHeadHeld(nb.id); onChange(nb); }} section="source" sourceKv={gridSourceOf(project, head)?.kv} />
                  <p className="m">Changes here apply to every board {head.id} supplies.</p>
                </>
              ) : (
                <>
                  <h4>Supply (of {head.id})</h4>
                  <p className="m">{headMode === 'unset' ? `The supply of ${head.id} is not set. Select ${head.id} to set it.` : `${head.id} is fed from ${suppliedFromText(project, head).replace(/^A board not/, 'a board not')}. Select ${head.id} to change its supply.`}</p>
                </>
              )
            ) : <p className="m">No main board found above {board.id}.</p>}
            <h4>At this board</h4>
            <dl className="kv">
              <dt>Incoming feeder</dt>
              <dd>{s.incomer ? <><button className="linkish" onClick={() => onSelectFeeder(s.incomer!.id)}>{s.incomer.id}</button> · {s.incomer.cableCsaMm2} mm² × {s.incomer.lengthM} m</> : isMain ? firstIncomer : '—'}</dd>
              <dt>Fault level Ik″</dt>
              <dd>{txt.fault(s.faultKA)} kA{s.faultAssumed ? ' (assumed source)' : ''}</dd>
              <dt>Voltage drop</dt>
              <dd>{txt.pct(100 - s.voltagePct)} % (cumulative)</dd>
            </dl>
          </>
        )}

        {tab === 'electrical' && (
          <>
            <dl className="kv">
              <dt>System voltage</dt>
              <dd>{project.voltageV} V, 3-phase</dd>
              <dt>Busbar voltage</dt>
              <dd>{txt.volts(s.voltageV)} V ({txt.pct(s.voltagePct)}%)</dd>
              <dt>Fault level Ik″</dt>
              <dd>{txt.fault(s.faultKA)} kA</dd>
              <dt>Power factor</dt>
              <dd>{s.powerFactor.toFixed(2)}</dd>
              <dt>Supplied from</dt>
              <dd>{suppliedFromText(project, board)}</dd>
            </dl>
          </>
        )}

        {tab === 'protection' && <BoardFields board={board} onChange={onChange} section="general" groups={['incomer']} />}
        {tab === 'protection' && (
          <dl className="kv">
            {s.incomer ? (
              <>
                <dt>Incoming device</dt>
                <dd>
                  <button className="linkish" onClick={() => onSelectFeeder(s.incomer!.id)}>{s.incomer.id}</button>
                </dd>
                <dt>Breaker</dt>
                <dd>{s.incomer.breakerRatingA} A, Icu {s.incomer.breakerIcuKa} kA</dd>
                <dt>Incoming cable</dt>
                <dd>{s.incomer.cableCsaMm2} mm² × {s.incomer.lengthM} m</dd>
                {incomerResult && (
                  <>
                    <dt>Ib ≤ In ≤ Iz</dt>
                    <dd className={incomerResult.protectionStatus}>
                      {txt.current(incomerResult.ib)} ≤ {s.incomer.breakerRatingA} ≤ {izText(incomerResult.ampacity)} A
                    </dd>
                    <dt>Icu vs fault</dt>
                    <dd className={incomerResult.icuStatus}>
                      {s.incomer.breakerIcuKa} kA vs {txt.fault(incomerResult.breakerFaultKA)} kA
                    </dd>
                  </>
                )}
              </>
            ) : (
              <>
                <dt>Incoming supply</dt>
                <dd>{isMain ? 'Transformer secondary' : 'No incomer feeder found'}</dd>
                {board.ratedCurrentA && (
                  <>
                    <dt>Main device</dt>
                    <dd>{board.ratedCurrentA} A</dd>
                  </>
                )}
              </>
            )}
            <dt>Busbar fault level</dt>
            <dd>{txt.fault(s.faultKA)} kA</dd>
          </dl>
        )}
      </div>

      <div className="pn">
        <h3>Loading</h3>
        <dl className="kv">
          <dt>Connected load</dt>
          <dd>{txt.power(s.connectedKw)} kW</dd>
          <dt>Demand load</dt>
          <dd>{txt.power(s.demandKw)} kW · {txt.power(s.demandKva)} kVA</dd>
          <dt>Demand current</dt>
          <dd>{txt.current(s.currentA)} A</dd>
          {s.generationKw > 0 && (
            <>
              <dt>Generation</dt>
              <dd>{txt.power(s.generationKw)} kW</dd>
            </>
          )}
        </dl>
        {s.loadingPct !== undefined ? (
          <>
            <div className="bar" aria-label={`Loading ${txt.loading(s.loadingPct)} percent`}>
              <span className={s.loadingStatus} style={{ width: `${Math.min(s.loadingPct, 100)}%` }} />
              <b>{txt.loading(s.loadingPct)}%</b>
            </div>
            <p className={`m ${s.loadingStatus}`}>{statusLabel[s.loadingStatus!]} of {boardRatedA(board)} A rating</p>
          </>
        ) : (
          <p className="m">Set a rated current on the General tab to see board loading.</p>
        )}
      </div>

      <div className="pn">
        <h3>Related equipment</h3>
        <dl className="kv">
          <dt>Incoming feeder</dt>
          <dd>{s.incomer ? s.incomer.id : isMain ? (fedFromOfBoard(board) === 'transformer' ? (board.sourceKva ? `${board.sourceKva} kVA transformer` : '—') : suppliedFromText(project, board)) : '—'}</dd>
          <dt>Outgoing feeders</dt>
          <dd>{s.outgoing}</dd>
          <dt>Sub-boards</dt>
          <dd>{project.boards.filter((b) => b.upstreamId === board.id).map((b) => b.id).join(', ') || '—'}</dd>
        </dl>
      </div>
    </>
  );
}
