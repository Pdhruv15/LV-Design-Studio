import { useRef } from 'react';
import { HATCH_IDS, HATCH_PATTERNS, type AnnoSettings, type HatchPattern, type HatchSpec } from '../../model/cadAnnotate';
import { customLabel, defOf, specWith, type CustomPattern } from '../../model/cadHatch';

/** Design CAD → Hatch and the annotation tools' side panels. */

const SCALES = [50, 100, 200, 500];

/** Hatch: pattern (built in, then the project's own from .pat files), spacing and angle; Import .pat… adds patterns. */
export function HatchPanel({ spec, onSpec, patterns = [], onImport }: { spec: HatchSpec; onSpec: (s: HatchSpec) => void; patterns?: CustomPattern[]; onImport?: (text: string, file: string) => void }) {
  const file = useRef<HTMLInputElement>(null), def = defOf(spec);
  const value = spec.custom ? `custom:${spec.custom.name}` : spec.pattern;
  const pick = (v: string) => {
    const c = v.startsWith('custom:') ? patterns.find((p) => p.name === v.slice(7)) : undefined;
    onSpec(c ? specWith(spec, c) : { scale: spec.scale, angle: spec.angle, pattern: v as HatchPattern });
  };
  return (
    <>
      <h4>Hatch <span className="m">H</span></h4>
      <div className="cad-devform">
        <label>Pattern<select aria-label="Hatch pattern" value={value} onChange={(e) => pick(e.target.value)}>
          {HATCH_IDS.map((h) => <option key={h} value={h}>{HATCH_PATTERNS[h].label}</option>)}
          {/* A drawing's pattern being used, not in the project's list. */}
          {spec.custom && !patterns.some((p) => p.name === spec.custom!.name) && <option value={value}>{customLabel(spec.custom)}</option>}
          {patterns.map((p) => <option key={p.name} value={`custom:${p.name}`}>{customLabel(p)}</option>)}
        </select></label>
        {!def.solid && <label>Spacing (paper mm)<input aria-label="Hatch spacing" type="number" step="0.5" min="0.5" value={spec.scale} onChange={(e) => onSpec({ ...spec, scale: Number(e.target.value) || 3 })} /></label>}
        {!def.solid && !def.noAngle && <label>Angle (°)<input aria-label="Hatch angle" type="number" step="15" value={spec.angle} onChange={(e) => onSpec({ ...spec, angle: Number(e.target.value) || 0 })} /></label>}
        <span className="m">Click inside a closed drawn object (polyline, rectangle, circle) or a room: the area is hatched on LV-HATCH. Plant rooms, risers, no-go zones.</span>
        {onImport && <>
          <input ref={file} type="file" accept=".pat" hidden aria-label="Hatch pattern file" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onImport(await f.text(), f.name); }} />
          <button className="chip" onClick={() => file.current?.click()}>Import .pat…</button>
        </>}
      </div>
    </>
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
