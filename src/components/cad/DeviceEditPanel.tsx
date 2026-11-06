import { useState } from 'react';
import { circuitLabel, type PaletteItem, type PlacedItem } from '../../model/cadDevices';
import { m } from '../../model/cadMeasure';
import { circuitAfter, countBy, replacements, type DeviceEdit } from '../../model/deviceEdit';
import type { Feeder, Project } from '../../types';

/** Design CAD → Edit devices: the side panels of several devices picked, of Array on line (ARL) and of Match (MA). */

/** Array on line: the device, by number or spacing (typed), and where the first and last go. */
export interface ArlSettings { device: string; by: 'n' | 's'; value: string; ends: 'half' | 'on' }
export const ARL_START: ArlSettings = { device: 'ltg', by: 'n', value: '5', ends: 'half' };
/** Match: what the devices clicked take from the first one. */
export interface MatchSettings { circuit: boolean; type: boolean }
export const MATCH_START: MatchSettings = { circuit: true, type: false };

/** Several devices picked: what they are, then Arrange and Change; Move, Copy and Delete work on them all. */
export function SelectionPanel({ project, items, circuits, level, onEdit }: {
  project: Project;
  items: PlacedItem[];
  circuits: Feeder[];
  level?: string;
  onEdit: (e: DeviceEdit, arg?: string) => void;
}) {
  const [rep, setRep] = useState('');
  const [cir, setCir] = useState('');
  const options = replacements(project, items);
  const lv = items.some((it) => it.what === 'lv');
  const after = cir ? circuitAfter(project, items, cir) : undefined;
  const f = circuits.find((x) => x.id === cir);
  return (
    <>
      <div><b>{items.length} devices selected</b>{level && <span className="m"> · {level}</span>}</div>
      <dl className="cad-props" aria-label="Devices selected">
        <dt>Devices</dt><dd>{countBy(items, (it) => it.label)}</dd>
        {lv && <><dt>Circuits</dt><dd>{countBy(items.filter((it) => it.what === 'lv'), (it) => it.detail.split(' · ')[0])}</dd></>}
      </dl>
      <div className="cad-devbtns">
        <button className="chip" onClick={() => onEdit('row')}>Align in a row</button>
        <button className="chip" onClick={() => onEdit('column')}>Align in a column</button>
        <button className="chip" disabled={items.length < 3} onClick={() => onEdit('space')}>Space equally</button>
      </div>
      <div className="cad-devform">
        {options.length > 0 && (
          <label>Replace with<select aria-label="Replace with" value={rep} onChange={(e) => setRep(e.target.value)}>
            <option value="">— keep —</option>
            {options.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select></label>
        )}
        {lv && (
          <label>Circuit<select aria-label="Move to circuit" value={cir} onChange={(e) => setCir(e.target.value)}>
            <option value="">— keep —</option>
            {circuits.map((x) => <option key={x.id} value={x.id}>{circuitLabel(project, x)}</option>)}
          </select></label>
        )}
        {after && f && <span className="m">{after.over ? `⚠ ${circuitLabel(project, f).split(' · ')[0]} would have ${after.over.n} of this type, over the ${after.over.max} allowed (Rules)` : `${circuitLabel(project, f).split(' · ')[0]}: ${after.points} points after the change`}</span>}
        <div className="cad-devbtns">
          <button className="chip primary" disabled={!rep && !cir} onClick={() => { if (rep) onEdit('replace', rep); if (cir) onEdit('circuit', cir); setRep(''); setCir(''); }}>Apply</button>
          <button className="chip" onClick={() => onEdit('move')}>Move</button>
          <button className="chip" onClick={() => onEdit('copy')}>Copy</button>
          <button className="chip" onClick={() => onEdit('delete')}>Delete</button>
        </div>
      </div>
    </>
  );
}

/** Array on line: the line drawn, then the device, number or spacing, ends and circuit; the preview is on the plan. */
export function ArrayPanel({ project, settings, onSettings, palette, circuits, feederId, onFeeder, lengthM, at, onPlace, onCancel }: {
  project: Project;
  settings: ArlSettings;
  onSettings: (s: ArlSettings) => void;
  palette: PaletteItem[];
  circuits: Feeder[];
  feederId: string;
  onFeeder: (id: string) => void;
  /** The line's length (metres) once both ends are clicked. */
  lengthM?: number;
  /** The positions of the devices (metres) along it. */
  at: [number, number][];
  onPlace: () => void;
  onCancel: () => void;
}) {
  const set = (k: keyof ArlSettings) => (e: { target: { value: string } }) => onSettings({ ...settings, [k]: e.target.value });
  const item = palette.find((x) => x.id === settings.device);
  const lv = !!item && 'lv' in item.kind;
  const spacing = at.length > 1 ? Math.hypot(at[1][0] - at[0][0], at[1][1] - at[0][1]) : undefined;
  return (
    <>
      <h4>Array on line <span className="m">{lengthM !== undefined ? `line ${m(lengthM)}` : 'click the start and the end of the line'}</span></h4>
      <div className="cad-devform">
        <label>Device<select aria-label="Device along the line" value={settings.device} onChange={set('device')}>
          {palette.filter((x) => !('board' in x.kind)).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select></label>
        <label>By<select aria-label="By" value={settings.by} onChange={(e) => onSettings({ ...settings, by: e.target.value as ArlSettings['by'], value: e.target.value === 'n' ? '5' : '3' })}>
          <option value="n">Number</option><option value="s">Spacing</option>
        </select></label>
        <label>{settings.by === 'n' ? 'Number' : 'Spacing (m)'}<input aria-label={settings.by === 'n' ? 'Number' : 'Spacing'} type="number" step={settings.by === 'n' ? 1 : 0.1} min={settings.by === 'n' ? 1 : 0.1} value={settings.value} onChange={set('value')} /></label>
        <label>Ends<select aria-label="Ends" value={settings.ends} onChange={set('ends')}>
          <option value="half">Half a spacing from each end</option><option value="on">On the ends</option>
        </select></label>
        {lv && (
          <label>Circuit<select aria-label="Circuit" value={feederId} onChange={(e) => onFeeder(e.target.value)}>
            <option value="">Choose a circuit…</option>
            {circuits.map((f) => <option key={f.id} value={f.id}>{circuitLabel(project, f)}</option>)}
          </select></label>
        )}
      </div>
      {at.length > 0 && (
        <dl className="cad-props" aria-label="Array result">
          <dt>Devices</dt><dd>{at.length} × {item?.label}</dd>
          {spacing !== undefined && <><dt>Spacing</dt><dd>{m(spacing)}</dd></>}
        </dl>
      )}
      <div className="cad-devform">
        <div className="cad-devbtns">
          <button className="chip primary" disabled={!at.length || (lv && !feederId)} title={lv && !feederId ? 'Choose the circuit first' : undefined} onClick={onPlace}>Place {at.length || ''} {item?.label.toLowerCase()}{at.length === 1 ? '' : 's'}</button>
          <button className="chip" onClick={onCancel}>Cancel</button>
        </div>
        <span className="m">Also on the command line: ARL, then the two points; Enter places them</span>
      </div>
    </>
  );
}

/** Match: the device copied from, and what the devices clicked take from it. */
export function MatchPanel({ from, settings, onSettings }: { from?: PlacedItem; settings: MatchSettings; onSettings: (s: MatchSettings) => void }) {
  return (
    <>
      <h4>Match <span className="m">{from ? `from ${from.label}${from.detail ? ` · ${from.detail.split(' · ')[0]}` : ''}` : 'click the device to copy from'}</span></h4>
      <div className="cad-devform">
        <label><input type="checkbox" checked={settings.circuit} onChange={(e) => onSettings({ ...settings, circuit: e.target.checked })} /> Circuit (LV points)</label>
        <label><input type="checkbox" checked={settings.type} onChange={(e) => onSettings({ ...settings, type: e.target.checked })} /> Device type</label>
        <span className="m">{from ? 'Click each device to change; Esc stops.' : 'Then click each device to change; Esc stops.'}</span>
      </div>
    </>
  );
}
