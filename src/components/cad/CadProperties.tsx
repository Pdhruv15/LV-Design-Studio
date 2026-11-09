import { useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { LINETYPE_IDS, LINETYPES, LINEWEIGHTS, styleOf, withProps, type LayerStyle, type LinetypeId, type ObjectProps } from '../../model/cadLayerStyle';
import { geometryRows, geomKind, kindChoices, kindLabel, parseTyped, sharedValue, shownValue, textRows, withProp, type PropDef } from '../../model/cadProps';
import { TRAY_SERVICES, TRAY_WIDTHS } from '../../model/cadSketch';
import { TEXT_JUSTS } from '../../model/cadText';
import type { SketchItem } from '../../types';
import { ColourPicker } from './ColourPicker';

/** Design CAD → Properties palette (Ctrl/Cmd+1), docked on the right while a drawing is open: General (layer, colour,
 * linetype, lineweight, print), Geometry and Text of the drawn objects picked, two columns, click a value to edit it
 * (Enter applies, Esc puts it back, Tab goes to the next). With nothing picked: the defaults for new objects. Mixed
 * values show "varies", apart from ByLayer. Each change is one undo step. */

const VARIES = '__varies';
type Shown = number | string | undefined | 'varies';

export function PropertiesPalette({ items, devices, layers, styles, current, newProps = {}, textMm, k, onItems, onCurrent, onNewProps, onTextMm, onClose, bare }: {
  items: SketchItem[];
  /** Devices picked with them (their own panel edits them). */
  devices: number;
  layers: string[];
  styles: Record<string, LayerStyle>;
  current: string;
  /** The colour, linetype and lineweight new lines, polylines, rectangles, circles and arcs take (absent = ByLayer). */
  newProps?: ObjectProps;
  /** Annotation text height on paper (mm), for new text. */
  textMm: number;
  /** Metres per drawing unit. */
  k: number;
  onItems: (next: SketchItem[], what: string) => void;
  onCurrent: (layer: string) => void;
  /** New objects' colour, linetype or lineweight set (a key with `undefined`: back to ByLayer). */
  onNewProps?: (patch: ObjectProps) => void;
  onTextMm: (mm: number) => void;
  onClose?: () => void;
  /** Inside the properties dock, which has the title and the fold button: no header of its own. */
  bare?: boolean;
}) {
  const [kind, setKind] = useState('');
  const [fold, setFold] = useState<Record<string, boolean>>({});
  const [vtx, setVtx] = useState(0);
  const [edit, setEdit] = useState<{ key: string; draft: string } | null>(null);
  const [note, setNote] = useState('');
  // The kind chosen, while the picked objects still have it (a polyline closed becomes a closed polyline): else All.
  const shownKind = kind && items.some((it) => kindLabel(it) === kind) ? kind : '';
  const sel = shownKind ? items.filter((it) => kindLabel(it) === shownKind) : items;
  const choices = kindChoices(items);
  const kinds = new Set(sel.map(geomKind));
  const gk = kinds.size === 1 ? [...kinds][0] : undefined;
  const one = sel.length === 1 ? sel[0] : undefined;
  const geom = gk ? geometryRows(gk, sel).filter((d) => one || (d.key !== 'vx' && d.key !== 'vy')) : [];
  const text = gk ? textRows(gk) : [];
  const vi = one ? Math.min(vtx, one.pts.length - 1) : 0;

  const shared = <K extends 'layer' | 'color' | 'lt' | 'lw'>(key: K) => { const v = new Set(sel.map((it) => it[key])); return v.size === 1 ? { v: [...v][0] } : 'varies' as const; };
  const general = (patch: ObjectProps & { layer?: string }, what: string) => { setNote(''); onItems(sel.map((it) => withProps(it, patch)), what); };
  const setValue = (def: PropDef, typed: string) => {
    const value = parseTyped(def, typed);
    if (value === undefined) { setNote(`${def.label}: type a number.`); return false; }
    const next = sel.map((it) => withProp(it, def.key, value, k, vi));
    const ok = next.filter((x): x is SketchItem => !!x);
    if (!ok.length) { setNote(`${def.label}: ${typed} does not fit ${sel.length === 1 ? 'this object' : 'these objects'}.`); return false; }
    setNote(ok.length < sel.length ? `${def.label} set on ${ok.length} of ${sel.length}; the others do not take it.` : '');
    onItems(ok, `${sel.length === 1 ? kindLabel(sel[0]) : `${ok.length} objects`}: ${def.label.toLowerCase()} ${shownValue(def, value) || 'cleared'}`);
    return true;
  };

  // Click a value to edit it; Tab goes to the next row that takes a typed value.
  const typed = [...geom, ...text].filter((d) => !d.ro && !SELECTS.has(d.key));
  const start = (def: PropDef, v: Shown) => setEdit({ key: def.key, draft: v === 'varies' || v === undefined ? '' : typeof v === 'number' ? v.toFixed(def.unit === 'deg' ? 1 : 2) : v });
  const commit = (def: PropDef, move = 0) => {
    if (!edit) return;
    const v = sharedValue(sel, def.key, k, vi);
    const was = v === 'varies' || v === undefined ? '' : typeof v === 'number' ? v.toFixed(def.unit === 'deg' ? 1 : 2) : v;
    if (edit.draft !== was && !setValue(def, edit.draft)) return;
    const i = typed.findIndex((d) => d.key === def.key), nx = move ? typed[i + move] : undefined;
    if (nx) start(nx, sharedValue(sel, nx.key, k, vi)); else setEdit(null);
  };

  const row = (label: string, value: ReactNode, title?: string) => (
    <div className="cad-pp-row" key={label}><span className="k" title={title}>{label}</span><span className="v">{value}</span></div>
  );
  const varies = <i className="cad-pp-vr">varies</i>;
  const valueRow = (def: PropDef) => {
    const v = sharedValue(sel, def.key, k, vi);
    if (SELECTS.has(def.key)) {
      const opts = def.key === 'width' ? [...new Set([...TRAY_WIDTHS.map(String), ...(typeof v === 'string' && v !== 'varies' ? [v] : [])])].map((w) => [w, `${w} mm`])
        : def.key === 'service' ? [['', 'None'], ...[...new Set([...TRAY_SERVICES, ...(typeof v === 'string' && v && v !== 'varies' ? [v] : [])])].map((s) => [s, s])]
        : def.key === 'just' ? TEXT_JUSTS.map((j) => [j.id, j.label])
        : [['Yes', 'Yes'], ['No', 'No']];
      return row(def.label, (
        <select aria-label={def.label} value={v === 'varies' ? VARIES : String(v ?? '')} onChange={(e) => { if (e.target.value !== VARIES) setValue(def, e.target.value); }}>
          {v === 'varies' && <option value={VARIES} disabled>varies</option>}
          {opts.map(([id, l]) => <option key={id} value={id}>{l}</option>)}
        </select>
      ));
    }
    if (def.ro) return row(def.label, <span className="ro">{v === 'varies' ? varies : shownValue(def, v)}</span>);
    if (edit?.key === def.key) {
      return row(def.label, (
        <input autoFocus aria-label={def.label} className={def.text ? undefined : 'r'} value={edit.draft} onChange={(e) => setEdit({ key: def.key, draft: e.target.value })} onBlur={() => commit(def)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(def); }
            else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setEdit(null); setNote(''); }
            else if (e.key === 'Tab') { e.preventDefault(); commit(def, e.shiftKey ? -1 : 1); }
          }} />
      ));
    }
    return row(def.label, <button type="button" className={`cad-pp-val${def.text ? '' : ' r'}`} aria-label={def.label} onClick={() => start(def, v)}>{v === 'varies' ? varies : shownValue(def, v)}</button>);
  };
  const section = (id: string, title: string, body: ReactNode) => (
    <div key={id}>
      <button type="button" className="cad-pp-sec" aria-expanded={!fold[id]} onClick={() => setFold({ ...fold, [id]: !fold[id] })}>{fold[id] ? '▸' : '▾'} {title}</button>
      {!fold[id] && <div className="cad-pp-kv">{body}</div>}
    </div>
  );
  const byLayer = <span className="cad-pp-by">ByLayer</span>;
  const prints = () => {
    const p = new Set(sel.map((it) => !styleOf(styles, it.layer).noPrint));
    return p.size > 1 ? varies : <span className="cad-pp-by">{[...p][0] ? 'Yes' : 'No'} (layer)</span>;
  };

  const lay = shared('layer'), lt = shared('lt'), lw = shared('lw');
  const trays = sel.some((it) => it.tray || it.cable);
  return (
    <section className="cad-ppal" aria-label="Properties palette">
      {!bare && <div className="cad-lp-head">Properties<span className="sp" /><button type="button" aria-label="Close the properties palette" title="Show / hide (Ctrl/Cmd+1)" onClick={onClose}><X size={13} /></button></div>}
      {items.length > 0 && (
        <select className="cad-pp-kind" aria-label="Objects shown" value={shownKind} onChange={(e) => { setKind(e.target.value); setEdit(null); setVtx(0); }}>
          {choices.map((c) => <option key={c.id} value={c.id}>{c.label} ({c.n})</option>)}
        </select>
      )}
      <div className="cad-pp-body">
        {!items.length ? section('general', 'General', <>
          {row('Layer', <select aria-label="Current layer" value={current} onChange={(e) => onCurrent(e.target.value)}>{layers.map((l) => <option key={l} value={l}>{l}</option>)}</select>, 'New lines, polylines, rectangles, circles and arcs go on the current layer.')}
          {onNewProps ? <>
            {row('Colour', <ColourPicker label="Colour of new objects" value={newProps.color} onChange={(c) => onNewProps({ color: c })} />, 'New lines, polylines, rectangles, circles and arcs take this colour (also on the ribbon: Properties).')}
            {row('Linetype', (
              <select aria-label="Linetype of new objects" className={!newProps.lt ? 'by' : undefined} value={newProps.lt ?? ''} onChange={(e) => onNewProps({ lt: (e.target.value || undefined) as LinetypeId | undefined })}>
                <option value="">ByLayer</option>{LINETYPE_IDS.map((l) => <option key={l} value={l}>{LINETYPES[l].label}</option>)}
              </select>
            ))}
            {row('Lineweight', (
              <select aria-label="Lineweight of new objects" className={newProps.lw === undefined ? 'by' : undefined} value={newProps.lw ?? ''} onChange={(e) => onNewProps({ lw: e.target.value === '' ? undefined : Number(e.target.value) })}>
                <option value="">ByLayer</option>{LINEWEIGHTS.filter(Boolean).map((w) => <option key={w} value={w}>{w.toFixed(2)} mm</option>)}
              </select>
            ))}
          </> : <>
            {row('Colour', byLayer, 'New objects take their layer\'s colour, linetype and lineweight.')}
            {row('Linetype', byLayer)}
            {row('Lineweight', byLayer)}
          </>}
          {row('Print', <span className="cad-pp-by">{styleOf(styles, current).noPrint ? 'No' : 'Yes'} (layer)</span>)}
          {row('Text height', edit?.key === 'textMm' ? (
            <input autoFocus aria-label="Text height" className="r" value={edit.draft} onChange={(e) => setEdit({ key: 'textMm', draft: e.target.value })}
              onBlur={() => setEdit(null)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setEdit(null); }
                if (e.key !== 'Enter') return;
                e.preventDefault();
                const n = Number(edit.draft.replace(/\s*mm$/i, '').replace(',', '.'));
                if (n > 0) { onTextMm(n); setEdit(null); setNote(''); } else setNote('Text height: type a height in mm, e.g. 2.5.');
              }} />
          ) : <button type="button" className="cad-pp-val r" aria-label="Text height" onClick={() => setEdit({ key: 'textMm', draft: String(textMm) })}>{textMm} mm</button>, 'Paper height of new text, at the annotation scale.')}
          {devices > 0 && row('Devices', `${devices} picked`, 'Devices are edited in the panel below.')}
        </>) : <>
          {section('general', 'General', <>
            {row('Layer', (
              <select aria-label="Object layer" value={lay === 'varies' ? VARIES : lay.v} disabled={trays} title={trays ? 'Trays and cable routes stay on their own layers' : undefined} onChange={(e) => { if (e.target.value !== VARIES) general({ layer: e.target.value }, `Layer ${e.target.value}`); }}>
                {lay === 'varies' && <option value={VARIES} disabled>varies</option>}
                {[...new Set([...layers, ...(lay !== 'varies' ? [lay.v] : [])])].map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            ))}
            {row('Colour', <ColourPicker label="Object colour" value={shared('color') === 'varies' ? undefined : (shared('color') as { v?: string }).v} varies={shared('color') === 'varies'} onChange={(c) => general({ color: c }, 'Colour changed')} />)}
            {row('Linetype', (
              <select aria-label="Object linetype" className={lt !== 'varies' && !lt.v ? 'by' : undefined} value={lt === 'varies' ? VARIES : lt.v ?? ''} onChange={(e) => { if (e.target.value !== VARIES) general({ lt: (e.target.value || undefined) as LinetypeId | undefined }, 'Linetype changed'); }}>
                {lt === 'varies' && <option value={VARIES} disabled>varies</option>}
                <option value="">ByLayer</option>{LINETYPE_IDS.map((l) => <option key={l} value={l}>{LINETYPES[l].label}</option>)}
              </select>
            ))}
            {row('Lineweight', (
              <select aria-label="Object lineweight" className={lw !== 'varies' && lw.v === undefined ? 'by' : undefined} value={lw === 'varies' ? VARIES : lw.v ?? ''} onChange={(e) => { if (e.target.value !== VARIES) general({ lw: e.target.value === '' ? undefined : Number(e.target.value) }, 'Lineweight changed'); }}>
                {lw === 'varies' && <option value={VARIES} disabled>varies</option>}
                <option value="">ByLayer</option>{LINEWEIGHTS.filter(Boolean).map((w) => <option key={w} value={w}>{w.toFixed(2)} mm</option>)}
              </select>
            ))}
            {row('Print', prints(), 'Print is set per layer, in the layer palette (LM).')}
          </>)}
          {geom.length > 0 && section('geometry', 'Geometry', <>
            {one && (gk === 'pline' || gk === 'tray' || gk === 'cable') && row('Vertex', (
              <span className="cad-pp-vtx">
                <button type="button" aria-label="Previous vertex" disabled={vi === 0} onClick={() => { setEdit(null); setVtx(vi - 1); }}>◀</button>
                <span>{vi + 1} of {one.pts.length}</span>
                <button type="button" aria-label="Next vertex" disabled={vi >= one.pts.length - 1} onClick={() => { setEdit(null); setVtx(vi + 1); }}>▶</button>
              </span>
            ))}
            {geom.map(valueRow)}
          </>)}
          {text.length > 0 && section('text', 'Text', text.map(valueRow))}
          {!gk && sel.length > 0 && <div className="cad-pp-note m">Pick one kind above for its geometry.</div>}
        </>}
      </div>
      <div className="cad-lp-foot" role="status"><span>{note || 'Enter applies · Esc puts it back · Tab next'}</span></div>
    </section>
  );
}
const SELECTS = new Set(['width', 'service', 'closed', 'just']);
