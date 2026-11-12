import { useEffect, useRef, useState } from 'react';
import type { CadText, CadView, FileLayout } from '../../engines/cad/cadEngine';
import { paperOf, viewportMap } from '../../model/fileLayouts';

/** A drawing file's own layout (paper space) in Design CAD: its paper with a shadow, the printable area dashed and trim
 * marks at the corners (on screen only), what is drawn on the paper, and the model through each of its viewports — in
 * black on white, as it plots. The wheel zooms at the pointer, the middle button or a drag pans, a middle double-click
 * fits the paper again. Shown, not edited, for now: a double-click says so (onDblClick). */

type Pt = [number, number];
const PAD = 28; // px round the paper when fitted
const INK = '#111', MODEL_INK = '#333', FRAME = '#666';

export function CadFilePaper({ layout, model, onDblClick, onContext }: {
  layout: FileLayout;
  model: Pick<CadView, 'segs' | 'segLayers' | 'info'>;
  onDblClick?: () => void;
  /** A right-click: inside a viewport (its index in layout.viewports) or on the paper (null), at the screen point. */
  onContext?: (vp: number | null, x: number, y: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<Pt>([0, 0]);
  // px per paper mm, and where the paper's lower left corner is on screen; null: fitted to the pane.
  const [cam, setCam] = useState<{ k: number; x: number; y: number } | null>(null);
  const paper = paperOf(layout);
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
    const on = model.info.layers.map((l) => l.on);
    for (const v of layout.viewports) {
      if (!v.on) continue;
      const map = viewportMap(v);
      const [ax, ay] = toScreen([v.x, v.y + v.h]), [bx, by] = toScreen([v.x + v.w, v.y]);
      ctx.save();
      ctx.beginPath(); ctx.rect(ax, ay, bx - ax, by - ay); ctx.clip();
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
        text(ctx, t, toScreen(map.ps(t.x, t.y)), t.h * map.scale * layout.mm_per_unit * k);
      }
      ctx.restore();
      ctx.strokeStyle = FRAME; ctx.lineWidth = 1;
      ctx.strokeRect(ax, ay, bx - ax, by - ay);
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
    for (const t of layout.texts) text(ctx, t, toScreen([t.x, t.y]), t.h * layout.mm_per_unit * k);
    ctx.restore();
  });

  const zoomAt = (px: number, py: number, f: number) => {
    const v = cam ?? fitted(), k = Math.max(0.05, Math.min(400, v.k * f)), r = k / v.k;
    setCam({ k, x: px - (px - v.x) * r, y: py - (py - v.y) * r });
  };
  return (
    <div ref={host} className="cad-filepaper" role="img" aria-label={`Layout ${layout.name}: ${Math.round(paper.w)} × ${Math.round(paper.h)} mm paper, ${layout.viewports.length} viewport${layout.viewports.length === 1 ? '' : 's'}`}
      onWheel={(e) => { const r = e.currentTarget.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.2 : 1 / 1.2); }}
      onPointerDown={(e) => {
        if (e.button !== 0 && e.button !== 1) return;
        e.preventDefault();
        const from = { x: e.clientX, y: e.clientY, v: cam ?? fitted() };
        const el = e.currentTarget;
        el.setPointerCapture?.(e.pointerId);
        const move = (m: PointerEvent) => setCam({ ...from.v, x: from.v.x + m.clientX - from.x, y: from.v.y + m.clientY - from.y });
        const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
        el.addEventListener('pointermove', move); el.addEventListener('pointerup', up);
      }}
      onAuxClick={(e) => { if (e.button === 1 && e.detail === 2) setCam(null); }}
      onDoubleClick={() => onDblClick?.()}
      onContextMenu={(e) => {
        if (!onContext) return;
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, { k, x: ox, y: oy } = view;
        const at = (p: Pt): Pt => { const [mx, my] = paper.mm(p[0], p[1]); return [ox + mx * k, oy - my * k]; };
        const i = layout.viewports.findIndex((v) => {
          if (!v.on) return false;
          const [ax, ay] = at([v.x, v.y + v.h]), [bx, by] = at([v.x + v.w, v.y]);
          return x >= Math.min(ax, bx) && x <= Math.max(ax, bx) && y >= Math.min(ay, by) && y <= Math.max(ay, by);
        });
        onContext(i >= 0 ? i : null, e.clientX, e.clientY);
      }}>
      <canvas ref={cv} style={{ width: size[0], height: size[1] }} />
    </div>
  );
}

/** A text at its insertion point (screen px), its height in px, rotated, aligned left / centre / right. */
function text(ctx: CanvasRenderingContext2D, t: CadText, [x, y]: Pt, hPx: number) {
  if (!(hPx >= 2) || hPx > 2000) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-t.rot);
  ctx.font = `${hPx}px sans-serif`;
  ctx.textAlign = t.align === 1 ? 'center' : t.align === 2 ? 'right' : 'left';
  ctx.fillText(t.s, 0, 0);
  ctx.restore();
}
