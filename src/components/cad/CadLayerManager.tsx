import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { Check, Lightbulb, LightbulbOff, Lock, LockOpen, Plus, Printer, Snowflake, Sun, Trash2, X } from 'lucide-react';
import { drawnLayers, LINETYPE_IDS, LINETYPES, LINEWEIGHTS, styleOf, type LayerStyle, type LinetypeId, type ObjectProps } from '../../model/cadLayerStyle';
import { deleteRefusal, matchesFilter, renameRefusal, type LayerPatch, type LayerRef, type LayerSnap, type LayerStateSet } from '../../model/cadLayerState';
import { refLayerStyle } from '../../model/cadRefs';
import type { CadView } from '../../engines/cad/cadEngine';
import type { SketchItem } from '../../types';
import type { CadRefsState } from './CadRefs';
import { ColourPicker } from './ColourPicker';

/** Design CAD → Layer palette (LM), docked on the left of the drawing: one table of the app's drawn layers, the
 * architect's and each reference's, grouped in a tree, with icon toggles (current, on, freeze, lock, print, and in a
 * layout this viewport), colour, linetype and lineweight. The printed sheets stay black-and-white. */
/** In a layout: the viewport picked, and its layers frozen there only (src/model/planViewports.ts). */
export interface ViewportLayers { name: string; frozen: (layer: string) => boolean; toggle: (layer: string) => void }

/** A row of the palette: where the layer comes from and how it is set. */
export interface LayerRow extends LayerRef, LayerSnap { key: string; on: boolean; freeze: boolean; lock: boolean; print: boolean; lt?: LinetypeId; lw?: number; count: number }

/** The rows of a drawing: its drawn layers, the architect's, and the references' layers in use (NAME|LAYER). */
export function layerRows({ view, layersOn, sketch, styles, added = [], refs }: { view: CadView; layersOn: Uint8Array; sketch: SketchItem[]; styles: Record<string, LayerStyle>; added?: string[]; refs?: CadRefsState['placed'] }): LayerRow[] {
  const count = (name: string) => sketch.filter((it) => it.layer.toLowerCase() === name.toLowerCase()).length;
  const drawn = drawnLayers(sketch, added).map((name): LayerRow => {
    const st = styleOf(styles, name);
    return { key: `drawn:${name}`, name, group: 'drawn', on: !st.hidden, freeze: !!st.freeze, lock: !!st.lock, print: !st.noPrint, color: st.color, lt: st.lt, lw: st.lw, count: count(name) };
  });
  const arch = view.info.layers.map((l, i): LayerRow => {
    const st = styleOf(styles, l.name);
    return { key: `arch:${l.name}`, name: l.name, group: 'arch', on: !!layersOn[i], freeze: !!st.freeze, lock: !!st.lock, print: true, color: st.color, count: l.count };
  });
  const ref = (refs ?? []).flatMap(({ ref: r, g }) => {
    const counts = new Map<number, number>();
    for (const l of g.segLayers) counts.set(l, (counts.get(l) ?? 0) + 1);
    return g.layers.flatMap((l, i): LayerRow[] => {
      if (!counts.get(i)) return [];
      const st = refLayerStyle(r, l.name), name = `${r.name}|${l.name}`;
      return [{ key: `ref:${name}`, name, group: 'ref', ref: r.name, layer: l.name, on: !st.hidden, freeze: false, lock: false, print: !st.noPrint, color: st.color, count: counts.get(i)! }];
    });
  });
  return [...drawn, ...arch, ...ref];
}

const TIP = {
  cur: 'Current layer: new lines, polylines, rectangles, circles and arcs go on it (a tray, cable route, hatch or text keeps its own). Double-click to set.',
  on: 'On: shown and picked. Off hides a layer; it still counts for zoom extents.',
  freeze: 'Freeze: hidden, not picked, and left out of zoom extents and the plan sheets.',
  lock: 'Locked layers can be seen and snapped to, but not picked or edited.',
  colour: 'Colours are for the screen; sheets print black-and-white with the pens (Sheets → Plot).',
  print: 'Untick Print to keep a layer on screen but off the plan sheets.',
  count: 'Objects on the layer (lines for the architect\'s and references\' layers).'
};

type Tree = 'all' | 'used' | 'drawn' | 'arch' | `ref:${string}`;

/** Closes a pop-up when the mouse goes down outside it. */
function useAway(open: boolean, close: () => void) {
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) close(); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open, close]);
  return box;
}

/** A small list under a cell (linetype, lineweight). */
function CellList<T extends string | number>({ label, value, options, onPick }: { label: string; value: T; options: { value: T; label: string }[]; onPick: (v: T) => void }) {
  const [open, setOpen] = useState(false);
  const box = useAway(open, () => setOpen(false));
  return (
    <span className="cad-lp-dd" ref={box}>
      <button type="button" className="cad-lp-cell" aria-label={label} aria-expanded={open} onClick={() => setOpen(!open)}>{options.find((o) => o.value === value)?.label ?? String(value)}</button>
      {open && (
        <div className="cad-lp-pop" role="listbox" aria-label={`${label} list`} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } }}>
          {options.map((o) => <button key={String(o.value)} type="button" role="option" aria-selected={o.value === value} onClick={() => { setOpen(false); onPick(o.value); }}>{o.label}</button>)}
        </div>
      )}
    </span>
  );
}

const LT_OPTIONS = LINETYPE_IDS.map((l) => ({ value: l, label: LINETYPES[l].label }));
const LW_OPTIONS = LINEWEIGHTS.map((w) => ({ value: w, label: w ? w.toFixed(2) : 'Default' }));

export function LayerPalette({ file, rows, current, states, isolated, viewport, onApply, onNew, onRename, onDelete, onCurrent, onIsolate, onUnisolate, onSaveState, onRestoreState, onDeleteState, onClose }: {
  file: string;
  rows: LayerRow[];
  current: string;
  states: LayerStateSet[];
  /** Isolate has turned layers off (Unisolate puts them back). */
  isolated: boolean;
  viewport?: ViewportLayers;
  onApply: (rows: LayerRow[], patch: LayerPatch) => void;
  /** Adds an empty drawn layer; its name. */
  onNew: () => string;
  /** Renames a drawn layer; why not, if it could not. */
  onRename: (from: string, to: string) => string | undefined;
  onDelete: (rows: LayerRow[]) => void;
  onCurrent: (name: string) => void;
  onIsolate: (rows: LayerRow[]) => void;
  onUnisolate: () => void;
  onSaveState: (name: string) => void;
  onRestoreState: (name: string) => void;
  onDeleteState: (name: string) => void;
  onClose: () => void;
}) {
  const [sel, setSel] = useState<string[]>([]);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [tree, setTree] = useState<Tree>('all');
  const [filter, setFilter] = useState('');
  const [edit, setEdit] = useState<{ key: string; name: string; value: string } | null>(null);
  const [note, setNote] = useState('');
  const [statesOpen, setStatesOpen] = useState(false);
  const [stateName, setStateName] = useState('');
  const statesBox = useAway(statesOpen, () => setStatesOpen(false));

  const isCurrent = (r: LayerRow) => r.group === 'drawn' && r.name.toLowerCase() === current.toLowerCase();
  const inTree = (r: LayerRow) => tree === 'all' ? true : tree === 'used' ? r.count > 0 || isCurrent(r) : tree.startsWith('ref:') ? r.group === 'ref' && r.ref === tree.slice(4) : r.group === tree;
  const shown = rows.filter((r) => inTree(r) && matchesFilter(r.name, filter));
  const picked = rows.filter((r) => sel.includes(r.key));
  const refNames = [...new Set(rows.filter((r) => r.group === 'ref').map((r) => r.ref!))];
  const pick = (key: string) => { setSel([key]); setAnchor(key); };

  /** A change on a row goes to all the rows selected when it is one of them, else to it alone (now selected). */
  const apply = (r: LayerRow, patch: LayerPatch) => {
    let list = sel.includes(r.key) ? picked : [r];
    if (!sel.includes(r.key)) pick(r.key);
    setNote('');
    if (patch.freeze) {
      const cur = list.find(isCurrent);
      if (cur) { setNote(`${cur.name} is the current layer; it cannot be frozen.`); list = list.filter((x) => x !== cur); }
    }
    if (list.length) onApply(list, patch);
  };
  const choose = (r: LayerRow, e: ReactMouseEvent) => {
    if (e.shiftKey && anchor) {
      const keys = shown.map((x) => x.key), a = keys.indexOf(anchor), b = keys.indexOf(r.key);
      if (a >= 0 && b >= 0) { setSel(keys.slice(Math.min(a, b), Math.max(a, b) + 1)); return; }
    }
    if (e.metaKey || e.ctrlKey) { setSel(sel.includes(r.key) ? sel.filter((k) => k !== r.key) : [...sel, r.key]); setAnchor(r.key); return; }
    pick(r.key);
  };
  const startRename = (r: LayerRow | undefined) => {
    if (!r) return;
    const why = renameRefusal(r);
    if (why) { setNote(why); return; }
    setNote(''); setEdit({ key: r.key, name: r.name, value: r.name });
  };
  const commitRename = () => {
    if (!edit) return;
    const to = edit.value.trim();
    if (to === edit.name) { setEdit(null); return; }
    const err = onRename(edit.name, to);
    if (err) { setNote(err); return; }
    pick(`drawn:${to}`); setEdit(null); setNote('');
  };
  const del = (list: LayerRow[]) => {
    if (!list.length) { setNote('Select the layers to delete first.'); return; }
    const why = list.map((r) => deleteRefusal(r, r.count, current)).find(Boolean);
    if (why) { setNote(why); return; }
    onDelete(list); setSel([]); setNote(`${list.length === 1 ? list[0].name : `${list.length} layers`} deleted.`);
  };
  const setCurrent = (r: LayerRow | undefined) => {
    if (!r) { setNote('Select a layer first.'); return; }
    if (r.group !== 'drawn') { setNote(`${r.name} is ${r.group === 'arch' ? 'the architect\'s' : 'a reference\'s'}: new objects go on the app's drawn layers.`); return; }
    if (r.freeze) { setNote(`${r.name} is frozen; thaw it to make it current.`); return; }
    setNote(''); onCurrent(r.name);
  };
  const keys = (e: ReactKeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === 'F2') { e.preventDefault(); e.stopPropagation(); startRename(picked[0]); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); e.stopPropagation(); del(picked); }
  };

  const icon = (r: LayerRow, label: string, on: boolean, a: ReactNode, b: ReactNode, patch: LayerPatch, cls = '') => (
    <button type="button" className={`cad-lp-ic${on ? ' on' : ''}${cls}`} aria-label={`${r.name} ${label}`} aria-pressed={on} onClick={() => apply(r, patch)}>{on ? a : b}</button>
  );
  const none = <span className="cad-lp-na">—</span>;
  const cols = 10 + (viewport ? 1 : 0);
  const head = (label: string, title: string, cls?: string) => <th className={cls} title={title}>{label}</th>;
  const groupRows = (g: LayerRow[], title: string) => g.length ? [
    <tr key={`g:${title}`} className="cad-lp-grp"><td colSpan={cols}>{title}</td></tr>,
    ...g.map((r) => (
      <tr key={r.key} className={sel.includes(r.key) ? 'sel' : undefined} aria-selected={sel.includes(r.key)}>
        <td className="c" title={TIP.cur} onDoubleClick={() => setCurrent(r)}>{isCurrent(r) ? <Check size={12} className="cad-lp-cur" aria-label={`${r.name} is current`} /> : null}</td>
        <td className="cad-lp-name" onClick={(e) => choose(r, e)} onDoubleClick={() => startRename(r)}>
          {edit?.key === r.key ? (
            <input autoFocus aria-label="Layer name" value={edit.value} onChange={(e) => setEdit({ ...edit, value: e.target.value })} onBlur={commitRename}
              onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); commitRename(); } else if (e.key === 'Escape') { e.preventDefault(); setEdit(null); setNote(''); } }} />
          ) : r.name}
        </td>
        <td className="c">{icon(r, 'on', r.on, <Lightbulb size={12} />, <LightbulbOff size={12} />, { on: !r.on }, ' bulb')}</td>
        <td className="c">{r.group === 'ref' ? none : icon(r, 'frozen', r.freeze, <Snowflake size={12} />, <Sun size={12} />, { freeze: !r.freeze })}</td>
        <td className="c">{r.group === 'ref' ? none : icon(r, 'locked', r.lock, <Lock size={12} />, <LockOpen size={12} />, { lock: !r.lock })}</td>
        <td><ColourPicker label={`${r.name} colour`} value={r.color} blank={r.group === 'drawn' ? 'ByLayer' : 'As drawn'} onChange={(c) => apply(r, { color: c })} /></td>
        <td>{r.group === 'drawn' ? <CellList label={`${r.name} linetype`} value={r.lt ?? 'continuous'} options={LT_OPTIONS} onPick={(v) => apply(r, { lt: v === 'continuous' ? undefined : v })} /> : none}</td>
        <td>{r.group === 'drawn' ? <CellList label={`${r.name} lineweight`} value={r.lw ?? 0} options={LW_OPTIONS} onPick={(v) => apply(r, { lw: v || undefined })} /> : none}</td>
        <td className="c">{r.group === 'arch' ? none : icon(r, 'prints', r.print, <Printer size={12} />, <Printer size={12} />, { print: !r.print })}</td>
        {viewport && <td className="c">{r.group === 'arch' ? none : (() => {
          const fz = viewport.frozen(r.name);
          return <button type="button" className={`cad-lp-ic${fz ? ' on' : ''}`} aria-label={`${r.name} in this viewport`} aria-pressed={!fz} onClick={() => viewport.toggle(r.name)}>{fz ? <Snowflake size={12} /> : <Sun size={12} />}</button>;
        })()}</td>}
        <td className="num">{r.count.toLocaleString('en-GB')}</td>
      </tr>
    ))
  ] : [];
  const treeItem = (t: Tree, label: string, depth = 0) => (
    <button key={t} type="button" className={tree === t ? 'on' : undefined} style={{ paddingLeft: 6 + depth * 12 }} aria-pressed={tree === t} onClick={() => setTree(t)}>{label}</button>
  );
  const newLayer = () => { const name = onNew(); pick(`drawn:${name}`); setEdit({ key: `drawn:${name}`, name, value: name }); setNote(''); };
  const saveState = () => { const n = stateName.trim(); if (!n) return; onSaveState(n); setStateName(''); setStatesOpen(false); setNote(`Layer state ${n} saved.`); };
  return (
    <section className="cad-lpal" aria-label="Layer palette" tabIndex={-1} onKeyDown={keys}>
      <div className="cad-lp-head">Layers — {file}{viewport ? ` · ${viewport.name}` : ''}<span className="sp" /><button type="button" aria-label="Close the layer palette" title="Close (LM)" onClick={onClose}><X size={13} /></button></div>
      <div className="cad-lp-tb">
        <button type="button" className="cad-lp-btn" title="New layer" aria-label="New layer" onClick={newLayer}><Plus size={14} /></button>
        <button type="button" className="cad-lp-btn" title="Delete layer (empty only)" aria-label="Delete layer" onClick={() => del(picked)}><Trash2 size={14} /></button>
        <button type="button" className="cad-lp-btn" title="Set current (CLAYER)" aria-label="Set current" onClick={() => setCurrent(picked[0])}><Check size={14} /></button>
        <span className="cad-lp-sep" />
        <button type="button" className="cad-lp-btn" title="Isolate (LAYISO): the other layers turn off" onClick={() => { if (!picked.length) setNote('Select the layers to keep on first.'); else { setNote(''); onIsolate(picked); } }}>Iso</button>
        <button type="button" className="cad-lp-btn" title="Unisolate (LAYUNISO)" disabled={!isolated} onClick={onUnisolate}>Uniso</button>
        <span className="cad-lp-sep" />
        <span className="cad-lp-dd" ref={statesBox}>
          <button type="button" className="cad-lp-btn" title="Layer states: save On, Freeze, Lock and colour under a name; restore them later" aria-expanded={statesOpen} onClick={() => setStatesOpen(!statesOpen)}>Layer states ▾</button>
          {statesOpen && (
            <div className="cad-lp-pop cad-lp-states" role="dialog" aria-label="Layer states" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setStatesOpen(false); } }}>
              {states.map((s) => (
                <div key={s.name} className="cad-lp-state">
                  <button type="button" title={`Restore ${s.name}`} onClick={() => { setStatesOpen(false); onRestoreState(s.name); setNote(`Layer state ${s.name} restored.`); }}>{s.name}</button>
                  <button type="button" aria-label={`Delete layer state ${s.name}`} onClick={() => onDeleteState(s.name)}><X size={11} /></button>
                </div>
              ))}
              {!states.length && <div className="m">No layer states saved.</div>}
              <form onSubmit={(e) => { e.preventDefault(); saveState(); }}>
                <input aria-label="New layer state name" placeholder="Save as…" value={stateName} onChange={(e) => setStateName(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
                <button type="submit" className="cad-lp-btn" disabled={!stateName.trim()}>Save</button>
              </form>
            </div>
          )}
        </span>
        <input className="cad-lp-filter" aria-label="Filter layers" placeholder="Filter layers…" title="Part of a name, or a pattern with * and ?" value={filter} onChange={(e) => setFilter(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      </div>
      <div className="cad-lp-body">
        <div className="cad-lp-tree" role="group" aria-label="Layer filters">
          {treeItem('all', 'All')}
          {treeItem('used', 'In use')}
          {treeItem('drawn', 'Drawn in the app', 1)}
          {treeItem('arch', 'Architect\'s', 1)}
          {refNames.map((n) => treeItem(`ref:${n}`, `Ref: ${n}`, 1))}
          {filter.trim() && <div className="cad-lp-tf">Filter: {filter.trim()}</div>}
        </div>
        <div className="cad-lp-grid">
          <table aria-label="Layers">
            <colgroup><col style={{ width: 18 }} /><col /><col style={{ width: 22 }} /><col style={{ width: 22 }} /><col style={{ width: 22 }} /><col style={{ width: 78 }} /><col style={{ width: 62 }} /><col style={{ width: 48 }} /><col style={{ width: 22 }} />{viewport && <col style={{ width: 24 }} />}<col style={{ width: 40 }} /></colgroup>
            <thead><tr>
              {head('', TIP.cur)}<th>Name</th>{head('On', TIP.on)}{head('Fr', TIP.freeze)}{head('Lk', TIP.lock)}{head('Colour', TIP.colour)}<th>Linetype</th><th>Weight</th>{head('Pr', TIP.print)}
              {viewport && head('VP', `Frozen in ${viewport.name} only (it still shows in the model and in other viewports).`)}{head('#', TIP.count, 'num')}
            </tr></thead>
            <tbody>
              {groupRows(shown.filter((r) => r.group === 'drawn'), 'Drawn in the app')}
              {groupRows(shown.filter((r) => r.group === 'arch'), 'Architect\'s drawing')}
              {refNames.flatMap((n) => groupRows(shown.filter((r) => r.group === 'ref' && r.ref === n), `Reference ${n}`))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="cad-lp-foot" role="status">
        <span>Current layer: {current} · {rows.length} layers{shown.length !== rows.length ? ` · ${shown.length} shown by filter` : ''}{picked.length > 1 ? ` · ${picked.length} selected` : ''}</span>
        {note && <span className="cad-lp-note">{note}</span>}
      </div>
    </section>
  );
}

/** Properties of the drawn objects picked: layer, colour, linetype and lineweight (ByLayer when blank). */
export function ObjectPropertiesPanel({ items, layers, onApply }: { items: SketchItem[]; layers: string[]; onApply: (patch: ObjectProps & { layer?: string }) => void }) {
  const one = <K extends 'layer' | 'color' | 'lt' | 'lw'>(k: K) => { const v = new Set(items.map((it) => it[k])); return v.size === 1 ? [...v][0] : undefined; };
  const trays = items.some((it) => it.tray || it.cable);
  return (
    <>
      <h4>Properties <span className="m">{items.length} object{items.length === 1 ? '' : 's'}</span></h4>
      <div className="cad-devform">
        <label>Layer<select aria-label="Object layer" value={one('layer') ?? ''} disabled={trays} title={trays ? 'Trays and cable routes stay on their own layers' : undefined} onChange={(e) => e.target.value && onApply({ layer: e.target.value })}>
          {one('layer') === undefined && <option value="">(several)</option>}
          {layers.map((l) => <option key={l} value={l}>{l}</option>)}
        </select></label>
        <label>Colour<ColourPicker label="Object colour" value={one('color')} varies={new Set(items.map((it) => it.color ?? '')).size > 1} onChange={(c) => onApply({ color: c })} /></label>
        <label>Linetype<select aria-label="Object linetype" value={one('lt') ?? ''} onChange={(e) => onApply({ lt: (e.target.value || undefined) as LinetypeId | undefined })}>
          <option value="">ByLayer</option>{LINETYPE_IDS.map((l) => <option key={l} value={l}>{LINETYPES[l].label}</option>)}
        </select></label>
        <label>Lineweight<select aria-label="Object lineweight" value={one('lw') ?? ''} onChange={(e) => onApply({ lw: e.target.value === '' ? undefined : Number(e.target.value) })}>
          <option value="">ByLayer</option>{LINEWEIGHTS.filter(Boolean).map((w) => <option key={w} value={w}>{w.toFixed(2)} mm</option>)}
        </select></label>
        <span className="m">Match properties (MP) copies these from one object to others.</span>
      </div>
    </>
  );
}
