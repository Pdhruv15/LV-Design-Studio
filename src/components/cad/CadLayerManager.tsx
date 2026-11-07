import { Modal } from '../ui';
import { drawnLayers, LAYER_COLOURS, LINETYPE_IDS, LINETYPES, LINEWEIGHTS, styleOf, type LayerStyle, type LinetypeId, type ObjectProps } from '../../model/cadLayerStyle';
import type { CadView } from '../../engines/cad/cadEngine';
import type { SketchItem } from '../../types';
import { RefLayers, type CadRefsState } from './CadRefs';

/** Design CAD → Layer manager: the app's drawn layers (on, locked, colour, linetype, lineweight) and the architect's
 * (on, a screen colour of its own). The printed sheets stay black-and-white. */
export function LayerManager({ view, layersOn, sketch, styles, onLayer, onStyle, onClose, refs }: {
  view: CadView;
  layersOn: Uint8Array;
  sketch: SketchItem[];
  styles: Record<string, LayerStyle>;
  onLayer: (i: number, on: boolean) => void;
  onStyle: (layer: string, patch: LayerStyle) => void;
  onClose: () => void;
  /** The plan's references: their layers as NAME|LAYER (on, print, screen colour). */
  refs?: CadRefsState;
}) {
  const colour = (name: string, value: string | undefined) => (
    <select aria-label={`${name} colour`} value={value ?? ''} onChange={(e) => onStyle(name, { color: e.target.value || undefined })}>
      {LAYER_COLOURS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
    </select>
  );
  const count = (name: string) => sketch.filter((it) => it.layer.toLowerCase() === name.toLowerCase()).length;
  return (
    <Modal onClose={onClose} className="modal" style={{ maxWidth: 860 }} label="Layer manager">
      <h3>Layer manager <span className="m">{view.file}</span></h3>
      <h4>Drawn in the app</h4>
      <table className="sched" aria-label="Drawn layers">
        <thead><tr><th>Layer</th><th>Objects</th><th>On</th><th>Lock</th><th>Print</th><th>Colour</th><th>Linetype</th><th>Lineweight</th></tr></thead>
        <tbody>{drawnLayers(sketch).map((name) => {
          const st = styleOf(styles, name);
          return (
            <tr key={name}>
              <td>{name}</td><td>{count(name)}</td>
              <td><input type="checkbox" aria-label={`${name} on`} checked={!st.hidden} onChange={(e) => onStyle(name, { hidden: !e.target.checked })} /></td>
              <td><input type="checkbox" aria-label={`${name} locked`} checked={!!st.lock} onChange={(e) => onStyle(name, { lock: e.target.checked })} /></td>
              <td><input type="checkbox" aria-label={`${name} prints`} checked={!st.noPrint} onChange={(e) => onStyle(name, { noPrint: !e.target.checked })} /></td>
              <td>{colour(name, st.color)}</td>
              <td><select aria-label={`${name} linetype`} value={st.lt ?? 'continuous'} onChange={(e) => onStyle(name, { lt: e.target.value === 'continuous' ? undefined : e.target.value as LinetypeId })}>
                {LINETYPE_IDS.map((l) => <option key={l} value={l}>{LINETYPES[l].label}</option>)}
              </select></td>
              <td><select aria-label={`${name} lineweight`} value={st.lw ?? 0} onChange={(e) => onStyle(name, { lw: Number(e.target.value) || undefined })}>
                {LINEWEIGHTS.map((w) => <option key={w} value={w}>{w ? `${w.toFixed(2)} mm` : 'Default'}</option>)}
              </select></td>
            </tr>
          );
        })}</tbody>
      </table>
      <h4>The architect's drawing</h4>
      <div style={{ maxHeight: 280, overflowY: 'auto' }}>
        <table className="sched" aria-label="Drawing layers">
          <thead><tr><th>Layer</th><th>Lines</th><th>On</th><th>Colour on screen</th></tr></thead>
          <tbody>{view.info.layers.map((l, i) => (
            <tr key={l.name}>
              <td>{l.name}</td><td>{l.count}</td>
              <td><input type="checkbox" aria-label={`${l.name} on`} checked={!!layersOn[i]} onChange={(e) => onLayer(i, e.target.checked)} /></td>
              <td>{colour(l.name, styleOf(styles, l.name).color)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {refs?.placed.map(({ ref }) => <RefLayers key={ref.name} r={ref} x={refs} />)}
      <p className="m">Locked layers can be seen and snapped to, but not picked or edited. Untick Print to keep a layer on screen but off the plan sheets. Colours are for the screen; sheets print black-and-white with the pens (Sheets → Plot).</p>
      <div className="modal-actions"><span className="sp" /><button className="chip primary" onClick={onClose}>Done</button></div>
    </Modal>
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
        <label>Colour<select aria-label="Object colour" value={one('color') ?? ''} onChange={(e) => onApply({ color: e.target.value || undefined })}>
          {LAYER_COLOURS.map((c) => <option key={c.id} value={c.id}>{c.id ? c.label : 'ByLayer'}</option>)}
        </select></label>
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
