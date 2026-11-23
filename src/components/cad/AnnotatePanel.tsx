import type { AnnoSettings, HatchSpec } from '../../model/cadAnnotate';
import { defOf, dotsOnly, hatchDots, hatchStrokes, mirroredY, placedLines, type PlacedLine } from '../../model/cadHatch';

/** Design CAD → the annotation tools' side panels, and the hatch swatch (the Hatch strip is HatchStrip.tsx). */

const SCALES = [50, 100, 200, 500];

/** What a new hatch is made with: islands (closed objects inside stay clear), associative (follows its boundary), and
 * whether imported patterns are also kept on this computer. */
export interface HatchOpts { islands: boolean; assoc: boolean; keep: boolean }

/** A small black-and-white swatch of a hatch pattern (3 mm = 6 px), clipped to its box. */
export function HatchSwatch({ spec, className = 'cad-bk-thumb' }: { spec: HatchSpec; className?: string }) {
  const def = defOf(spec), box: [number, number, number, number] = [0, 0, 64, 48];
  let d = '', dots = '';
  if (!def.solid) for (const f of mirroredY(placedLines(spec, 2))) {
    const g: PlacedLine = { ...f, base: [f.base[0], f.base[1] + 48] };
    if (dotsOnly(g)) { for (const [x, y] of hatchDots(g, box, 1, 3000)) dots += `M${x.toFixed(1)} ${y.toFixed(1)}h0`; continue; }
    for (const l of hatchStrokes(g, box, 1, 400, 1).lines) d += `M${l.a[0].toFixed(1)} ${l.a[1].toFixed(1)}L${l.b[0].toFixed(1)} ${l.b[1].toFixed(1)}`;
  }
  return (
    <svg className={className} viewBox="0 0 64 48" role="img" aria-label="Hatch pattern swatch">
      {def.solid && <rect width="64" height="48" fill="currentColor" fillOpacity="0.3" />}
      {d && <path d={d} fill="none" stroke="currentColor" strokeWidth="0.6" />}
      {dots && <path d={dots} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />}
    </svg>
  );
}

/** Text, Dimension, Leader, Room tag and North arrow: the text height on paper and the annotation scale. */
export function AnnoPanel({ title, cmd, help, anno, onAnno }: { title: string; cmd: string; help: string; anno: AnnoSettings; onAnno: (a: AnnoSettings) => void }) {
  return (
    <>
      <h4>{title} <span className="m">{cmd}</span></h4>
      <div className="cad-devform">
        <label>Text height (paper mm)<input aria-label="Text height" type="number" step="0.5" min="1" value={anno.textMm} onChange={(e) => onAnno({ ...anno, textMm: Number(e.target.value) || 2.5 })} /></label>
        <label>For plans at<select aria-label="Annotation scale" value={anno.scale} onChange={(e) => onAnno({ ...anno, scale: Number(e.target.value) })}>{SCALES.map((k) => <option key={k} value={k}>1:{k}</option>)}</select></label>
        <span className="m">{help} Text is {(anno.textMm * anno.scale / 1000).toFixed(2)} m high on the plan, so it prints {anno.textMm} mm at 1:{anno.scale}.</span>
      </div>
    </>
  );
}
