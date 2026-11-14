import { useRef } from 'react';
import { HATCH_IDS, HATCH_PATTERNS, type AnnoSettings, type HatchPattern, type HatchSpec } from '../../model/cadAnnotate';
import { customLabel, defOf, dotsOnly, hatchDots, hatchStrokes, mirroredY, placedLines, specWith, type CustomPattern, type PlacedLine } from '../../model/cadHatch';

/** Design CAD → Hatch and the annotation tools' side panels. */

const SCALES = [50, 100, 200, 500];

/** What a new hatch is made with: islands (closed objects inside stay clear), associative (follows its boundary), and
 * whether imported patterns are also kept on this computer. */
export interface HatchOpts { islands: boolean; assoc: boolean; keep: boolean }
/** The hatch being edited (HATCHEDIT): how many, its pattern origin (m), its islands, whether it follows its boundary. */
export interface HatchEditing { count: number; origin: [number, number]; islands: number; assoc: boolean; canAssoc: boolean; onOrigin: (m: [number, number]) => void; onPick: () => void; onAdd: () => void; onRemove: () => void; onAssoc: () => void }

/** A small black-and-white swatch of a hatch pattern (3 mm = 6 px), clipped to its box. */
export function HatchSwatch({ spec }: { spec: HatchSpec }) {
  const def = defOf(spec), box: [number, number, number, number] = [0, 0, 64, 48];
  let d = '', dots = '';
  if (!def.solid) for (const f of mirroredY(placedLines(spec, 2))) {
    const g: PlacedLine = { ...f, base: [f.base[0], f.base[1] + 48] };
    if (dotsOnly(g)) { for (const [x, y] of hatchDots(g, box, 1, 3000)) dots += `M${x.toFixed(1)} ${y.toFixed(1)}h0`; continue; }
    for (const l of hatchStrokes(g, box, 1, 400, 1).lines) d += `M${l.a[0].toFixed(1)} ${l.a[1].toFixed(1)}L${l.b[0].toFixed(1)} ${l.b[1].toFixed(1)}`;
  }
  return (
    <svg className="cad-bk-thumb" viewBox="0 0 64 48" role="img" aria-label="Hatch pattern swatch">
      {def.solid && <rect width="64" height="48" fill="currentColor" fillOpacity="0.3" />}
      {d && <path d={d} fill="none" stroke="currentColor" strokeWidth="0.6" />}
      {dots && <path d={dots} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />}
    </svg>
  );
}

/** A number typed in a box and applied when it is left or Enter is pressed (one change, not one per key). */
function Typed({ label, value, step, min, onValue }: { label: string; value: number; step: string; min?: string; onValue: (v: number) => void }) {
  return <input key={value} aria-label={label} type="number" step={step} min={min} defaultValue={value} onBlur={(e) => { const v = Number(e.target.value); if (e.target.value.trim() !== '' && Number.isFinite(v) && v !== value) onValue(v); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />;
}

/** Hatch: pattern (built in, then the project's own and those kept on this computer), spacing and angle with a swatch of
 * the pattern; Import .pat… adds patterns, Export .pat… saves them all. With `editing` it edits a hatch drawn (HE): its
 * origin, islands and whether it follows its boundary too. */
export function HatchPanel({ spec, onSpec, patterns = [], computer = [], onImport, onExport, opts, onOpts, editing }: {
  spec: HatchSpec; onSpec: (s: HatchSpec) => void; patterns?: CustomPattern[]; computer?: CustomPattern[]; onImport?: (text: string, file: string) => void; onExport?: () => void;
  opts?: HatchOpts; onOpts?: (o: HatchOpts) => void; editing?: HatchEditing;
}) {
  const file = useRef<HTMLInputElement>(null), def = defOf(spec);
  const value = spec.custom ? `custom:${spec.custom.name}` : spec.pattern;
  // The computer's patterns under the project's own, those of the same name left to the project.
  const mine = computer.filter((c) => !patterns.some((p) => p.name.toUpperCase() === c.name.toUpperCase()));
  const pick = (v: string) => {
    const c = v.startsWith('custom:') ? [...patterns, ...mine].find((p) => p.name === v.slice(7)) : undefined;
    onSpec(c ? specWith(spec, c) : { scale: spec.scale, angle: spec.angle, pattern: v as HatchPattern, ...(spec.origin ? { origin: spec.origin } : {}) });
  };
  const list = (c: CustomPattern[]) => c.map((p) => <option key={p.name} value={`custom:${p.name}`}>{customLabel(p)}</option>);
  const both = patterns.length > 0 && mine.length > 0;
  return (
    <>
      <h4>{editing ? 'Edit hatch' : 'Hatch'} <span className="m">{editing ? 'HE' : 'H'}</span></h4>
      <div className="cad-devform">
        <label>Pattern<select aria-label="Hatch pattern" value={value} onChange={(e) => pick(e.target.value)}>
          {HATCH_IDS.map((h) => <option key={h} value={h}>{HATCH_PATTERNS[h].label}</option>)}
          {/* A drawing's pattern being used, not in the project's or the computer's list. */}
          {spec.custom && ![...patterns, ...mine].some((p) => p.name === spec.custom!.name) && <option value={value}>{customLabel(spec.custom)}</option>}
          {both ? <optgroup label="This project">{list(patterns)}</optgroup> : list(patterns)}
          {mine.length > 0 && <optgroup label="On this computer">{list(mine)}</optgroup>}
        </select></label>
        <HatchSwatch spec={spec} />
        {!def.solid && (editing
          ? <label>Spacing (paper mm)<Typed label="Hatch spacing" step="0.5" min="0.5" value={spec.scale} onValue={(v) => onSpec({ ...spec, scale: v > 0 ? v : 3 })} /></label>
          : <label>Spacing (paper mm)<input aria-label="Hatch spacing" type="number" step="0.5" min="0.5" value={spec.scale} onChange={(e) => onSpec({ ...spec, scale: Number(e.target.value) || 3 })} /></label>)}
        {!def.solid && !def.noAngle && (editing
          ? <label>Angle (°)<Typed label="Hatch angle" step="15" value={spec.angle} onValue={(v) => onSpec({ ...spec, angle: v })} /></label>
          : <label>Angle (°)<input aria-label="Hatch angle" type="number" step="15" value={spec.angle} onChange={(e) => onSpec({ ...spec, angle: Number(e.target.value) || 0 })} /></label>)}
        {editing && editing.count > 1 && <span className="m">{editing.count} hatches: pattern, spacing and angle change together.</span>}
        {editing && editing.count === 1 && <>
          <label>Origin X (m)<Typed label="Hatch origin X" step="0.1" value={+editing.origin[0].toFixed(3)} onValue={(v) => editing.onOrigin([v, editing.origin[1]])} /></label>
          <label>Origin Y (m)<Typed label="Hatch origin Y" step="0.1" value={+editing.origin[1].toFixed(3)} onValue={(v) => editing.onOrigin([editing.origin[0], v])} /></label>
          <button className="chip" onClick={editing.onPick}>Pick…</button>
          <span className="m">Islands: {editing.islands}</span>
          <button className="chip" onClick={editing.onAdd}>Add islands</button>
          <button className="chip" onClick={editing.onRemove} disabled={!editing.islands}>Remove islands</button>
          <label title={editing.canAssoc ? 'The hatch follows the objects it was made from' : 'This hatch is not tied to any object'}><input type="checkbox" aria-label="Associative" checked={editing.assoc} disabled={!editing.canAssoc} onChange={editing.onAssoc} /> Associative</label>
        </>}
        {!editing && <span className="m">Click inside a closed drawn object (polyline, rectangle, circle) or a room: the area is hatched on LV-HATCH. Plant rooms, risers, no-go zones.</span>}
        {!editing && opts && onOpts && <>
          <label title="Closed objects inside stay clear"><input type="checkbox" aria-label="Find islands" checked={opts.islands} onChange={(e) => onOpts({ ...opts, islands: e.target.checked })} /> Find islands</label>
          <label title="The hatch follows its boundary when that is changed"><input type="checkbox" aria-label="Associative" checked={opts.assoc} onChange={(e) => onOpts({ ...opts, assoc: e.target.checked })} /> Associative</label>
        </>}
        {!editing && onImport && <>
          <input ref={file} type="file" accept=".pat" hidden aria-label="Hatch pattern file" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onImport(await f.text(), f.name); }} />
          <button className="chip" onClick={() => file.current?.click()}>Import .pat…</button>
        </>}
        {!editing && onExport && <button className="chip" onClick={onExport}>Export .pat…</button>}
        {!editing && onImport && opts && onOpts && <label title="Imported patterns are also stored on this computer"><input type="checkbox" aria-label="Keep imported patterns on this computer" checked={opts.keep} onChange={(e) => onOpts({ ...opts, keep: e.target.checked })} /> Also keep imported patterns on this computer for every project</label>}
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
