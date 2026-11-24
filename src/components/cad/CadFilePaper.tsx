import { useEffect, useMemo, useRef, useState } from 'react';
import type { CadText, CadView, FileLayout } from '../../engines/cad/cadEngine';
import { paperOf, viewportMap } from '../../model/fileLayouts';
import { BAR_ALPHA, emPerCap, READ_PX, textBar, widthPerPx } from '../../model/cadTextScreen';
import { insidePolygon } from '../../model/viewportClip';
import { sanitizeSvgFragment } from '../../util/sanitize';

/** A layout of the drawing (paper space) in Design CAD, the file's own or one made here: its paper with a shadow, the
 * printable area dashed and trim marks at the corners (on screen only), what is drawn on the paper, and the model
 * through each of its viewports with the design made in the app over it (`design`: devices, DBs, wiring, containment
 * and drawn work) — in black on white, as it plots. The wheel zooms at the pointer, the middle button or
 * a drag pans, a middle double-click fits the paper again. The file's own layouts are shown, not edited: a double-click
 * says so (onDblClick). A layout made here is edited (`edit`): a frame picked by its edge moves, its corners resize it,
 * MV makes one from two corners, a double-click inside works in it (the wheel and a drag then move its view), a
 * double-click outside goes back to the paper. */

type Pt = [number, number];
type Box = [number, number, number, number];
const PAD = 28; // px round the paper when fitted
const INK = '#111', MODEL_INK = '#333', FRAME = '#666';
const CLICK_PX = 3; // a press that moves less is a click, not a drag
/** The font texts are drawn in. */
const FONT = 'sans-serif';
/** Each drawing's texts' widths per px of font, measured once (for the bars of texts too small to read). */
const widthsOf = new WeakMap<object, Map<string, number>>();

/** Editing the viewports of a layout made here; its paper space is in mm from the paper's lower left corner. Viewports are
 * named by their place in layout.viewports. */
export interface PaperEdit {
  /** The viewport picked, and the one worked in (MS). */
  sel: number | null;
  ms: number | null;
  /** MV: two corners picked on the paper make a viewport. */
  mv: boolean;
  onSelect: (i: number | null) => void;
  onMs: (i: number | null) => void;
  /** A frame moved or resized: its lower left corner, width and height (mm). */
  onBox: (i: number, box: Box, how: 'move' | 'resize') => void;
  onNew: (box: Box) => void;
  /** VPCLIP: the corners of the outline picked so far (mm from the paper's lower left corner, y up); null: not picking. */
  outline?: Pt[] | null;
  /** A corner picked on the paper (mm, to 0.1). */
  onOutlinePoint?: (at: Pt) => void;
  /** The view of the viewport worked in dragged by a distance on the paper (mm, y up). */
  onPan: (i: number, dx: number, dy: number) => void;
  /** The view of the viewport worked in zoomed by a factor about a paper point (mm). */
  onZoom: (i: number, f: number, at: Pt) => void;
}

const boxOf = (a: Pt, b: Pt): Box => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])];

export function CadFilePaper({ layout, model, layersOn, design, onDblClick, onContext, edit, wheel }: {
  /** The mouse wheel's zoom step (1.15 = 15 % a notch) and whether its direction is reversed (Options → General → Mouse); 1.2 as before when not given. */
  wheel?: { step: number; reverse: boolean };
  layout: FileLayout;
  model: Pick<CadView, 'segs' | 'segLayers' | 'info'>;
  /** The model's layers that show, in the drawing's order, as the app has them (default: as the drawing has them). */
  layersOn?: ArrayLike<number | boolean>;
  /** The design through each viewport, by its place in layout.viewports: SVG pieces in mm on the page from its top left
   * corner (src/docs/layoutPlot.ts, layoutDesign). Drawn over the model, clipped to the viewport's frame. */
  design?: string[];
  onDblClick?: () => void;
  /** A right-click: inside a viewport (its index in layout.viewports) or on the paper (null), at the screen point. */
  onContext?: (vp: number | null, x: number, y: number) => void;
  edit?: PaperEdit;
}) {
  const host = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<Pt>([0, 0]);
  // px per paper mm, and where the paper's lower left corner is on screen; null: fitted to the pane.
  const [cam, setCam] = useState<{ k: number; x: number; y: number } | null>(null);
  // Editing: the frame being dragged, the first corner of a new one and where the pointer is, and the view being dragged.
  const [drag, setDrag] = useState<{ i: number; how: 'move' | 'nw' | 'ne' | 'sw' | 'se'; from: Pt; box: Box } | null>(null);
  const [first, setFirst] = useState<Pt | null>(null);
  const [hover, setHover] = useState<Pt | null>(null);
  const [live, setLive] = useState<{ i: number; dx: number; dy: number } | null>(null);
  const picking = !!edit?.mv || !!edit?.outline;
  useEffect(() => { if (!picking) { setFirst(null); setHover(null); } }, [picking]);
  const paper = paperOf(layout);
  const designSvg = useMemo(() => (design ?? []).map((d) => (d ? sanitizeSvgFragment(d) : '')), [design]);
  useEffect(() => {
    const el = host.current;
    if (!el) return undefined;
    const fit = () => setSize([el.clientWidth, el.clientHeight]);
    fit();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);
  useEffect(() => setCam(null), [layout.name]);
  const fitted = (): { k: number; x: number; y: number } => {
    const k = Math.max(0.05, Math.min((size[0] - 2 * PAD) / paper.w, (size[1] - 2 * PAD) / paper.h));
    return { k, x: (size[0] - paper.w * k) / 2, y: (size[1] + paper.h * k) / 2 };
  };
  const view = cam ?? fitted();

  useEffect(() => {
    const c = cv.current;
    if (!c || !size[0] || !size[1]) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(size[0] * dpr); c.height = Math.round(size[1] * dpr);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const widths = widthsOf.get(model.info) ?? new Map<string, number>();
    widthsOf.set(model.info, widths);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size[0], size[1]);
    const { k, x: ox, y: oy } = view;
    const sx = (mmX: number) => ox + mmX * k, sy = (mmY: number) => oy - mmY * k;
    const mut = getComputedStyle(c).getPropertyValue('--mut').trim() || '#8A929C';
    // The paper, its shadow, the printable area and the trim marks.
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 2;
    ctx.fillStyle = '#fff';
    ctx.fillRect(sx(0), sy(paper.h), paper.w * k, paper.h * k);
    ctx.restore();
    const [px, py, pw, ph] = paper.printable;
    ctx.save();
    ctx.strokeStyle = mut; ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
    ctx.strokeRect(sx(px) + 0.5, sy(py + ph) + 0.5, pw * k, ph * k);
    ctx.restore();
    ctx.strokeStyle = mut; ctx.lineWidth = 1;
    ctx.beginPath();
    for (const [cx, cy, dx, dy] of [[0, 0, -1, 1], [paper.w, 0, 1, 1], [0, paper.h, -1, -1], [paper.w, paper.h, 1, -1]] as const) {
      const [x, y] = [Math.round(sx(cx)) + 0.5, Math.round(sy(cy)) + 0.5];
      ctx.moveTo(x + dx * 4, y); ctx.lineTo(x + dx * 16, y);
      ctx.moveTo(x, y + dy * 4); ctx.lineTo(x, y + dy * 16);
    }
    ctx.stroke();
    // Clip what follows to the paper.
    ctx.save();
    ctx.beginPath(); ctx.rect(sx(0), sy(paper.h), paper.w * k, paper.h * k); ctx.clip();
    const toScreen = (p: Pt): Pt => { const [mx, my] = paper.mm(p[0], p[1]); return [sx(mx), sy(my)]; };
    // The model through each viewport that is on, clipped to its frame.
    const [mox, moy] = model.info.origin;
    const on = model.info.layers.map((l, i) => (layersOn && layersOn[i] !== undefined ? !!layersOn[i] : l.on));
    for (const [i, v0] of layout.viewports.entries()) {
      if (!v0.on) continue;
      // The view being dragged in the viewport worked in follows the pointer before it is kept.
      const v = live?.i === i && v0.h > 0 ? { ...v0, cx: v0.cx - (live.dx * v0.vh) / v0.h, cy: v0.cy - (live.dy * v0.vh) / v0.h } : v0;
      const map = viewportMap(v);
      const [ax, ay] = toScreen([v.x, v.y + v.h]), [bx, by] = toScreen([v.x + v.w, v.y]);
      // Its frame, or its outline when it is clipped (VPCLIP): the model is cut at it, and it is what is drawn as the frame.
      const outline = () => {
        ctx.beginPath();
        if (!v0.clip) { ctx.rect(ax, ay, bx - ax, by - ay); return; }
        v0.clip.forEach(([fx, fy], n) => { const [x, y] = toScreen([v0.x + fx * v0.w, v0.y + v0.h - fy * v0.h]); if (n) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
        ctx.closePath();
      };
      ctx.save();
      outline(); ctx.clip('evenodd');
      // The part of the model in the frame (drawing units), to skip the rest quickly.
      const half: Pt = [v.w / 2 / map.scale, v.h / 2 / map.scale];
      const [x0, x1, y0, y1] = [v.cx - half[0] - mox, v.cx + half[0] - mox, v.cy - half[1] - moy, v.cy + half[1] - moy];
      ctx.strokeStyle = MODEL_INK; ctx.lineWidth = 0.75;
      ctx.beginPath();
      const s = model.segs;
      for (let i = 0, n = model.segLayers.length; i < n; i++) {
        if (on[model.segLayers[i]] === false) continue;
        const [a, b, c2, d] = [s[i * 4], s[i * 4 + 1], s[i * 4 + 2], s[i * 4 + 3]];
        if (Math.max(a, c2) < x0 || Math.min(a, c2) > x1 || Math.max(b, d) < y0 || Math.min(b, d) > y1) continue;
        const p = toScreen(map.ps(a + mox, b + moy)), q = toScreen(map.ps(c2 + mox, d + moy));
        ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]);
      }
      ctx.stroke();
      ctx.fillStyle = MODEL_INK;
      for (const t of model.info.texts) {
        if (on[t.layer] === false || t.x < x0 + mox || t.x > x1 + mox || t.y < y0 + moy || t.y > y1 + moy) continue;
        text(ctx, t, toScreen(map.ps(t.x, t.y)), t.h * map.scale * layout.mm_per_unit * k, (t.w ?? 0) * map.scale * layout.mm_per_unit * k, widths);
      }
      ctx.restore();
      ctx.strokeStyle = FRAME; ctx.lineWidth = 1;
      outline(); ctx.stroke();
    }
    // What is drawn on the paper itself.
    const [pox, poy] = layout.origin;
    ctx.strokeStyle = INK; ctx.lineWidth = 1;
    ctx.beginPath();
    const ps = layout.segs;
    for (let i = 0, n = layout.segLayers.length; i < n; i++) {
      const p = toScreen([ps[i * 4] + pox, ps[i * 4 + 1] + poy]), q = toScreen([ps[i * 4 + 2] + pox, ps[i * 4 + 3] + poy]);
      ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]);
    }
    ctx.stroke();
    ctx.fillStyle = INK;
    for (const t of layout.texts) text(ctx, t, toScreen([t.x, t.y]), t.h * layout.mm_per_unit * k, (t.w ?? 0) * layout.mm_per_unit * k, widths);
    ctx.restore();
  });

  const zoomAt = (px: number, py: number, f: number) => {
    const v = cam ?? fitted(), k = Math.max(0.05, Math.min(400, v.k * f)), r = k / v.k;
    setCam({ k, x: px - (px - v.x) * r, y: py - (py - v.y) * r });
  };
  /** A pointer event's place on the paper: mm from its lower left corner. */
  const mmAt = (e: { clientX: number; clientY: number }): Pt => {
    const r = host.current!.getBoundingClientRect();
    return [(e.clientX - r.left - view.x) / view.k, (view.y - (e.clientY - r.top)) / view.k];
  };
  /** A viewport's frame on the paper (mm from its lower left corner: x, y, width, height). */
  const frameOf = (v: FileLayout['viewports'][0]): Box => { const [x, y] = paper.mm(v.x, v.y), [x1, y1] = paper.mm(v.x + v.w, v.y + v.h); return [x, y, x1 - x, y1 - y]; };
  /** A viewport's outline on the paper (mm from its lower left corner): its clip's corners, else undefined (its frame). */
  const outlineOf = (v: FileLayout['viewports'][0]): Pt[] | undefined => v.clip?.map(([fx, fy]) => paper.mm(v.x + fx * v.w, v.y + v.h - fy * v.h));
  /** The topmost viewport that is on under a paper point (mm) — in its frame, and in its outline when it has one — or -1. */
  const vpAt = ([x, y]: Pt): number => {
    for (let i = layout.viewports.length - 1; i >= 0; i--) {
      if (!layout.viewports[i].on) continue;
      const [l, b, w, h] = frameOf(layout.viewports[i]), o = outlineOf(layout.viewports[i]);
      if (x >= l && x <= l + w && y >= b && y <= b + h && (!o || insidePolygon([x, y], o))) return i;
    }
    return -1;
  };
  const dragTo = (e: React.PointerEvent) => {
    if (!drag) return;
    const [x, y] = mmAt(e), dx = x - drag.from[0], dy = y - drag.from[1], [l, b, w, h] = frameOf(layout.viewports[drag.i]), r = l + w, t = b + h;
    const box: Box = drag.how === 'move' ? [l + dx, b + dy, w, h]
      : drag.how === 'nw' ? boxOf([l + dx, t + dy], [r, b]) : drag.how === 'ne' ? boxOf([r + dx, t + dy], [l, b]) : drag.how === 'sw' ? boxOf([l + dx, b + dy], [r, t]) : boxOf([r + dx, b + dy], [l, t]);
    setDrag({ ...drag, box: box.map((n) => +n.toFixed(1)) as Box });
  };
  const endDrag = () => {
    if (drag && edit && drag.box.join() !== frameOf(layout.viewports[drag.i]).map((n) => +n.toFixed(1)).join() && drag.box[2] > 2 && drag.box[3] > 2) edit.onBox(drag.i, drag.box, drag.how === 'move' ? 'move' : 'resize');
    setDrag(null);
  };
  return (
    <div ref={host} className="cad-filepaper" role="img" aria-label={`Layout ${layout.name}: ${Math.round(paper.w)} × ${Math.round(paper.h)} mm paper, ${layout.viewports.length} viewport${layout.viewports.length === 1 ? '' : 's'}`}
      onWheel={(e) => {
        const step = wheel?.step ?? 1.2, f = (e.deltaY < 0) !== !!wheel?.reverse ? step : 1 / step;
        // In the viewport worked in, the wheel zooms its view (not when locked); elsewhere, the paper.
        if (edit && edit.ms !== null && vpAt(mmAt(e)) === edit.ms) { if (!layout.viewports[edit.ms]?.locked) edit.onZoom(edit.ms, f, mmAt(e)); return; }
        const r = e.currentTarget.getBoundingClientRect();
        zoomAt(e.clientX - r.left, e.clientY - r.top, f);
      }}
      onPointerDown={(e) => {
        if (e.button !== 0 && e.button !== 1) return;
        e.preventDefault();
        const from = { x: e.clientX, y: e.clientY, v: cam ?? fitted() };
        const el = e.currentTarget;
        el.setPointerCapture?.(e.pointerId);
        // A drag with the left button in the viewport worked in moves its view; any other drag moves the paper.
        const inMs = edit && e.button === 0 && edit.ms !== null && vpAt(mmAt(e)) === edit.ms ? edit.ms : null;
        const fixed = inMs !== null && !!layout.viewports[inMs]?.locked;
        let far = false;
        const move = (m: PointerEvent) => {
          const dx = m.clientX - from.x, dy = m.clientY - from.y;
          if (Math.abs(dx) > CLICK_PX || Math.abs(dy) > CLICK_PX) far = true;
          if (inMs === null) setCam({ ...from.v, x: from.v.x + dx, y: from.v.y + dy });
          else if (!fixed) setLive({ i: inMs, dx: dx / from.v.k, dy: -dy / from.v.k });
        };
        const up = (m: PointerEvent) => {
          el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up);
          if (inMs !== null) { setLive(null); if (far && !fixed) edit!.onPan(inMs, (m.clientX - from.x) / from.v.k, -(m.clientY - from.y) / from.v.k); }
          else if (!far && edit && edit.sel !== null && m.button === 0) edit.onSelect(null); // a click on the paper: nothing picked
        };
        el.addEventListener('pointermove', move); el.addEventListener('pointerup', up);
      }}
      onAuxClick={(e) => { if (e.button === 1 && e.detail === 2) setCam(null); }}
      onDoubleClick={(e) => {
        if (!edit) { onDblClick?.(); return; }
        const i = vpAt(mmAt(e));
        if (i < 0 ? edit.ms !== null : i !== edit.ms) edit.onMs(i < 0 ? null : i);
      }}
      onContextMenu={(e) => {
        if (!onContext) return;
        e.preventDefault();
        const i = vpAt(mmAt(e));
        onContext(i >= 0 ? i : null, e.clientX, e.clientY);
      }}>
      <canvas ref={cv} style={{ width: size[0], height: size[1] }} />
      {designSvg.some(Boolean) && (
        <svg className="cad-filepaper-design" aria-hidden="true" viewBox={`0 0 ${paper.w} ${paper.h}`} fontFamily="Arial, sans-serif"
          style={{ position: 'absolute', left: view.x, top: view.y - paper.h * view.k, width: paper.w * view.k, height: paper.h * view.k, pointerEvents: 'none' }}>
          {layout.viewports.map((v, i) => {
            if (!v.on || !designSvg[i]) return null;
            const [l, b, w, h] = frameOf(v), o = outlineOf(v);
            // The view being dragged in the viewport worked in: its design goes with it until the view is kept.
            const moved = live?.i === i ? `translate(${live.dx} ${-live.dy})` : undefined;
            return (
              <g key={i} data-vp={i} clipPath={`url(#fpd${i})`}>
                <clipPath id={`fpd${i}`}>{o ? <polygon points={o.map(([x, y]) => `${x},${paper.h - y}`).join(' ')} clipRule="evenodd" /> : <rect x={l} y={paper.h - b - h} width={w} height={h} />}</clipPath>
                <g transform={moved} dangerouslySetInnerHTML={{ __html: designSvg[i] }} />
              </g>
            );
          })}
        </svg>
      )}
      {edit && (
        <div className={`cad-vps${edit.mv || edit.outline ? ' mv' : ''}`} style={{ cursor: edit.mv || edit.outline ? 'crosshair' : undefined }}
          onPointerMove={edit.mv || edit.outline ? (e) => setHover(mmAt(e)) : undefined}
          onPointerDown={edit.outline ? (e) => {
            if (e.button !== 0) return; // the middle button still pans the paper
            e.stopPropagation();
            edit.onOutlinePoint?.(mmAt(e).map((n) => +n.toFixed(1)) as Pt);
          } : edit.mv ? (e) => {
            e.stopPropagation();
            const at = mmAt(e);
            if (!first) { setFirst(at); return; }
            setFirst(null);
            const b = boxOf(first, at);
            if (b[2] > 2 && b[3] > 2) edit.onNew(b.map((n) => +n.toFixed(1)) as Box);
          } : undefined}>
          {layout.viewports.map((v, i) => {
            if (!v.on) return null;
            const [l, b, w, h] = drag?.i === i ? drag.box : frameOf(v), on = edit.sel === i, inside = edit.ms === i, name = `Viewport ${i + 1}`;
            const grab = (how: 'move' | 'nw' | 'ne' | 'sw' | 'se') => (e: React.PointerEvent) => {
              if (edit.mv || edit.outline) return;
              e.stopPropagation(); e.currentTarget.setPointerCapture?.(e.pointerId);
              edit.onSelect(i); setDrag({ i, how, from: mmAt(e), box: frameOf(v).map((n) => +n.toFixed(1)) as Box });
            };
            return (
              <div key={i} className={`cad-vp${on ? ' on' : ''}${inside ? ' ms' : ''}`} aria-label={name} style={{ left: view.x + l * view.k, top: view.y - (b + h) * view.k, width: w * view.k, height: h * view.k }}>
                {!inside && (['t', 'b', 'l', 'r'] as const).map((k) => <span key={k} className={`cad-vp-edge ${k}`} onPointerDown={grab('move')} onPointerMove={dragTo} onPointerUp={endDrag} title={`${name}${v.locked ? ' · locked' : ''}${v.clip ? ' · clipped' : ''} — drag to move, double-click inside to work in it`} />)}
                {on && !inside && (['nw', 'ne', 'sw', 'se'] as const).map((k) => <span key={k} className={`cad-vp-grip ${k}`} onPointerDown={grab(k)} onPointerMove={dragTo} onPointerUp={endDrag} />)}
              </div>
            );
          })}
          {edit.outline && (
            <svg aria-label="Outline being picked" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
              {(() => {
                const px = (p: Pt) => `${view.x + p[0] * view.k},${view.y - p[1] * view.k}`, line = hover ? [...edit.outline, hover] : edit.outline;
                return (
                  <>
                    {line.length > 1 && <polyline points={line.map(px).join(' ')} fill="none" stroke="var(--acc)" strokeWidth="1.5" />}
                    {edit.outline.length >= 2 && hover && <line x1={view.x + hover[0] * view.k} y1={view.y - hover[1] * view.k} x2={view.x + edit.outline[0][0] * view.k} y2={view.y - edit.outline[0][1] * view.k} stroke="var(--acc)" strokeWidth="1" strokeDasharray="4 3" />}
                    {edit.outline.map((p, i) => <circle key={i} cx={view.x + p[0] * view.k} cy={view.y - p[1] * view.k} r="3" fill="var(--acc)" />)}
                  </>
                );
              })()}
            </svg>
          )}
          {edit.mv && first && hover && (() => { const [l, b, w, h] = boxOf(first, hover); return <div className="cad-vp new" style={{ left: view.x + l * view.k, top: view.y - (b + h) * view.k, width: w * view.k, height: h * view.k }} />; })()}
        </div>
      )}
    </div>
  );
}

/** A text at its insertion point (screen px), its capitals hPx tall (as CAD measures text), rotated, aligned left /
 * centre / right, fitted to wPx when given; too small to read, a faint bar where its words are. */
function text(ctx: CanvasRenderingContext2D, t: CadText, [x, y]: Pt, hPx: number, wPx: number, widths: Map<string, number>) {
  if (!(hPx > 0) || hPx > 2000) return;
  const em = hPx * emPerCap(ctx, FONT);
  ctx.save();
  if (hPx < READ_PX) {
    ctx.globalAlpha *= BAR_ALPHA; ctx.beginPath();
    textBar(ctx, x, y, t.rot, hPx, wPx > 0 ? wPx : widthPerPx(ctx, FONT, t.s, widths) * em, t.align);
    ctx.fill();
  } else {
    ctx.translate(x, y);
    ctx.rotate(-t.rot);
    ctx.font = `${em}px ${FONT}`;
    ctx.textAlign = t.align === 1 ? 'center' : t.align === 2 ? 'right' : 'left';
    if (wPx > 0) { const nat = ctx.measureText(t.s).width; if (nat > 0) ctx.scale(wPx / nat, 1); }
    ctx.fillText(t.s, 0, 0);
  }
  ctx.restore();
}
