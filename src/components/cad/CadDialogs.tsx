import { useEffect, useRef, useState, type ReactNode } from 'react';
import { toolAlias } from './cadCommands';
import { EDIT_HELP, EDIT_TITLE, type EditSettings, type EditTool } from './SketchEditPanel';
import { isNumber } from './cadPrompt';
import { badName, cannotDelete, CAD_FONTS, DIM_ARROWS, DIM_TEXT_ALONG, DIM_TEXT_POS, DIM_UNITS, lookOf, newStyleName, STANDARD, type CadDimStyle, type CadFont, type CadStyles, type CadTextStyle, type DimArrow, type DimTextAlong, type DimTextPos, type DimUnit } from '../../model/cadStyles';
import { dimOf } from '../../model/cadSketch';
import { POINT_SHAPES, pointMark, type PointStyle } from '../../model/cadPoints';
import { askedAttdefs, attdefsOf, attrValue, blockNameError, type CadBlockDef } from '../../model/cadBlocks';
import { cleanTag } from '../../model/cadAttributes';
import { TEXT_JUSTS, type TextJust } from '../../model/cadText';
import { mergeImported, readDxfDimStyles } from '../../model/dxfDimStyles';
import type { SketchItem } from '../../types';

/** Design CAD's compact settings dialogs: small, floating near the top-left of the drawing, moved by their title (each
 * remembers its place on this computer), a label and its value on one row, help behind "?". Enter applies and closes;
 * Esc closes with no change. */

type Pos = { left: number; top: number };
const POS = (id: string) => `lvds.cad.dlg.${id}`;
/** A place in the window: a dialog moved off it, or remembered from a larger window, comes back in view. */
const inView = (p: Pos): Pos => ({ left: Math.min(Math.max(0, p.left), Math.max(0, window.innerWidth - 240)), top: Math.min(Math.max(0, p.top), Math.max(0, window.innerHeight - 120)) });
const placeOf = (id: string): Pos => { try { const p = JSON.parse(localStorage.getItem(POS(id)) ?? 'null') as Pos | null; if (p && Number.isFinite(p.left) && Number.isFinite(p.top)) return inView(p); } catch { /* not remembered */ } return { left: 12 + (document.querySelector<HTMLElement>('.cad-work > .cad-dock.left')?.offsetWidth ?? 0), top: 12 }; };

/** The dialog's frame: title (dragged to move it), body rows, and ? / Cancel / OK. */
export function CadDialog({ id, title, alias, help, onOk, onClose, okLabel = 'OK', wide, extra, children }: {
  id: string; title: string; alias?: string; help?: string; onOk: () => void; onClose: () => void; okLabel?: string;
  /** A wider dialog (Drafting settings, Save As), and buttons before Cancel. */
  wide?: boolean; extra?: ReactNode; children: ReactNode;
}) {
  const [pos, setPos] = useState<Pos>(() => placeOf(id));
  const [showHelp, setShowHelp] = useState(false);
  const drag = useRef<{ x: number; y: number; at: Pos; to: Pos } | null>(null);
  const keep = (p: Pos) => { try { localStorage.setItem(POS(id), JSON.stringify(p)); } catch { /* not remembered */ } };
  return (
    <div className={`cad-dlg${wide ? ' wide' : ''}`} role="dialog" aria-label={title} style={pos}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
        else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); e.stopPropagation(); onOk(); }
      }}
      onMouseDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()}>
      <div className="cad-dlg-t"
        onPointerDown={(e) => { if (e.target instanceof HTMLButtonElement) return; drag.current = { x: e.clientX, y: e.clientY, at: pos, to: pos }; e.currentTarget.setPointerCapture?.(e.pointerId); }}
        onPointerMove={(e) => { const d = drag.current; if (d) { d.to = inView({ left: d.at.left + e.clientX - d.x, top: d.at.top + e.clientY - d.y }); setPos(d.to); } }}
        onPointerUp={() => { const d = drag.current; if (d) { drag.current = null; keep(d.to); } }}>
        <b>{title}</b>{alias && <span>{alias}</span>}<i className="sp" />
        <button type="button" aria-label="Close" onClick={onClose}>×</button>
      </div>
      <div className="cad-dlg-rows">{children}</div>
      {showHelp && help && <p className="cad-dlg-help">{help}</p>}
      <div className="cad-dlg-ft">
        {help && <button type="button" className="q" aria-label="Help" aria-pressed={showHelp} onClick={() => setShowHelp(!showHelp)}>?</button>}
        {extra}
        <button type="button" onClick={onClose}>Cancel</button>
        <button type="button" className="p" onClick={onOk}>{okLabel}</button>
      </div>
    </div>
  );
}

/** A row: its label, and the value with its unit. */
export function Row({ label, unit, children }: { label: string; unit?: string; children: ReactNode }) {
  return <label className="cad-dlg-r"><span>{label}</span><span className="cad-dlg-in">{children}{unit && <u>{unit}</u>}</span></label>;
}
/** A number box: the text stays as typed and each whole number (0 or more, or any when `signed`) is passed on as it is
 * typed; a part such as "-" or nothing is let be until the box is left. A value set elsewhere (the command line) shows
 * at once. */
export function Num({ label, value, onChange, unit, signed }: { label: string; value: string | number; onChange: (v: string) => void; unit?: string; signed?: boolean }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText((t) => (isNumber(t) && Number(t) === Number(value) ? t : String(value))), [value]);
  const ok = (t: string) => isNumber(t) && (signed || Number(t) >= 0);
  return (
    <Row label={label} unit={unit}>
      <input aria-label={label} inputMode="decimal" autoComplete="off" value={text}
        onChange={(e) => { const t = e.target.value; setText(t); if (ok(t)) onChange(t.trim()); }} onBlur={() => { if (!ok(text)) setText(String(value)); }} />
    </Row>
  );
}
export const Check = ({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) => (
  <Row label={label}><input aria-label={label} type="checkbox" checked={value} disabled={disabled} onChange={(e) => onChange(e.target.checked)} /></Row>
);

/** The tools with a settings dialog in place of the side panel. */
export const DIALOG_TOOLS: EditTool[] = ['offset', 'fillet', 'chamfer', 'scale', 'mirror', 'array'];

/** Offset, Fillet / Chamfer, Scale, Mirror and Array: the command line's values themselves. A value changed here is
 * used at once (and shows in the prompt); one typed on the command line shows here. OK or Enter closes; Esc, Cancel or ×
 * put back what was changed here. */
export function EditDialog({ tool, settings: s, onPatch, onClose }: { tool: EditTool; settings: EditSettings; onPatch: (p: Partial<EditSettings>) => void; onClose: () => void }) {
  // For Esc: what each value was before it was changed here, and what it was changed to (a value set since on the
  // command line is the command line's, and stays).
  const was = useRef<Partial<EditSettings>>({}), mine = useRef<Partial<EditSettings>>({});
  for (const k of Object.keys(was.current) as (keyof EditSettings)[]) if (s[k] !== mine.current[k]) { delete was.current[k]; delete mine.current[k]; }
  const set = <K extends keyof EditSettings>(k: K) => (v: EditSettings[K]) => {
    if (!(k in was.current)) was.current = { ...was.current, [k]: s[k] };
    mine.current = { ...mine.current, [k]: v };
    onPatch({ [k]: v } as Partial<EditSettings>);
  };
  const n = (v: string, d: number) => (v.trim() !== '' && Number.isFinite(Number(v)) ? Math.max(1, Math.round(Number(v))) : d);
  return (
    <CadDialog id={tool === 'chamfer' ? 'fillet' : tool} title={EDIT_TITLE[tool]} alias={toolAlias(tool)} help={EDIT_HELP[tool]} onOk={onClose} onClose={() => { onPatch(was.current); onClose(); }}>
      {tool === 'offset' && <>
        <Num label="Distance" unit="m" value={s.offset} onChange={set('offset')} />
        <Check label="Through point" value={s.through} onChange={set('through')} />
        <Check label="Erase source" value={s.erase} onChange={set('erase')} />
        <Row label="Layer"><select aria-label="Layer" value={s.layer} onChange={(e) => set('layer')(e.target.value as EditSettings['layer'])}><option value="source">Source</option><option value="current">Current</option></select></Row>
      </>}
      {tool === 'fillet' && <Num label="Radius" unit="m" value={s.radius} onChange={set('radius')} />}
      {tool === 'chamfer' && <><Num label="First distance" unit="m" value={s.d1} onChange={set('d1')} /><Num label="Second distance" unit="m" value={s.d2} onChange={set('d2')} /></>}
      {(tool === 'fillet' || tool === 'chamfer') && <Row label="Trim"><select aria-label="Trim" value={s.trim ? 'yes' : 'no'} onChange={(e) => set('trim')(e.target.value === 'yes')}><option value="yes">Yes</option><option value="no">No</option></select></Row>}
      {tool === 'scale' && <Num label="Factor" unit="×" value={s.factor} onChange={set('factor')} />}
      {tool === 'mirror' && <Check label="Erase source" value={!s.keep} onChange={(v) => set('keep')(!v)} />}
      {tool === 'array' && <>
        <div className="cad-dlg-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={!s.polar} onClick={() => set('polar')(false)}>Rectangular</button>
          <button type="button" role="tab" aria-selected={s.polar} onClick={() => set('polar')(true)}>Polar</button>
        </div>
        {s.polar ? <>
          <Num label="Number" value={s.n} onChange={set('n')} />
          <Num label="Angle to fill" unit="°" signed value={s.angle} onChange={set('angle')} />
          <Check label="Rotate items" value={s.rotate} onChange={set('rotate')} />
        </> : <>
          <Num label="Rows" value={s.rows} onChange={set('rows')} />
          <Num label="Columns" value={s.cols} onChange={set('cols')} />
          <Num label="Row spacing" unit="m" signed value={s.dy} onChange={set('dy')} />
          <Num label="Column spacing" unit="m" signed value={s.dx} onChange={set('dx')} />
          <Check label="Associative (later)" value={false} disabled onChange={() => {}} />
        </>}
        <ArrayPreview polar={s.polar} rows={n(s.rows, 2)} cols={n(s.cols, 3)} count={n(s.n, 6)} angle={Number(s.angle) || 360} />
      </>}
    </CadDialog>
  );
}

/** A small picture of the array's count: the grid of rows × columns, or the items round the centre. */
function ArrayPreview({ polar, rows, cols, count, angle }: { polar: boolean; rows: number; cols: number; count: number; angle: number }) {
  const total = polar ? count : rows * cols;
  if (polar) {
    const full = Math.abs(Math.abs(angle) - 360) < 1e-9, k = Math.min(count, 24), step = ((angle * Math.PI) / 180) / (full ? k : Math.max(1, k - 1));
    return (
      <div className="cad-dlg-prev" aria-label={`${total} in all`}>
        <svg viewBox="-22 -22 44 44" width="44" height="44" aria-hidden="true">{Array.from({ length: k }, (_, i) => <rect key={i} x={16 * Math.cos(step * i) - 2.5} y={-16 * Math.sin(step * i) - 2.5} width="5" height="5" fill="none" stroke="currentColor" />)}</svg>
        <small>{total} in all</small>
      </div>
    );
  }
  const r = Math.min(rows, 6), c = Math.min(cols, 10);
  return (
    <div className="cad-dlg-prev" aria-label={`${total} in all`}>
      <span className="cad-dlg-grid" style={{ gridTemplateColumns: `repeat(${c}, 8px)` }}>{Array.from({ length: r * c }, (_, i) => <i key={i} />)}</span>
      <small>{rows} × {cols} = {total} in all</small>
    </div>
  );
}

/** The list of styles with New, Delete and Set current, and the selected style's fields. */
function StyleList<T extends { name: string }>({ draft, sel, onSel, onDraft, make, err }: {
  draft: CadStyles<T>; sel: string; onSel: (name: string) => void; onDraft: (d: CadStyles<T>) => void; make: (from: T, name: string) => T; err: (m: string | undefined) => void;
}) {
  const one = draft.styles.find((x) => x.name === sel) ?? draft.styles[0];
  return (
    <>
      <div className="cad-dlg-list" role="listbox" aria-label="Styles">
        {draft.styles.map((x) => (
          <button key={x.name} type="button" role="option" aria-selected={x.name === one.name} onClick={() => { onSel(x.name); err(undefined); }}>
            <span>{x.name}</span>{x.name === draft.current && <small>current</small>}
          </button>
        ))}
      </div>
      <div className="cad-dlg-btns">
        <button type="button" onClick={() => { const name = newStyleName(draft.styles.map((x) => x.name)); onDraft({ ...draft, styles: [...draft.styles, make(one, name)] }); onSel(name); err(undefined); }}>New</button>
        <button type="button" onClick={() => { const why = cannotDelete(draft, one.name); err(why); if (!why) { onDraft({ ...draft, styles: draft.styles.filter((x) => x.name !== one.name) }); onSel(draft.current); } }}>Delete</button>
        <button type="button" disabled={one.name === draft.current} onClick={() => onDraft({ ...draft, current: one.name })}>Set current</button>
      </div>
    </>
  );
}

/** Renames the selected style as it is typed (Standard keeps its name; names stay unique). */
function NameRow<T extends { name: string }>({ draft, sel, onRename, err }: { draft: CadStyles<T>; sel: string; onRename: (to: string) => void; err: (m: string | undefined) => void }) {
  const [v, setV] = useState(sel);
  useEffect(() => setV(sel), [sel]);
  return (
    <Row label="Name"><input aria-label="Style name" value={v} disabled={sel === STANDARD}
      onChange={(e) => { const to = e.target.value; setV(to); const why = badName(draft, sel, to); err(why); if (!why && to.trim() !== sel) onRename(to.trim()); }}
      onBlur={() => { if (badName(draft, sel, v)) { setV(sel); err(undefined); } }} /></Row>
  );
}
const renamed = <T extends { name: string }>(d: CadStyles<T>, from: string, to: string): CadStyles<T> =>
  ({ styles: d.styles.map((x) => (x.name === from ? { ...x, name: to } : x)), current: d.current === from ? to : d.current });

/** STYLE: the project's text styles. */
export function TextStyleDialog({ styles, annoMm, onSave, onClose }: { styles: CadStyles<CadTextStyle>; annoMm: number; onSave: (s: CadStyles<CadTextStyle>) => void; onClose: () => void }) {
  const [d, setD] = useState(styles);
  const [sel, setSel] = useState(styles.current);
  const [msg, setMsg] = useState<string>();
  const one = d.styles.find((x) => x.name === sel) ?? d.styles[0];
  const patch = (p: Partial<CadTextStyle>) => setD({ ...d, styles: d.styles.map((x) => (x.name === one.name ? { ...x, ...p } : x)) });
  return (
    <CadDialog id="style" title="Text style" alias="STYLE" onOk={() => onSave(d)} onClose={onClose}
      help={`Text takes the current style. Height 0 asks each time (starting at ${annoMm} mm, the annotation text height). Fonts: those that print the same on the sheets and in Save DXF.`}>
      <StyleList draft={d} sel={one.name} onSel={setSel} onDraft={setD} make={(from, name) => ({ ...from, name })} err={setMsg} />
      <NameRow draft={d} sel={one.name} onRename={(to) => { setD(renamed(d, one.name, to)); setSel(to); }} err={setMsg} />
      <Row label="Font"><select aria-label="Font" value={one.font} onChange={(e) => patch({ font: e.target.value as CadFont })}>{CAD_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}</select></Row>
      <Num label="Height" unit="mm" value={one.heightMm} onChange={(v) => patch({ heightMm: Number(v) })} />
      {msg && <p className="cad-dlg-help" role="alert">{msg}</p>}
    </CadDialog>
  );
}

/** DIMSTYLE: the project's dimension styles. */
export function DimStyleDialog({ styles, asBefore, onSave, onClose }: {
  styles: CadStyles<CadDimStyle>;
  /** Standard not changed yet: it draws as before (sizes from each dimension's length) until it is. */
  asBefore: boolean;
  onSave: (s: CadStyles<CadDimStyle>) => void;
  onClose: () => void;
}) {
  const [d, setD] = useState(styles);
  const [sel, setSel] = useState(styles.current);
  const [tab, setTab] = useState<DimTab>('lines');
  const [msg, setMsg] = useState<string>();
  const [note, setNote] = useState<string>();
  const fileRef = useRef<HTMLInputElement>(null);
  const one = d.styles.find((x) => x.name === sel) ?? d.styles[0];
  const patch = (p: Partial<CadDimStyle>) => setD({ ...d, styles: d.styles.map((x) => (x.name === one.name ? { ...x, ...p } : x)) });
  const mm = (k: keyof CadDimStyle, label: string) => <Num label={label} unit="mm" value={one[k] as number} onChange={(v) => patch({ [k]: Number(v) })} />;
  const check = (k: 'hideExt1' | 'hideExt2' | 'textFlat' | 'trimZeros' | 'comma', label: string) => <Check label={label} value={one[k]} onChange={(v) => patch({ [k]: v })} />;
  const arrows = (label: string, value: string, set: (v: string) => void, same?: boolean) => (
    <Row label={label}><select aria-label={label} value={value} onChange={(e) => set(e.target.value)}>{same && <option value="same">As first</option>}{DIM_ARROWS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></Row>
  );
  const standardAsBefore = asBefore && one.name === STANDARD && JSON.stringify(one) === JSON.stringify(styles.styles.find((x) => x.name === STANDARD));
  const importFile = async (f: File) => {
    try {
      const got = readDxfDimStyles(await f.text());
      if (!got.styles.length) { setNote(undefined); setMsg(`${f.name} has no dimension styles.`); return; }
      const added = mergeImported(d.styles.map((x) => x.name), got.styles.map((x) => x.style), f.name);
      setD({ ...d, styles: [...d.styles, ...added] });
      const cur = got.current ? added[got.styles.findIndex((x) => x.style.name === got.current)] : undefined;
      setSel((cur ?? added[0]).name);
      const notes = got.styles.flatMap((x, i) => x.notes.map((n) => `${added[i].name}: ${n}`));
      setMsg(undefined);
      setNote(`Imported ${added.length} style${added.length === 1 ? '' : 's'} from ${f.name}: ${added.map((x) => x.name).join(', ')}.${notes.length ? ` ${notes.join('; ')}.` : ''} OK keeps them.`);
    } catch (e) { setNote(undefined); setMsg((e as Error).message); }
  };
  return (
    <CadDialog id="dimstyle" title="Dimension style" alias="DIMSTYLE" onOk={() => onSave(d)} onClose={onClose} help={DIM_HELP[tab]}
      extra={<>
        <button type="button" onClick={() => fileRef.current?.click()}>Import DXF…</button>
        <input ref={fileRef} type="file" accept=".dxf" hidden aria-label="Import dimension styles" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importFile(f); }} />
      </>}>
      <StyleList draft={d} sel={one.name} onSel={setSel} onDraft={setD} make={(from, name) => ({ ...from, name })} err={setMsg} />
      <NameRow draft={d} sel={one.name} onRename={(to) => { setD(renamed(d, one.name, to)); setSel(to); }} err={setMsg} />
      <DimPreview s={one} />
      <div className="cad-dlg-tabs" role="tablist" aria-label="Dimension style">
        {DIM_TABS.map((x) => <button key={x.k} type="button" role="tab" aria-selected={tab === x.k} onClick={() => setTab(x.k)}>{x.label}</button>)}
      </div>
      {tab === 'lines' && <>
        <div className="cad-dlg-sec">Arrows</div>
        {arrows('Arrow', one.arrow, (v) => patch({ arrow: v as DimArrow }))}
        {arrows('Second arrow', one.arrow2, (v) => patch({ arrow2: v as CadDimStyle['arrow2'] }), true)}
        {mm('arrowMm', 'Arrow size')}
        <div className="cad-dlg-sec">Lines</div>
        {mm('offsetMm', 'Offset from origin')}
        {mm('extendMm', 'Extend beyond line')}
        {mm('dleMm', 'Line past extension lines')}
        {check('hideExt1', 'Hide extension line 1')}
        {check('hideExt2', 'Hide extension line 2')}
      </>}
      {tab === 'text' && <>
        {mm('textMm', 'Text height')}
        <Row label="Vertical"><select aria-label="Vertical" value={one.textPos} onChange={(e) => patch({ textPos: e.target.value as DimTextPos })}>{DIM_TEXT_POS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></Row>
        <Row label="Along the line"><select aria-label="Along the line" value={one.textAlong} onChange={(e) => patch({ textAlong: e.target.value as DimTextAlong })}>{DIM_TEXT_ALONG.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></Row>
        {mm('gapMm', 'Gap from line')}
        {check('textFlat', 'Text always horizontal')}
      </>}
      {tab === 'units' && <>
        <Row label="Unit"><select aria-label="Unit" value={one.unit} onChange={(e) => patch({ unit: e.target.value as DimUnit })}>{DIM_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select></Row>
        <Num label="Decimal places" value={one.decimals} onChange={(v) => patch({ decimals: Math.min(4, Math.round(Number(v))) })} />
        <Num label="Round to (0 = off)" unit={one.unit} value={one.round} onChange={(v) => patch({ round: Number(v) })} />
        <Num label="Measurement scale" unit="×" value={one.scale} onChange={(v) => { if (Number(v) > 0) patch({ scale: Number(v) }); }} />
        {check('trimZeros', 'Drop trailing zeros')}
        {check('comma', 'Decimal comma')}
        <Row label="Prefix"><input aria-label="Prefix" value={one.prefix} onChange={(e) => patch({ prefix: e.target.value })} /></Row>
        <Row label="Suffix"><input aria-label="Suffix" value={one.suffix} placeholder=" m" onChange={(e) => patch({ suffix: e.target.value })} /></Row>
      </>}
      {standardAsBefore && <p className="cad-dlg-help" role="note">Standard draws as before (sizes follow each dimension's length) until it is changed.</p>}
      {note && <p className="cad-dlg-help" role="status">{note}</p>}
      {msg && <p className="cad-dlg-help" role="alert">{msg}</p>}
    </CadDialog>
  );
}

type DimTab = 'lines' | 'text' | 'units';
const DIM_TABS: { k: DimTab; label: string }[] = [{ k: 'lines', label: 'Lines & arrows' }, { k: 'text', label: 'Text' }, { k: 'units', label: 'Units' }];
const DIM_HELP: Record<DimTab, string> = {
  lines: 'New dimensions take the current style; sizes are paper mm at the annotation scale. Dimensions drawn before keep their look. Import DXF reads the dimension styles of a drawing from another CAD program.',
  text: 'Outside: over the line on the side away from the points, as before. Above and below are as the text reads; centred breaks the line round it.',
  units: 'The length measured, in the unit, times the measurement scale; rounded to the step (in the unit) when set. Prefix and suffix are written before and after it.'
};

/** The selected style on a 3.20 m dimension, at paper size. */
function DimPreview({ s }: { s: CadDimStyle }) {
  const h = s.textMm > 0 ? s.textMm : 2.5;
  const it: SketchItem = { id: 'preview', kind: 'dim', layer: '', pts: [[0, 0], [40, 0], [20, 8]], look: lookOf(s, 1), h };
  const g = dimOf(it, 3.2 / 40), P = (q: [number, number]) => `${q[0].toFixed(2)} ${(-q[1]).toFixed(2)}`;
  const x = g.text[0].toFixed(2), y = (-g.text[1]).toFixed(2);
  return (
    <div className="cad-dlg-prev" aria-label={`Preview: ${g.label}`}>
      <svg viewBox="-6 -18 52 22" width="156" height="66" aria-hidden="true">
        <path d={g.lines.map(([a, b]) => `M${P(a)}L${P(b)}`).join('')} fill="none" stroke="currentColor" strokeWidth="0.25" />
        <text x={x} y={y} fontSize={h} textAnchor="middle" fill="currentColor" transform={g.angle ? `rotate(${((-g.angle * 180) / Math.PI).toFixed(2)} ${x} ${y})` : undefined}>{g.label}</text>
      </svg>
    </div>
  );
}

/** A point shape as a small picture for the Point style dialog. */
function PointGlyph({ mode }: { mode: number }) {
  const mk = pointMark(mode), r = 7, c = 10;
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
      {mk.lines.map(([a, b], i) => <line key={i} x1={c + a[0] * r} y1={c - a[1] * r} x2={c + b[0] * r} y2={c - b[1] * r} stroke="currentColor" strokeWidth="1.2" />)}
      {mk.circle && <circle cx={c} cy={c} r={r} fill="none" stroke="currentColor" strokeWidth="1.2" />}
      {mk.dot && <circle cx={c} cy={c} r="1.6" fill="currentColor" />}
    </svg>
  );
}

/** PTYPE: how drawn points are shown: one of twenty shapes, and a size relative to the screen or in drawing units
 * (S8 of the Design CAD 2D gap plan). */
export function PointStyleDialog({ style, onSave, onClose }: { style: PointStyle; onSave: (s: PointStyle) => void; onClose: () => void }) {
  const [d, setD] = useState(style);
  const [size, setSize] = useState(String(style.size));
  const ok = () => { const n = Number(size.replace(',', '.')); onSave({ ...d, size: n > 0 ? n : style.size }); };
  return (
    <CadDialog id="ptype" title="Point style" alias="PTYPE" onOk={ok} onClose={onClose}
      help="Every drawn point (POINT, DIVIDE, MEASURE) is shown and printed with this shape. Size relative to screen: a percentage of the view's height, so points keep their size as you zoom (2 mm across on the sheets). Size in absolute units: drawing units, so they scale with the plan. Saved to DXF / DWG as PDMODE and PDSIZE.">
      <div className="cad-ptype-grid" role="radiogroup" aria-label="Point shape">
        {POINT_SHAPES.map((s) => (
          <button key={s.id} type="button" role="radio" aria-checked={d.mode === s.id} aria-label={s.label} title={s.label} onClick={() => setD({ ...d, mode: s.id })}><PointGlyph mode={s.id} /></button>
        ))}
      </div>
      <Num label="Point size" value={size} onChange={setSize} unit={d.relative ? '%' : 'units'} />
      <Row label="Size">
        <label><input type="radio" name="cad-ptsize" aria-label="Size relative to screen" checked={d.relative} onChange={() => setD({ ...d, relative: true })} /> Relative to screen</label>
        <label><input type="radio" name="cad-ptsize" aria-label="Size in absolute units" checked={!d.relative} onChange={() => setD({ ...d, relative: false })} /> In absolute units</label>
      </Row>
    </CadDialog>
  );
}

/** What the Block definition dialog holds while it is open (S9 of the Design CAD 2D gap plan): the name, the base
 * point (drawing units), the ids of the drawn objects, what becomes of them, and a description. `picking` is set while
 * the dialog steps aside for a point or objects to be picked on the drawing; `redefine` while it asks about a name
 * already defined. */
export interface BlockDraft { name: string; base: [number, number] | null; ids: string[]; mode: 'retain' | 'convert' | 'delete'; description: string; picking?: 'base' | 'objects'; redefine?: boolean }

const BLOCK_HELP = 'A block is a named group of drawn objects you can insert again (Insert comes with the next step). The base point is where it is held when inserted. Convert to block replaces the objects with one insert; Retain leaves them as they are; Delete takes them away. The name cannot contain < > / \\ " : ; ? * | = or `.';
/** BLOCK: a block defined from drawn objects: Name (the drawing's blocks listed to redefine one), Base point (Pick point,
 * X, Y in metres), Objects (Select objects, the count, Retain / Convert to block / Delete), Description, the drawing's
 * units, OK · Cancel. Redefining asks first. */
export function BlockDialog({ draft, names, archNames, units, k, onDraft, onPick, onOk, onClose }: {
  draft: BlockDraft;
  /** The drawing's own blocks (one can be redefined) and the architect's (which cannot). */
  names: string[];
  archNames: string[];
  /** The drawing's unit, as shown. */
  units: string;
  /** Metres per drawing unit. */
  k: number;
  onDraft: (d: BlockDraft) => void;
  onPick: (what: 'base' | 'objects') => void;
  onOk: () => void;
  onClose: () => void;
}) {
  const nameErr = blockNameError(draft.name, archNames);
  const exists = !nameErr && names.some((n) => n.toLowerCase() === draft.name.trim().toLowerCase());
  const [xy, setXy] = useState<[string, string]>([draft.base ? (draft.base[0] * k).toFixed(3) : '', draft.base ? (draft.base[1] * k).toFixed(3) : '']);
  useEffect(() => { setXy([draft.base ? (draft.base[0] * k).toFixed(3) : '', draft.base ? (draft.base[1] * k).toFixed(3) : '']); }, [draft.base, k]);
  const coord = (i: 0 | 1, v: string) => {
    const next: [string, string] = i === 0 ? [v, xy[1]] : [xy[0], v];
    setXy(next);
    const x = Number(next[0].replace(',', '.')), y = Number(next[1].replace(',', '.'));
    if (Number.isFinite(x) && Number.isFinite(y) && next[0].trim() && next[1].trim()) onDraft({ ...draft, base: [x / k, y / k] });
  };
  const ok = () => { if (nameErr || !draft.base || !draft.ids.length) return; if (exists && !draft.redefine) onDraft({ ...draft, redefine: true }); else onOk(); };
  const why = nameErr ?? (!draft.base ? 'Pick or type the base point.' : !draft.ids.length ? 'Select the objects.' : undefined);
  return (
    <CadDialog id="block" title="Block definition" alias="BLOCK" onOk={ok} onClose={onClose}
      help={BLOCK_HELP}>
      <Row label="Name">
        <input aria-label="Block name" list="cad-block-names" value={draft.name} autoFocus onChange={(e) => onDraft({ ...draft, name: e.target.value, redefine: false })} />
        <datalist id="cad-block-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
      </Row>
      <Row label="Base point">
        <button type="button" className="chip" onClick={() => onPick('base')}>Pick point</button>
        <input aria-label="Base X" className="r" value={xy[0]} placeholder="X" onChange={(e) => coord(0, e.target.value)} />
        <input aria-label="Base Y" className="r" value={xy[1]} placeholder="Y" onChange={(e) => coord(1, e.target.value)} />
        <span className="m">m</span>
      </Row>
      <Row label="Objects">
        <button type="button" className="chip" onClick={() => onPick('objects')}>Select objects</button>
        <span className="m" aria-label="Objects selected">{draft.ids.length} selected</span>
      </Row>
      <Row label="">
        {([['retain', 'Retain'], ['convert', 'Convert to block'], ['delete', 'Delete']] as const).map(([id, label]) => (
          <label key={id}><input type="radio" name="cad-block-mode" aria-label={label} checked={draft.mode === id} onChange={() => onDraft({ ...draft, mode: id })} /> {label}</label>
        ))}
      </Row>
      <Row label="Description"><input aria-label="Block description" value={draft.description} onChange={(e) => onDraft({ ...draft, description: e.target.value })} /></Row>
      <Row label="Units"><span className="m">{units}</span></Row>
      {draft.redefine && exists ? (
        <p className="cad-dlg-help" role="alert">Block "{draft.name.trim()}" exists. Redefine it?
          <button type="button" className="chip" onClick={onOk}>Yes</button>
          <button type="button" className="chip" onClick={() => onDraft({ ...draft, redefine: false })}>No</button>
        </p>
      ) : why ? <p className="cad-dlg-help" role="status">{why}</p> : null}
    </CadDialog>
  );
}

/** What the Attribute definition dialog holds (ATTDEF, S11 of the Design CAD 2D gap plan): the modes, tag, prompt
 * and default, the text's justification, style, height (mm on paper) and rotation, and the insertion point (drawing
 * units; `picking` while the dialog steps aside for a click on the plan). */
export interface AttDraft {
  modes: { invisible: boolean; constant: boolean; verify: boolean; preset: boolean; lock: boolean; mlines: boolean };
  tag: string; prompt: string; def: string;
  just: TextJust; style: string; heightMm: number; rot: number;
  at: [number, number] | null; picking?: boolean;
}
export const ATT_DRAFT: AttDraft = { modes: { invisible: false, constant: false, verify: false, preset: false, lock: false, mlines: false }, tag: '', prompt: '', def: '', just: 'L', style: 'Standard', heightMm: 2.5, rot: 0, at: null };

/** ATTDEF: an attribute definition for a block: Mode · Attribute (Tag, Prompt, Default) · Text (Justify, Text style,
 * Height, Rotation) · Insertion point (Pick on plan, X · Y) · OK · Cancel. */
export function AttDefDialog({ draft, styles, k, onDraft, onPick, onOk, onClose }: {
  draft: AttDraft;
  /** The project's text styles' names. */
  styles: string[];
  /** Metres per drawing unit. */
  k: number;
  onDraft: (d: AttDraft) => void;
  onPick: () => void;
  onOk: () => void;
  onClose: () => void;
}) {
  const [xy, setXy] = useState<[string, string]>([draft.at ? (draft.at[0] * k).toFixed(3) : '', draft.at ? (draft.at[1] * k).toFixed(3) : '']);
  useEffect(() => { setXy([draft.at ? (draft.at[0] * k).toFixed(3) : '', draft.at ? (draft.at[1] * k).toFixed(3) : '']); }, [draft.at, k]);
  const coord = (i: 0 | 1, v: string) => {
    const next: [string, string] = i === 0 ? [v, xy[1]] : [xy[0], v];
    setXy(next);
    const x = Number(next[0].replace(',', '.')), y = Number(next[1].replace(',', '.'));
    if (Number.isFinite(x) && Number.isFinite(y) && next[0].trim() && next[1].trim()) onDraft({ ...draft, at: [x / k, y / k] });
  };
  const mode = (key: keyof AttDraft['modes'], label: string) => <Check key={key} label={label} value={draft.modes[key]} onChange={(v) => onDraft({ ...draft, modes: { ...draft.modes, [key]: v } })} />;
  const why = !cleanTag(draft.tag) ? 'Type a tag (letters, digits, no spaces).' : !draft.at ? 'Pick or type the insertion point.' : !(draft.heightMm > 0) ? 'The height must be above 0.' : undefined;
  return (
    <CadDialog id="attdef" title="Attribute definition" alias="ATTDEF" onOk={() => { if (!why) onOk(); }} onClose={onClose}
      help="An attribute is a tag drawn as text in a block: when the block is inserted, its value is asked (the prompt, with the default) and shown in place of the tag. Invisible: not drawn. Constant: never asked, the default always. Preset: not asked, the default taken. Lock position keeps its place. Make the block with BLOCK, the attribute among its objects.">
      <div className="cad-dlg-sec">Mode</div>
      {mode('invisible', 'Invisible')}{mode('constant', 'Constant')}{mode('verify', 'Verify')}{mode('preset', 'Preset')}{mode('lock', 'Lock position')}{mode('mlines', 'Multiple lines')}
      <div className="cad-dlg-sec">Attribute</div>
      <Row label="Tag"><input aria-label="Tag" value={draft.tag} autoFocus onChange={(e) => onDraft({ ...draft, tag: e.target.value })} onBlur={() => onDraft({ ...draft, tag: cleanTag(draft.tag) })} /></Row>
      <Row label="Prompt"><input aria-label="Prompt" value={draft.prompt} onChange={(e) => onDraft({ ...draft, prompt: e.target.value })} /></Row>
      <Row label="Default"><input aria-label="Default" value={draft.def} onChange={(e) => onDraft({ ...draft, def: e.target.value })} /></Row>
      <div className="cad-dlg-sec">Text</div>
      <Row label="Justify"><select aria-label="Justify" value={draft.just} onChange={(e) => onDraft({ ...draft, just: e.target.value as TextJust })}>{TEXT_JUSTS.map((j) => <option key={j.id} value={j.id}>{j.label}</option>)}</select></Row>
      <Row label="Text style"><select aria-label="Text style" value={draft.style} onChange={(e) => onDraft({ ...draft, style: e.target.value })}>{styles.map((s) => <option key={s} value={s}>{s}</option>)}</select></Row>
      <Num label="Height" unit="mm" value={draft.heightMm} onChange={(v) => onDraft({ ...draft, heightMm: Number(v) })} />
      <Num label="Rotation" unit="°" value={draft.rot} onChange={(v) => onDraft({ ...draft, rot: Number(v) || 0 })} signed />
      <div className="cad-dlg-sec">Insertion point</div>
      <Row label="">
        <button type="button" className="chip" onClick={onPick}>Pick on plan</button>
        <input aria-label="Insertion X" className="r" value={xy[0]} placeholder="X" onChange={(e) => coord(0, e.target.value)} />
        <input aria-label="Insertion Y" className="r" value={xy[1]} placeholder="Y" onChange={(e) => coord(1, e.target.value)} />
        <span className="m">m</span>
      </Row>
      {why && <p className="cad-dlg-help" role="status">{why}</p>}
    </CadDialog>
  );
}

type AttTab = 'values' | 'text' | 'props';
/** EATTEDIT (a double-click on a block with attributes): the block's name; Attribute (Tag · Prompt · Value, the value
 * typed), Text options (style, height, justify of the attribute picked, in its block's definition) and Properties
 * (the insert's layer and colour); OK · Cancel · Apply. */
export function AttEditDialog({ insert, def, k, layers, onApply, onClose }: {
  insert: SketchItem;
  def: CadBlockDef;
  k: number;
  layers: string[];
  /** The insert (its values, layer, colour) and the block's definition as edited; the dialog stays open when `keep`. */
  onApply: (ins: SketchItem, def: CadBlockDef, keep: boolean) => void;
  onClose: () => void;
}) {
  const [ins, setIns] = useState(insert);
  const [d, setD] = useState(def);
  const [tab, setTab] = useState<AttTab>('values');
  const ads = attdefsOf(d);
  const [sel, setSel] = useState(ads[0]?.tag ?? '');
  const one = ads.find((a) => a.tag === sel) ?? ads[0];
  const setValue = (tag: string, v: string) => setIns({ ...ins, attrs: { ...ins.attrs, [tag]: v } });
  const patchAd = (p: Partial<SketchItem>) => one && setD({ ...d, items: d.items.map((it) => (it.id === one.id ? { ...it, ...p } : it)) });
  return (
    <CadDialog id="attedit" title="Edit attributes" alias="EATTEDIT" onOk={() => onApply(ins, d, false)} onClose={onClose} wide
      extra={<button type="button" className="chip" onClick={() => onApply(ins, d, true)}>Apply</button>}
      help="The values of this block's attributes: click a value and type. Text options change the attribute's text in the block's definition, so every insert of the block follows. Properties set the insert's layer and colour. Apply keeps the dialog open.">
      <Row label="Block"><b>{d.name}</b></Row>
      <div className="cad-dlg-tabs" role="tablist">
        {([['values', 'Attribute'], ['text', 'Text options'], ['props', 'Properties']] as [AttTab, string][]).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      {tab === 'values' && (
        <table className="cad-att-table" aria-label="Attributes">
          <thead><tr><th>Tag</th><th>Prompt</th><th>Value</th></tr></thead>
          <tbody>
            {ads.map((a) => (
              <tr key={a.id} aria-selected={a.tag === one?.tag} onClick={() => setSel(a.tag ?? '')}>
                <td>{a.tag}</td><td>{a.prompt}</td>
                <td>{a.att?.constant ? <span className="m" title="Constant: its default always">{a.text}</span>
                  : <input aria-label={`Value of ${a.tag}`} value={attrValue(ins, a)} onChange={(e) => setValue(a.tag ?? '', e.target.value)} />}</td>
              </tr>
            ))}
            {!ads.length && <tr><td colSpan={3} className="m">This block has no attributes.</td></tr>}
          </tbody>
        </table>
      )}
      {tab === 'text' && one && <>
        <Row label="Attribute"><select aria-label="Attribute" value={one.tag} onChange={(e) => setSel(e.target.value)}>{ads.map((a) => <option key={a.id} value={a.tag}>{a.tag}</option>)}</select></Row>
        <Row label="Text style"><span className="m">Standard</span></Row>
        <Num label="Height" unit="m" value={Math.round((one.h ?? 0) * k * 1000) / 1000} onChange={(v) => { const n = Number(v); if (n > 0) patchAd({ h: n / k }); }} />
        <Row label="Justify"><select aria-label="Attribute justify" value={one.just ?? 'L'} onChange={(e) => patchAd({ just: e.target.value === 'L' ? undefined : e.target.value as TextJust })}>{TEXT_JUSTS.map((j) => <option key={j.id} value={j.id}>{j.label}</option>)}</select></Row>
      </>}
      {tab === 'props' && <>
        <Row label="Layer"><select aria-label="Block layer" value={ins.layer} onChange={(e) => setIns({ ...ins, layer: e.target.value })}>{[...new Set([...layers, ins.layer])].map((l) => <option key={l} value={l}>{l}</option>)}</select></Row>
        <Row label="Colour"><input aria-label="Block colour" value={ins.color ?? ''} placeholder="ByLayer" onChange={(e) => { const { color: _c, ...rest } = ins; setIns(e.target.value.trim() ? { ...ins, color: e.target.value.trim() } : rest); }} /></Row>
      </>}
    </CadDialog>
  );
}

/** The prompts of a block with attributes, asked together when Drafting settings has "Attribute prompts in a dialog". */
export function AttPromptDialog({ def, values, onOk, onClose }: { def: CadBlockDef; values: Record<string, string>; onOk: (values: Record<string, string>) => void; onClose: () => void }) {
  const [v, setV] = useState(values);
  const asked = askedAttdefs(def);
  return (
    <CadDialog id="attprompt" title={`Insert ${def.name}`} alias="INSERT" onOk={() => onOk(v)} onClose={onClose} help="The block's attributes, each with its default; Enter keeps them.">
      {asked.map((a, i) => <Row key={a.id} label={a.prompt || a.tag || ''}><input aria-label={a.tag} autoFocus={i === 0} value={v[a.tag ?? ''] ?? a.text ?? ''} onChange={(e) => setV({ ...v, [a.tag ?? '']: e.target.value })} /></Row>)}
    </CadDialog>
  );
}
