import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import CadMenu from './cad/CadMenu';
import type { CtxItem } from './cad/cadContextMenu';
import { sldAction, type sldMenu, type SldTarget } from '../model/sldMenu';
import { incomerDeviceOf, type Board, type Project } from '../types';
import { loadSymbolOf, SwitchSym, switchKindOf, type SwitchKind } from '../diagram/IecSymbols';
import { boardSymbolOf } from '../diagram/panelBox';
import { Sym, SYM_SCALE } from '../diagram/symbolLibrary';
import { isMotor } from '../calc/motor';
import { panelSummary } from '../docs/mdSheet';
import { loadTypeOf } from '../calc/summary';
import type { FeederResult } from '../calc/electrical';
import { circuitRef } from '../calc/loadSchedule';
import { runsOf } from '../calc/electrical';
import { txKv } from '../calc/hvSupply';
import { cpcOf } from '../calc/cableTable';
import { cableTypeOf } from '../model/cableTypes';
import { deviceKind, devicePoles } from '../diagram/deviceText';
import { nextPhase, phaseTag } from '../model/phases';
import { splitSld } from '../model/sldScope';
import { fmtFixed } from '../util/format';
import { supplyPoint } from '../diagram/supplyPoint';
import { SourceSym } from '../diagram/sourceSymbol';
import { addsWay, canDrop, type DropTarget, type PaletteItem } from '../model/sldEdit';
import { dropTargetAt, getArmedItem, getDragItem, setArmedItem, setDragItem, subscribeArmedItem } from '../diagram/dragItem';

const SPACING = 172; // horizontal slot per feeder
const MARGIN = 80;
const CARD_W = SPACING - 20;
const NAME_CHARS = 24; // per line on a card (12 px text)
/** Each way ends in its symbol (load scale, 28 tall, centred on SYM_Y), then its card. */
const SYM_Y = 252;
const CARD_Y = 272;

/** Words onto at most `lines` lines of `max` characters; text that doesn't fit ends in an ellipsis. */
export function wrapText(text: string, max: number, lines = 2): string[] {
  const all: string[] = [];
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const last = all.length - 1;
    if (last >= 0 && `${all[last]} ${w}`.length <= max) all[last] = `${all[last]} ${w}`;
    else all.push(w);
  }
  if (!all.length) return [''];
  const out = all.slice(0, lines);
  const cut = all.length > lines || out.some((l) => l.length > max);
  if (cut) {
    const k = out.length - 1;
    out[k] = `${out[k].slice(0, max - 1).trimEnd()}…`;
  }
  return out.map((l) => (l.length > max && !l.endsWith('…') ? `${l.slice(0, max - 1)}…` : l));
}

export default function SingleLineDiagram({
  board,
  voltageV = 415,
  incomerLabel,
  project,
  results,
  selected,
  onSelect,
  onPhase,
  summary,
  allCircuits = false,
  onDropItem,
  menuFor,
  onMenu
}: {
  board: Board;
  voltageV?: number;
  incomerLabel?: string;
  /** For each circuit's cable type (insulation, armour) on the cards. */
  project?: Project;
  /** The panel's summary box (LOC, TCL, DF, MDL) — drawn on the single-panel view only, not on the system tree. */
  summary?: { loc: string; tclKw: number; df: number; mdlKw: number };
  results: FeederResult[];
  selected: string | null;
  onSelect: (feederId: string) => void;
  /** Click on a circuit's phase tag: move a single-phase circuit to the next phase. Without it the tag is not shown. */
  onPhase?: (feederId: string) => void;
  /** Draw every final circuit. By default the SLD stops at final circuits: feeders to boards and major
   * equipment are drawn, the lighting and power circuits are one box referring to the DB load schedule. */
  allCircuits?: boolean;
  /** The Board tab: drops and clicks with an armed library item. Without it nothing below is drawn, as on printed sheets. */
  onDropItem?: (item: PaletteItem, target: DropTarget) => void;
  /** The Board tab's right-click menus (sldMenu.ts, 'board' set): what to show for a target, and a picked row. Without them, no menu. */
  menuFor?: (t: SldTarget) => ReturnType<typeof sldMenu>;
  onMenu?: (t: SldTarget, action: string, value?: string) => void;
}) {
  const split = splitSld(results, (r) => r.feeder);
  const finals = allCircuits ? [] : split.final;
  const drawn = allCircuits ? results : split.drawn;
  const finalKw = finals.reduce((s, r) => s + r.feeder.loadKw * r.feeder.demandFactor, 0);
  const n = drawn.length + (finals.length ? 1 : 0);
  const locLines = summary ? wrapText(`LOC : ${summary.loc || '—'}`, 34, 2) : [];
  const sumH = 18 + (locLines.length + 3) * 12;
  // Taller by a line where a way feeds a board: its card adds the board's TCL and MDL.
  const H = 406 + (drawn.some((r) => r.feeder.feedsBoardId) ? 13 : 0);
  const width = Math.max(n, 4) * SPACING + 2 * MARGIN;
  // Never below 85 % scale: a board with many ways scrolls sideways rather than shrinking past reading.
  const minWidth = Math.round(width * 0.85);
  const cx = width / 2; // incomer / transformer position
  const xs = Array.from({ length: n }, (_, i) => cx + (i - (n - 1) / 2) * SPACING);
  const busX1 = Math.min(cx - 60, (xs[0] ?? cx) - 60);
  const busX2 = Math.max(cx + 60, (xs[n - 1] ?? cx) + 60);
  const isMain = !board.upstreamId;
  const sp = isMain ? supplyPoint(project ?? { voltageV, boards: [board] }, board, false) : undefined;
  const dev = incomerDeviceOf(board);
  const incKind: SwitchKind = dev === 'ISOL' ? 'isolator' : dev === 'ACB' ? 'acb' : dev === 'MCCB-NA' ? 'nonauto' : 'breaker';

  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<string | null>(null);
  // Where along the busbar a new way would go: `x` is the marker, `before` the way it goes in front of.
  const [insertAt, setInsertAt] = useState<{ x: number; before?: string } | null>(null);
  const armed = useSyncExternalStore(subscribeArmedItem, getArmedItem, getArmedItem);
  useEffect(() => subscribeArmedItem(() => { if (!getArmedItem()) { setHover(null); setInsertAt(null); } }), []);
  const busKey = `bus:${board.id}`;
  const busTarget: DropTarget = { type: 'bus', boardId: board.id };
  const takes = (item: PaletteItem, target: DropTarget) => !!project && canDrop(project, item, target);
  const busInsert = (clientX: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || !rect.width) return undefined;
    const x = ((clientX - rect.left) * width) / rect.width;
    const ways = drawn.map((r, i) => ({ id: r.feeder.id, x: xs[i] }));
    const next = ways.find((w) => w.x > x);
    const prev = [...ways].reverse().find((w) => w.x <= x);
    const gx = next && prev ? (next.x + prev.x) / 2 : next ? next.x - SPACING / 2 : prev ? prev.x + SPACING / 2 : x;
    return { x: gx, before: next?.id };
  };
  const setIns = (ins: { x: number; before?: string } | null) => {
    if (ins?.before !== insertAt?.before || ins?.x !== insertAt?.x) setInsertAt(ins);
  };
  /** The key and target under the pointer that `item` can go on, with the insert position along the busbar. */
  const armedAt = (item: PaletteItem, x: number, y: number) => {
    const t = dropTargetAt(x, y);
    if (!t || !takes(item, t.target)) return null;
    const ins = t.target.type === 'bus' && addsWay(item) ? busInsert(x) ?? null : null;
    return { key: t.key, ins, target: ins?.before && t.target.type === 'bus' ? { ...t.target, before: ins.before } : t.target };
  };
  const dnd = (target: DropTarget, key: string) =>
    onDropItem
      ? {
          onDragOver: (e: React.DragEvent) => {
            const item = getDragItem();
            if (!item) return;
            e.stopPropagation();
            if (!takes(item, target)) {
              if (hover) setHover(null);
              return;
            }
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            if (hover !== key) setHover(key);
            setIns(target.type === 'bus' && addsWay(item) ? busInsert(e.clientX) ?? null : null);
          },
          onDrop: (e: React.DragEvent) => {
            const item = getDragItem();
            if (!item) return;
            e.preventDefault();
            e.stopPropagation();
            setHover(null);
            setDragItem(null);
            const ins = target.type === 'bus' && addsWay(item) ? busInsert(e.clientX) : undefined;
            setInsertAt(null);
            onDropItem(item, ins?.before && target.type === 'bus' ? { ...target, before: ins.before } : target);
          }
        }
      : {};
  const armProps = onDropItem
    ? {
        className: `board-sld${armed ? ' armed' : ''}`,
        onPointerMove: (e: React.PointerEvent) => {
          if (!armed) return;
          const a = armedAt(armed, e.clientX, e.clientY);
          const key = a?.key ?? null;
          if (key !== hover) setHover(key);
          setIns(a?.ins ?? null);
        },
        onPointerLeave: () => { if (armed) { setHover(null); setInsertAt(null); } },
        // Place the armed item; a click that can't place it selects as usual.
        onClickCapture: (e: React.MouseEvent) => {
          const item = getArmedItem();
          if (!item) return;
          const a = armedAt(item, e.clientX, e.clientY);
          if (!a) return;
          e.stopPropagation();
          setHover(null);
          setInsertAt(null);
          if (!e.shiftKey) setArmedItem(null); // shift-click places another
          onDropItem(item, a.target);
        },
        onDragLeave: (e: React.DragEvent) => { if (!svgRef.current?.contains(e.relatedTarget as Node)) { setHover(null); setInsertAt(null); } }
      }
    : {};

  // Right-click menus: a way opens its load's menu (a way feeding a board, that board's), the busbar or frame this board's.
  const boxRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ t: SldTarget; x: number; y: number } | null>(null);
  const menuData = menu && menuFor ? menuFor(menu.t) : null;
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const away = (e: Event) => { if (!(e.target as Element | null)?.closest?.('.cad-menu')) close(); };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('wheel', away, { capture: true, passive: true });
    window.addEventListener('blur', close);
    return () => { window.removeEventListener('pointerdown', away, true); window.removeEventListener('wheel', away, true); window.removeEventListener('blur', close); };
  }, [menu]);
  const wayTarget = (id: string): SldTarget | null => {
    const f = project?.feeders.find((x) => x.id === id);
    return f?.feedsBoardId ? { kind: 'board', id: f.feedsBoardId } : f ? { kind: 'feeder', id } : null;
  };
  const openMenu = (t: SldTarget, clientX: number, clientY: number) => {
    const r = boxRef.current?.getBoundingClientRect();
    if (r) setMenu({ t, x: clientX - r.left, y: clientY - r.top });
  };
  const onContextMenu = (e: React.MouseEvent) => {
    if (!menuFor || (armed && onDropItem)) return;
    const el = e.target as Element;
    const way = el.closest('g[data-way]')?.getAttribute('data-way');
    const t = way ? wayTarget(way) : el.closest('[data-menu="bus"]') ? ({ kind: 'board', id: board.id } as SldTarget) : null;
    if (!t) return;
    e.preventDefault();
    if (t.kind === 'feeder') onSelect(t.id); // a sub-board is not selected: that would switch the tab to it
    openMenu(t, e.clientX, e.clientY);
  };
  /** Shift+F10 / the menu key: the menu of the selected way, else this board's, at its centre. */
  const onMenuKey = (e: React.KeyboardEvent) => {
    if (!menuFor || menu || !((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu') || (e.target as HTMLElement).closest('input,select,textarea')) return;
    e.preventDefault();
    const sel = selected ? wayTarget(selected) : null;
    const el = sel ? svgRef.current?.querySelector(`g[data-way="${CSS.escape(selected!)}"]`) : svgRef.current?.querySelector('[data-menu="bus"]');
    const b = (el ?? svgRef.current)?.getBoundingClientRect();
    if (b) openMenu(sel ?? { kind: 'board', id: board.id }, b.left + b.width / 2, b.top + b.height / 2);
  };
  const pickMenu = (x: CtxItem) => {
    const m = menu;
    setMenu(null);
    if (!m) return;
    const [a, v] = sldAction(x);
    onMenu?.(m.t, a, v);
  };

  const svg = (
    <svg ref={svgRef} {...armProps} onContextMenu={menuFor ? onContextMenu : undefined} viewBox={`0 0 ${width} ${H}`} style={{ minWidth, width: '100%', height: 'auto', display: 'block' }} role="img" aria-label={`Single line diagram of ${board.name}`}>
      {isMain ? (
        <>
          {sp ? (
            // No transformer: the source's symbol, a continuation marker or a dashed stub, with the supply's own lines.
            <>
              {sp.mode === 'source' && <><SourceSym kind={sp.kind} x={cx} y={30} /><line x1={cx} y1="41" x2={cx} y2="68" className="ln" /></>}
              {sp.mode === 'board' && <><line x1={cx} y1="6" x2={cx} y2="68" className="ln" /><path d={`M${cx - 7} 24 L${cx} 36 L${cx + 7} 24`} className="ln" /></>}
              {sp.mode === 'unset' && <><line x1={cx} y1="10" x2={cx} y2="68" className="ln" strokeDasharray="5 3" /><path d={`M${cx - 7} 10 H${cx + 7}`} className="ln" strokeDasharray="5 3" /></>}
              <text className="b" x={cx + 22} y={sp.mode === 'unset' ? 32 : 26}>{sp.title}</text>
              {sp.mode === 'unset' ? <text className="m" x={cx + 22} y="46">{sp.brief[0]}</text> : sp.brief.map((t, i) => <text key={i} className="m" x={cx + 22} y={40 + 14 * i}>{t}</text>)}
            </>
          ) : (
            <>
              <line x1={cx} y1="0" x2={cx} y2="17" className="ln" />
              <text className="m" x={cx + 10} y="10">
                {`${project ? txKv(project, board) : '11'} kV incoming`}
              </text>
              <circle cx={cx} cy="30" r="13" className="tr" />
              <circle cx={cx} cy="44" r="13" className="tr" />
              <text className="b" x={cx + 22} y="32">
                TX · {board.sourceKva ?? '—'} kVA
              </text>
              <text className="m" x={cx + 22} y="46">
                11/{(voltageV / 1000).toFixed(3)} kV · Z {board.sourceImpedancePct ?? '—'}%
              </text>
            </>
          )}
          <line x1={cx} y1="57" x2={cx} y2="68" className="ln" />
          {dev ? <SwitchSym x={cx} y={68} kind={incKind} /> : <line x1={cx} y1="68" x2={cx} y2="84" className="ln" />}
          <line x1={cx} y1="84" x2={cx} y2="118" className="ln" />
          {incomerLabel && <text className="m" x={cx + 22} y="79">Incomer {incomerLabel}</text>}
        </>
      ) : (
        <>
          <line x1={cx} y1="10" x2={cx} y2={dev ? 70 : 118} className="ln" />
          <text className="b" x={cx + 22} y="40">
            Incomer
          </text>
          <text className="m" x={cx + 22} y="54">
            {incomerLabel ? `${incomerLabel} · from ${board.upstreamId}` : `from ${board.upstreamId}`}
          </text>
          {/* Incomer breaker clear of the busbar, with a run of line below it as on the outgoing ways. */}
          {dev && <SwitchSym x={cx} y={70} kind={incKind} />}
          {dev && <line x1={cx} y1="86" x2={cx} y2="118" className="ln" />}
        </>
      )}
      {summary && (
        <g className="panel-sum" data-menu="bus">
          <title>{`${board.id}: TCL ${fmtFixed(summary.tclKw, 2)} kW × DF ${summary.df.toFixed(2)} = MDL ${fmtFixed(summary.mdlKw, 2)} kW`}</title>
          <rect x="8" y="8" width="214" height={sumH} rx="6" className="sum-box" />
          <text x="14" y="21" className="b" style={{ textDecoration: 'underline' }}>{board.id.length > 32 ? `${board.id.slice(0, 31)}…` : board.id}</text>
          {[...locLines, `TCL : ${fmtFixed(summary.tclKw, 2)} kW`, `DF : ${summary.df.toFixed(2)}`, `MDL : ${fmtFixed(summary.mdlKw, 2)} kW`].map((t, i) => (
            <text key={i} x="14" y={35 + i * 12} className="m" xmlSpace="preserve">{i > 0 && i < locLines.length ? `      ${t}` : t}</text>
          ))}
        </g>
      )}
      <text className="b" x={cx - 16} y="106" textAnchor="end" style={{ fill: 'var(--bus)' }} data-menu="bus">
        {board.id} · {voltageV} V{board.ratedCurrentA ? ` · ${board.ratedCurrentA} A` : ''} busbar
      </text>
      {onDropItem && hover === busKey && <line className="bus-glow" x1={busX1} y1="118" x2={busX2} y2="118" />}
      <line data-dxf-layer="BUSBAR" data-menu="bus" x1={busX1} y1="118" x2={busX2} y2="118" style={{ stroke: 'var(--bus)', strokeWidth: 4, strokeLinecap: 'round' }} />
      {onDropItem && <line className="bus-hit" data-menu="bus" x1={busX1 - 20} y1="118" x2={busX2 + 20} y2="118" data-drop={busKey} {...dnd(busTarget, busKey)} />}
      {drawn.map((r, i) => {
        const x = xs[i];
        const f = r.feeder;
        const col = `var(--${r.status})`;
        const sel = selected === f.id;
        const fed = f.feedsBoardId ? project?.boards.find((b) => b.id === f.feedsBoardId) : undefined;
        return (
          <g key={f.id} data-way={f.id} tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => onSelect(f.id)} onKeyDown={(e) => e.key === 'Enter' && onSelect(f.id)}
            {...(onDropItem ? { 'data-drop': `fd:${f.id}`, className: hover === `fd:${f.id}` ? 'drop-ok' : undefined, ...dnd({ type: 'feeder', feederId: f.id }, `fd:${f.id}`) } : {})}>
            <line x1={x} y1="118" x2={x} y2="152" className="ln" />
            <SwitchSym x={x} y={152} kind={switchKindOf(f)} />
            {/* The way ends in its symbol, below the cable text: the board's symbol for a way feeding a board, else its load. */}
            {(() => {
              const id = fed ? (project ? boardSymbolOf(project, fed) : undefined) : loadSymbolOf(loadTypeOf(f), isMotor(f), loadTypeOf(f) === 'fire-pump');
              return id ? (
                <>
                  <line x1={x} y1="168" x2={x} y2={SYM_Y - 14} className="ln" />
                  <Sym id={id} x={x} y={SYM_Y} s={SYM_SCALE.load} existing={!!fed?.existing} />
                  <line x1={x} y1={SYM_Y + (fed ? 12.5 : 16) * SYM_SCALE.load} x2={x} y2={CARD_Y} className="ln" />
                </>
              ) : <line x1={x} y1="168" x2={x} y2={CARD_Y} className="ln" />;
            })()}
            {/* Protective device: rating, poles and kind, then breaking capacity and any RCD */}
            <text className="b" x={x + 11} y="160">{f.breakerRatingA} A {devicePoles(f)} {deviceKind(f)}</text>
            <text className="m" x={x + 11} y="173">{f.breakerIcuKa ? `${f.breakerIcuKa} kA` : ''}{f.rcdMa ? `${f.breakerIcuKa ? ' · ' : ''}${f.rcdMa} mA RCD` : ''}</text>
            {/* Cable: size and length, its type, then the voltage drop */}
            {(() => {
              const t = project ? cableTypeOf(project, f) : undefined;
              // One fact per line, so nothing runs into the next circuit's column.
              const lines = [
                `${runsOf(f) > 1 ? `${runsOf(f)} × ` : ''}${f.cores}C × ${f.cableCsaMm2}mm² · ${f.lengthM} m`,
                ...(t ? [`CU/${t.code}`] : []),
                ...(t?.armoured ? [`+1C ${cpcOf(f)}mm² ECC`] : []),
                `Vd ${fmtFixed(r.vdTotalPct, 1)}% total`
              ];
              return lines.map((l, k) => (
                <text key={k} className="m" x={x + 8} y={190 + k * 12} style={{ fontSize: 10.5 }}>{k === 1 && t ? <title>{t.label}</title> : null}{l}</text>
              ));
            })()}
            {(() => {
              // A board: its name, TCL and MDL (the way's reference is in the tooltip). A load: as before.
              const sm = fed && project ? panelSummary(project, fed) : undefined;
              const name = wrapText((fed ? fed.name : f.room || f.name) || '—', NAME_CHARS, 2);
              const top = CARD_Y, cardH = 68 + (name.length - 1) * 13 + (sm ? 13 : 0), bottom = top + cardH;
              return (
                <>
                  <rect x={x - CARD_W / 2} y={top} width={CARD_W} height={cardH} rx="6" className="box" style={sel ? { stroke: 'var(--acc)', strokeWidth: 2 } : undefined} />
                  <title>{`${circuitRef(f) ?? f.id} — ${f.room || f.name || ''}`}</title>
                  <circle cx={x + CARD_W / 2 - 10} cy={top + 12} r="4" fill={col} />
                  <text className="b" x={x - CARD_W / 2 + 8} y={top + 19}>{fed ? fed.id : circuitRef(f) ?? f.id}</text>
                  {onPhase && (() => {
                    const tag = phaseTag(f);
                    const single = tag !== 'RYB';
                    const w = tag === 'RYB' ? 30 : tag ? 22 : 36, right = x + CARD_W / 2 - 18;
                    return (
                      <g className={`ph-tag ${tag ? `ph-${tag.toLowerCase()}` : 'unset'}${single ? ' click' : ''}`}
                        onClick={single ? (e) => { e.stopPropagation(); onPhase(f.id); } : undefined}>
                        <title>{single ? `Phase ${tag || 'not set'} — click to move to ${nextPhase(tag)}` : '3-phase circuit'}</title>
                        <rect x={right - w} y={top + 6} width={w} height={17} rx="4" />
                        <text x={right - w / 2} y={top + 18} textAnchor="middle" className="b">{tag || 'PH ?'}</text>
                      </g>
                    );
                  })()}
                  {name.map((l, k) => <text key={k} className="m" x={x - CARD_W / 2 + 8} y={top + 35 + k * 13}>{l}</text>)}
                  {sm ? (
                    <>
                      <text x={x - CARD_W / 2 + 8} y={bottom - 25}>TCL {fmtFixed(sm.tclKw, 2)} kW</text>
                      <text x={x - CARD_W / 2 + 8} y={bottom - 12}>MDL {fmtFixed(sm.mdlKw, 2)} kW · {fmtFixed(r.ib, 0)} A</text>
                    </>
                  ) : (
                    <text x={x - CARD_W / 2 + 8} y={bottom - 12}>
                      {fmtFixed(r.ib, 0)} A{f.feedsBoardId ? ` · → ${f.feedsBoardId}` : ` · ${fmtFixed(f.loadKw * f.demandFactor, 0)} kW${f.generation ? ' gen' : ''}`}
                    </text>
                  )}
                  <rect x={x - CARD_W / 2} y={bottom + 8} width={CARD_W} height="6" rx="3" fill="var(--line)" />
                  <rect x={x - CARD_W / 2} y={bottom + 8} width={Math.min(CARD_W, (CARD_W / 100) * r.loadingPct)} height="6" rx="3" fill={col} />
                  <text className="m" x={x - CARD_W / 2} y={bottom + 32}>
                    {fmtFixed(r.loadingPct, 0)}% of {f.breakerRatingA} A
                  </text>
                </>
              );
            })()}
          </g>
        );
      })}
      {finals.length > 0 && (() => {
        const x = xs[n - 1], left = x - CARD_W / 2;
        return (
          <g className="sld-finals">
            <title>{`${finals.length} final circuits — ${finals.map((r) => circuitRef(r.feeder) ?? r.feeder.id).join(', ')}`}</title>
            <line x1={x} y1="118" x2={x} y2={CARD_Y} className="ln" strokeDasharray="6 4" />
            <text className="b" x={x + 8} y="160">{finals.length} ways</text>
            <text className="m" x={x + 8} y="173">MCB / RCBO</text>
            <rect x={left} y={CARD_Y} width={CARD_W} height="84" rx="6" className="box" strokeDasharray="6 4" />
            <text className="b" x={left + 8} y={CARD_Y + 19}>FINAL CIRCUITS</text>
            <text className="m" x={left + 8} y={CARD_Y + 35}>Lighting &amp; power</text>
            <text className="m" x={left + 8} y={CARD_Y + 49}>{finals.length} circuits · {fmtFixed(finalKw, 1)} kW</text>
            <text x={left + 8} y={CARD_Y + 67}>Refer DB load schedule</text>
            <text className="m" x={left + 8} y={CARD_Y + 79}>{board.id}</text>
          </g>
        );
      })()}
      {onDropItem && insertAt && hover === busKey && (
        <g className="insert-guide" pointerEvents="none">
          <line x1={insertAt.x} y1={102} x2={insertAt.x} y2={214} />
          <circle cx={insertAt.x} cy={118} r="4.5" />
        </g>
      )}
    </svg>
  );
  if (!menuFor) return svg;
  return (
    <div ref={boxRef} style={{ position: 'relative' }} onKeyDown={onMenuKey}>
      {svg}
      {menu && menuData && <CadMenu left={menu.x + 4} top={menu.y + 4} head={menuData.head} items={menuData.items} label={menuData.label} onPick={pickMenu} onClose={() => setMenu(null)} />}
    </div>
  );
}
