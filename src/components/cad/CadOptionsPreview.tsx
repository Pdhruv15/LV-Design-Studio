import type { DraftSettings } from '../../model/cadDraft';

/** The small drawings beside the Display and Selection pages of Options: the cursor, line widths, picked look, grips,
 * hover highlight and selection window as the canvas draws them, from the values being edited. Pure; colours are the
 * canvas's own CSS variables. */

const W = 180, H = 196;
const crossOf = (c: DraftSettings['crossColor']) => (c === 'accent' ? 'var(--acc)' : c === 'cyan' ? 'var(--res-cur)' : 'var(--cad-cross)');
const selOf = (c: DraftSettings['selColor']) => (c === 'accent' ? 'var(--acc)' : c === 'cyan' ? 'var(--res-cur)' : c === 'green' ? 'var(--cad-snap)' : 'var(--cad-sel)');
const frame = <rect x="0.5" y="0.5" width="179" height="195" fill="none" stroke="var(--line)" />;
/** The pick box, a square of `pb` centred on (cx, cy), as a path. */
const boxPath = (cx: number, cy: number, pb: number) => `M${cx - pb / 2} ${cy - pb / 2}h${pb}v${pb}h${-pb}Z`;

/** Display: the grid, a plan fragment (wall width follows lineweights) and the cursor with its crosshair and outline. */
export function DisplayPreview({ draft, lwt }: { draft: DraftSettings; lwt: boolean }) {
  const cx = 112.5, cy = 116.5, pb = draft.pickBoxPx, gap = pb / 2 + 2;
  const hx = draft.crossPct >= 100 ? Infinity : (H * draft.crossPct) / 200;
  const l = Math.max(0, cx - hx), r = Math.min(W, cx + hx), t = Math.max(0, cy - hx), b = Math.min(H, cy + hx);
  let d = '';
  if (cx - gap > l) d += `M${l} ${cy}H${cx - gap}`;
  if (r > cx + gap) d += `M${cx + gap} ${cy}H${r}`;
  if (cy - gap > t) d += `M${cx} ${t}V${cy - gap}`;
  if (b > cy + gap) d += `M${cx} ${cy + gap}V${b}`;
  d += boxPath(cx, cy, pb);
  const xs = Array.from({ length: 7 }, (_, i) => 23 * (i + 1)), ys = Array.from({ length: 8 }, (_, i) => 23 * (i + 1));
  const wall = lwt ? 2.2 : 1;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Preview: the cursor and line widths">
      {xs.map((x, i) => <line key={`x${x}`} x1={x} y1="0" x2={x} y2={H} stroke={(i + 1) % 5 === 0 ? 'var(--cad-grid-major)' : 'var(--cad-grid)'} strokeWidth="1" />)}
      {ys.map((y, i) => <line key={`y${y}`} x1="0" y1={y} x2={W} y2={y} stroke={(i + 1) % 5 === 0 ? 'var(--cad-grid-major)' : 'var(--cad-grid)'} strokeWidth="1" />)}
      <g fill="none" stroke="var(--cad-ink)">
        <g data-part="wall" strokeWidth={wall}>
          <polyline points="24,44 150,44 150,156 96,156" />
          <polyline points="70,156 24,156 24,44" />
        </g>
        <line x1="70" y1="156" x2="70" y2="130" strokeWidth="1" />
        <path d="M70 130A26 26 0 0 1 96 156" strokeWidth="1" />
        <line x1="58" y1="44" x2="58" y2="96" strokeWidth="1" />
      </g>
      {draft.cursorOutline && <path data-part="outline" d={d} fill="none" stroke="var(--cad-bg)" strokeWidth="3" />}
      <path data-part="cross" d={d} fill="none" stroke={crossOf(draft.crossColor)} strokeWidth="1" />
      {frame}
    </svg>
  );
}

/** Selection: a picked rectangle in its look, its grips, the object under the pick box with its highlight and name tag,
 * and the selection window. */
export function SelectionPreview({ draft }: { draft: DraftSettings }) {
  const sel = selOf(draft.selColor), g = draft.gripPx, long = Math.round(g * 1.4), short = Math.round(g * 0.6), pb = draft.pickBoxPx;
  // The cursor on the line under it, and its name tag 12 px right of it and 28 px above, as on the canvas.
  const cx = 84.5, cy = 140.5;
  const rect = 'M40 44H128V100H40Z';
  const corners: [number, number][] = [[40, 44], [128, 44], [128, 100], [40, 100]];
  const bars: [number, number, number, number][] = [[84, 44, long, short], [84, 100, long, short], [40, 72, short, long], [128, 72, short, long]];
  const look = draft.pickLook;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Preview: picking, picked objects and grips">
      <g fill="none" stroke="var(--cad-ink)" strokeWidth="1">
        <polyline points="16,20 166,20 166,60" />
        <line x1="16" y1="176" x2="90" y2="176" />
      </g>
      {look === 'halo' && <path data-part="halo" d={rect} fill="none" stroke={sel} strokeWidth="6" opacity="0.35" strokeLinejoin="round" />}
      {look === 'thick'
        ? <path data-part="picked" d={rect} fill="none" stroke={sel} strokeWidth="3" />
        : <path data-part="picked" d={rect} fill="none" stroke="var(--cad-ink)" strokeWidth="1" strokeDasharray="6 4" />}
      {draft.grips && <>
        {corners.map(([x, y]) => <rect key={`${x},${y}`} data-part="grip" x={x - g / 2} y={y - g / 2} width={g} height={g} fill={sel} stroke="var(--cad-bg)" strokeWidth="1" />)}
        {bars.map(([x, y, w, h]) => <rect key={`${x},${y}`} data-part="grip" x={x - w / 2} y={y - h / 2} width={w} height={h} fill={sel} stroke="var(--cad-bg)" strokeWidth="1" />)}
      </>}
      <line x1="24" y1="140" x2="160" y2="140" stroke="var(--cad-ink)" strokeWidth="1" />
      {draft.hoverMark && <line data-part="hover" x1="24" y1="140" x2="160" y2="140" stroke="var(--acc)" strokeWidth="7" opacity="0.4" strokeLinecap="round" />}
      {draft.cursorOutline && <path data-part="outline" d={boxPath(cx, cy, pb)} fill="none" stroke="var(--cad-bg)" strokeWidth="3" />}
      <path data-part="pickbox" d={boxPath(cx, cy, pb)} fill="none" stroke={crossOf(draft.crossColor)} strokeWidth="1" />
      {draft.hoverTag && <g data-part="tag">
        <rect x={cx + 12} y={cy - 28} width="76" height="18" fill="var(--panel)" />
        <text x={cx + 17} y={cy - 15} fontSize="11" fontFamily="system-ui, sans-serif" fill="var(--tx)">Line · WALLS</text>
      </g>}
      {draft.windowFill && <rect data-part="window-fill" x="118" y="152" width="52" height="34" fill="var(--res-cur)" opacity="0.12" />}
      <rect data-part="window" x="118" y="152" width="52" height="34" fill="none" stroke="var(--res-cur)" strokeWidth="1" />
      {frame}
    </svg>
  );
}
