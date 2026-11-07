import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { layoutPaper, layoutViewports, PLAN_LABEL, PLAN_TYPES } from '../../docs/planLayout';
import { PLAN_PREFIX, renumber, setOf, startStatus, type DrawingSet, type DrawingSheet, type PlanType } from '../../model/drawingSet';
import { boxFrom, insideVp, isLocked, patchViewport, vpId, vpName, VP_SCALES, withViewports, type PlanViewport } from '../../model/planViewports';
import type { PaperOverlay } from '../sld/SheetWorkspace';
import type { Project } from '../../types';

/** Design CAD → layouts (paper space), under the drawing as in industry CAD: Model, then a tab per layout of the level
 * (its plan sheets, src/model/planViewports.ts), then + for a new one. A layout tab shows the sheet's paper (the Sheets
 * page, bare) with its viewport frames over it, dashed (on screen only); a frame picked shows its properties, dragged
 * it moves, its corners resize it; a double-click inside works in the model through it (MS), outside goes back (PS). */

type Pt = [number, number];
type Level = { buildingId: string; levelId: string; name: string };

/** The level's layouts: its plan sheets, in the register's order. */
export const layoutsOf = (p: Project, lv: { buildingId: string; levelId: string } | undefined): DrawingSheet[] =>
  lv ? setOf(p).sheets.filter((s) => s.kind === 'plan' && s.buildingId === lv.buildingId && s.levelId === lv.levelId) : [];

/** A new layout of the level: a plan sheet of the type, after the set's other sheets of that type, numbered. */
export function newLayout(set: DrawingSet, lv: Level, type: PlanType, copyOf?: DrawingSheet): { set: DrawingSet; id: string } {
  const sheets = [...set.sheets];
  let id = `pl-${type}-${lv.buildingId}-${lv.levelId}-L1`;
  for (let k = 2; sheets.some((x) => x.id === id); k++) id = `pl-${type}-${lv.buildingId}-${lv.levelId}-L${k}`;
  const s: DrawingSheet = copyOf
    ? { ...copyOf, id, number: '', title: `${copyOf.title} (copy)`, history: undefined, issuedHash: undefined, issuedHashV: undefined, issuedItems: undefined, rev: undefined }
    : { id, number: '', title: `${lv.name} · ${PLAN_LABEL[type]}`, kind: 'plan', plan: type, buildingId: lv.buildingId, levelId: lv.levelId, scale: '1:100', size: 'auto', boards: [], status: startStatus(set) };
  const at = sheets.reduce((a, x, i) => (x.kind === 'plan' && x.plan === s.plan ? i + 1 : a), sheets.length);
  sheets.splice(at, 0, s);
  return { set: renumber({ ...set, sheets }), id };
}

/** A layout moved one place among the level's layouts (dir −1 left, +1 right). */
export function moveLayout(set: DrawingSet, id: string, dir: -1 | 1): DrawingSet {
  const i = set.sheets.findIndex((s) => s.id === id), s = set.sheets[i];
  if (i < 0) return set;
  const same = (x: DrawingSheet) => x.kind === 'plan' && x.buildingId === s.buildingId && x.levelId === s.levelId;
  let j = i + dir;
  while (j >= 0 && j < set.sheets.length && !same(set.sheets[j])) j += dir;
  if (j < 0 || j >= set.sheets.length) return set;
  const sheets = [...set.sheets];
  [sheets[i], sheets[j]] = [sheets[j], sheets[i]];
  return { ...set, sheets };
}

/** The tabs under the drawing. */
export function LayoutTabs({ layouts, active, onPick, onNew, onRename, onCopy, onMove, onDelete, onPageSetup }: {
  layouts: DrawingSheet[];
  active: string | null;
  onPick: (id: string | null) => void;
  onNew: (type: PlanType) => void;
  onRename: (s: DrawingSheet) => void;
  onCopy: (s: DrawingSheet) => void;
  onMove: (s: DrawingSheet, dir: -1 | 1) => void;
  onDelete: (s: DrawingSheet) => void;
  onPageSetup: (s: DrawingSheet) => void;
}) {
  const [menu, setMenu] = useState<{ s?: DrawingSheet; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!menu) return undefined;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setMenu(null); } };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, [menu]);
  const pick = (f: () => void) => { setMenu(null); f(); };
  return (
    <>
      <div className="cad-ltabs" role="tablist" aria-label="Model and layouts">
        <button role="tab" aria-selected={!active} className={`cad-ltab${!active ? ' on' : ''}`} title="Model: the plan at real size (drawing units)" onClick={() => onPick(null)}>Model</button>
        {layouts.map((s) => (
          <button key={s.id} role="tab" aria-selected={active === s.id} className={`cad-ltab${active === s.id ? ' on' : ''}`} title={`${s.number} — ${s.title} · right-click for more`}
            onClick={() => onPick(s.id)} onContextMenu={(e) => { e.preventDefault(); setMenu({ s, x: e.clientX, y: e.clientY }); }}>{s.number || s.title}</button>
        ))}
        <button className="cad-ltab add" aria-label="New layout" title="New layout of this level (LAYOUT)" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: r.left, y: r.top }); }}><Plus size={13} strokeWidth={2} /></button>
      </div>
      {menu && (
        <>
          <div className="st-cover" onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} />
          <div className="dw-menu st-ctx cad-tab-menu up" role="menu" aria-label={menu.s ? `Layout ${menu.s.number}` : 'New layout'} style={{ left: Math.max(8, Math.min(menu.x, window.innerWidth - 236)), top: menu.y }}>
            {menu.s ? <>
              <button role="menuitem" autoFocus onClick={() => pick(() => onRename(menu.s!))}>Rename…</button>
              <button role="menuitem" onClick={() => pick(() => onCopy(menu.s!))}>Copy</button>
              <button role="menuitem" onClick={() => pick(() => onMove(menu.s!, -1))}>Move left</button>
              <button role="menuitem" onClick={() => pick(() => onMove(menu.s!, 1))}>Move right</button>
              <button role="menuitem" onClick={() => pick(() => onPageSetup(menu.s!))}>Page setup…</button>
              <button role="menuitem" onClick={() => pick(() => onDelete(menu.s!))}>Delete</button>
            </> : PLAN_TYPES.map((t, i) => <button key={t} role="menuitem" autoFocus={i === 0} onClick={() => pick(() => onNew(t))}>{PLAN_LABEL[t]} <span className="m">{PLAN_PREFIX[t]}</span></button>)}
          </div>
        </>
      )}
    </>
  );
}

/** Where the sheet's drawing area is on the page (paper mm from its top left): its plan's SVG, found by its width. */
function areaOrigin(frame: HTMLIFrameElement | null, areaW: number, pageMmPerPx: number): Pt | null {
  const doc = frame?.contentDocument;
  if (!doc) return null;
  const svg = [...doc.querySelectorAll('svg')].find((el) => Math.abs(parseFloat(el.getAttribute('width') ?? '') - areaW) < 0.05 && (el.getAttribute('width') ?? '').endsWith('mm'));
  if (!svg) return null;
  const r = svg.getBoundingClientRect();
  return [r.left * pageMmPerPx, r.top * pageMmPerPx];
}

/** The viewport frames over a layout's page, and the viewport worked in with the drawing inside it. */
export function layoutOverlay({ project, sheet, sel, ms, mv, onSelect, onMs, onBox, onNew, canvas }: {
  project: Project;
  sheet: DrawingSheet;
  sel: string | null;
  ms: string | null;
  /** MV: two corners picked on the paper make a viewport. */
  mv: boolean;
  onSelect: (id: string | null) => void;
  onMs: (id: string | null) => void;
  /** A frame moved or resized (paper mm, drawing area). */
  onBox: (id: string, box: PlanViewport['box']) => void;
  onNew: (box: PlanViewport['box']) => void;
  /** The drawing, fitted to the viewport worked in. */
  canvas: (v: PlanViewport, pxPerMm: number) => ReactNode;
}): PaperOverlay {
  return ({ pxPerMm, frame, loaded }) => <Frames key={`${sheet.id}-${loaded}`} {...{ project, sheet, sel, ms, mv, onSelect, onMs, onBox, onNew, canvas, pxPerMm, frame }} />;
}

function Frames({ project, sheet, sel, ms, mv, onSelect, onMs, onBox, onNew, canvas, pxPerMm, frame }: Omit<Parameters<typeof layoutOverlay>[0], never> & { pxPerMm: number; frame: HTMLIFrameElement | null }) {
  const root = useRef<HTMLDivElement>(null);
  const paper = layoutPaper(project, sheet);
  const vps = layoutViewports(project, sheet);
  const iframePxPerMm = 3.78; // the page is laid out at 3.78 px per mm inside its frame (SheetWorkspace)
  const [origin, setOrigin] = useState<Pt | null>(null);
  // Measured on the page; else where src/docs/sldSheet.ts puts it (frame 20 mm from the left and 10 mm from the top, its
  // 0.7 mm border, the drawing 3 mm inside).
  useEffect(() => { if (paper) setOrigin(areaOrigin(frame, paper.area.w, 1 / iframePxPerMm) ?? [23.7, 13.7]); }, [frame, paper?.area.w]); // eslint-disable-line react-hooks/exhaustive-deps
  const [drag, setDrag] = useState<{ id: string; how: 'move' | 'nw' | 'ne' | 'sw' | 'se'; from: Pt; box: PlanViewport['box'] } | null>(null);
  const [first, setFirst] = useState<Pt | null>(null);
  const [hover, setHover] = useState<Pt | null>(null);
  // Paper mm (drawing area) of a pointer event.
  const mmAt = (e: { clientX: number; clientY: number }): Pt => {
    const r = root.current!.getBoundingClientRect(), o = origin ?? [0, 0];
    return [(e.clientX - r.left) / pxPerMm - o[0], (e.clientY - r.top) / pxPerMm - o[1]];
  };
  // A double-click inside a viewport works in it; outside goes back to the paper (the page's own clicks stay its).
  useEffect(() => {
    const host = root.current?.parentElement;
    if (!host) return undefined;
    const dbl = (e: MouseEvent) => {
      if (!origin) return;
      const at = mmAt(e), v = [...vps].reverse().find((x) => insideVp(x, at));
      if (ms && v?.id === ms) return;
      e.preventDefault();
      onMs(v ? v.id : null);
    };
    host.addEventListener('dblclick', dbl);
    return () => host.removeEventListener('dblclick', dbl);
  });
  if (!paper || !origin) return <div ref={root} className="cad-vps" />;
  const px = (mm: number) => mm * pxPerMm;
  const shown = (v: PlanViewport): PlanViewport['box'] => (drag?.id === v.id ? drag.box : v.box);
  const moveTo = (e: React.PointerEvent) => {
    if (!drag) return;
    const [x, y] = mmAt(e), dx = x - drag.from[0], dy = y - drag.from[1], [l, t, w, h] = vps.find((v) => v.id === drag.id)!.box;
    const box: PlanViewport['box'] = drag.how === 'move' ? [l + dx, t + dy, w, h]
      : boxFrom(drag.how === 'nw' ? [l + dx, t + dy] : drag.how === 'ne' ? [l, t + dy] : drag.how === 'sw' ? [l + dx, t] : [l, t], drag.how === 'nw' ? [l + w, t + h] : drag.how === 'ne' ? [l + w + dx, t + h] : drag.how === 'sw' ? [l + w, t + h + dy] : [l + w + dx, t + h + dy]);
    setDrag({ ...drag, box: box.map((k) => +k.toFixed(1)) as PlanViewport['box'] });
  };
  const endDrag = () => { if (drag && drag.box.join() !== vps.find((v) => v.id === drag.id)?.box.join() && drag.box[2] > 2 && drag.box[3] > 2) onBox(drag.id, drag.box); setDrag(null); };
  return (
    <div ref={root} className={`cad-vps${mv ? ' mv' : ''}`} style={{ cursor: mv ? 'crosshair' : undefined }}
      onPointerMove={(e) => { moveTo(e); if (mv) setHover(mmAt(e)); }} onPointerUp={endDrag}
      onPointerDown={mv ? (e) => {
        e.stopPropagation();
        const at = mmAt(e);
        if (!first) { setFirst(at); return; }
        setFirst(null);
        const b = boxFrom(first, at);
        if (b[2] > 2 && b[3] > 2) onNew(b.map((k) => +k.toFixed(1)) as PlanViewport['box']);
      } : undefined}>
      {vps.map((v) => {
        const [l, t, w, h] = shown(v), on = sel === v.id, inside = ms === v.id;
        const grab = (how: 'move' | 'nw' | 'ne' | 'sw' | 'se') => (e: React.PointerEvent) => { if (mv) return; e.stopPropagation(); e.currentTarget.setPointerCapture?.(e.pointerId); onSelect(v.id); setDrag({ id: v.id, how, from: mmAt(e), box: v.box }); };
        return (
          <div key={v.id} className={`cad-vp${on ? ' on' : ''}${inside ? ' ms' : ''}`} aria-label={vpName(vps, v.id)}
            style={{ left: px(origin[0] + l), top: px(origin[1] + t), width: px(w), height: px(h) }}>
            {inside && <div className="cad-vp-model">{canvas(v, pxPerMm)}</div>}
            {!inside && (['t', 'b', 'l', 'r'] as const).map((k) => <span key={k} className={`cad-vp-edge ${k}`} onPointerDown={grab('move')} onPointerMove={moveTo} onPointerUp={endDrag} title={`${vpName(vps, v.id)} · 1:${v.scale}${isLocked(v) ? ' · locked' : ''} — drag to move, double-click inside to work in it`} />)}
            {on && !inside && (['nw', 'ne', 'sw', 'se'] as const).map((k) => <span key={k} className={`cad-vp-grip ${k}`} onPointerDown={grab(k)} onPointerMove={moveTo} onPointerUp={endDrag} />)}
          </div>
        );
      })}
      {mv && first && hover && (() => { const [l, t, w, h] = boxFrom(first, hover); return <div className="cad-vp new" style={{ left: px(origin[0] + l), top: px(origin[1] + t), width: px(w), height: px(h) }} />; })()}
    </div>
  );
}

/** Viewport properties (its frame picked): scale, lock, plan type shown, references, frame printed, delete. */
export function ViewportPanel({ project, sheet, vp, refs, onChange, onDelete, onLayers }: {
  project: Project;
  sheet: DrawingSheet;
  vp: PlanViewport;
  /** The references of the level's plan (names). */
  refs: string[];
  onChange: (patch: Partial<PlanViewport>, what: string) => void;
  onDelete: () => void;
  onLayers: () => void;
}) {
  const vps = layoutViewports(project, sheet);
  const [custom, setCustom] = useState('');
  return (
    <div className="cad-devform cad-vpform" aria-label="Viewport properties">
      <b>{vpName(vps, vp.id)} <span className="m">{sheet.number}</span></b>
      <label>Scale
        <select aria-label="Viewport scale" value={VP_SCALES.includes(vp.scale) ? vp.scale : 'custom'} onChange={(e) => e.target.value !== 'custom' && onChange({ scale: Number(e.target.value) }, `scale 1:${e.target.value}`)}>
          {VP_SCALES.map((k) => <option key={k} value={k}>1:{k}</option>)}
          <option value="custom">{VP_SCALES.includes(vp.scale) ? 'Custom…' : `1:${vp.scale}`}</option>
        </select>
      </label>
      <label>Custom 1:<input aria-label="Custom scale" inputMode="numeric" value={custom} placeholder={String(vp.scale)} onChange={(e) => setCustom(e.target.value)}
        onBlur={() => { const k = Math.round(Number(custom)); if (k > 0 && k !== vp.scale) onChange({ scale: k }, `scale 1:${k}`); setCustom(''); }} /></label>
      <div className="seg" role="group" aria-label="Locked">
        <button className={isLocked(vp) ? 'on' : ''} onClick={() => !isLocked(vp) && onChange({ locked: undefined }, 'locked')}>Locked</button>
        <button className={!isLocked(vp) ? 'on' : ''} onClick={() => isLocked(vp) && onChange({ locked: false }, 'unlocked: pan and zoom inside it move its view')}>Unlocked</button>
      </div>
      <div className="seg" role="group" aria-label="Shows">
        {PLAN_TYPES.map((t) => <button key={t} className={(vp.shows ?? sheet.plan) === t ? 'on' : ''} onClick={() => onChange({ shows: t === sheet.plan ? undefined : t }, `shows the ${PLAN_LABEL[t].toLowerCase()}`)}>{PLAN_LABEL[t].replace(' layout', '')}</button>)}
      </div>
      {refs.length > 0 && <div role="group" aria-label="References in this viewport">{refs.map((r) => {
        const off = vp.refsOff?.includes(r) ?? false;
        return <label key={r}><input type="checkbox" checked={!off} onChange={() => { const next = off ? (vp.refsOff ?? []).filter((x) => x !== r) : [...(vp.refsOff ?? []), r]; onChange({ refsOff: next.length ? next : undefined }, `reference ${r} ${off ? 'shown' : 'hidden'} here`); }} /> {r}</label>;
      })}</div>}
      <label><input type="checkbox" checked={!!vp.frame} onChange={() => onChange({ frame: vp.frame ? undefined : true }, vp.frame ? 'frame not printed' : 'frame printed')} /> Frame prints</label>
      <div className="cad-devbtns"><button className="chip" onClick={onLayers}>Layers in this viewport…</button><button className="chip" onClick={onDelete}>Delete viewport</button></div>
    </div>
  );
}

/** The project with a layout's viewports changed (the worked-out one becomes the sheet's own on the first change). */
export function changeViewports(p: Project, sheet: DrawingSheet, change: (list: PlanViewport[]) => PlanViewport[]): Project {
  const list = change(layoutViewports(p, sheet));
  return { ...p, drawingSet: withViewports(setOf(p), sheet.id, list) };
}
export { patchViewport, vpId };
