import { durationH, EMPHASIS_LABEL, signViewingM, TYPICAL_FITTING, type EmergencyFittingData, type EmergencyLayout, type EmphasisKind } from '../../calc/emergencyLighting';
import { circuitLabel } from '../../model/cadDevices';
import { m } from '../../model/cadMeasure';
import type { Feeder, Project } from '../../types';

/** Emergency (EM) settings: what a click adds, and the fitting's spacing table, sign and premises (typed values). */
export type EmMode = 'route' | 'open' | 'point';
export interface EmSettings { mode: EmMode; kind: EmphasisKind; rs: string; re: string; os: string; ow: string; signMm: string; lit: '200' | '100'; hours: '3' | '1' }
export const EM_START: EmSettings = {
  mode: 'route', kind: 'call-point', rs: String(TYPICAL_FITTING.routeSpacingM), re: String(TYPICAL_FITTING.routeEndM), os: String(TYPICAL_FITTING.openSpacingM), ow: String(TYPICAL_FITTING.openWallM),
  signMm: '150', lit: '200', hours: String(durationH(true)) as '3'
};
export const EM_PROMPT: Record<EmMode, string> = {
  route: 'EM  Escape route: click its points from the far end to the exit, Enter to finish:',
  open: 'EM  Open area: click inside a room (over 60 m², or one the route passes through); click again to take it off:',
  point: 'EM  Point of emphasis: choose what it is, then click where it is:'
};

const num = (s: string, d: number) => (s.trim() !== '' && Number.isFinite(Number(s)) ? Number(s) : d);
/** The fitting data and sign viewing distance from the settings. */
export function emFitting(s: EmSettings): { fitting: EmergencyFittingData; signViewM: number } {
  const t = TYPICAL_FITTING;
  return {
    fitting: { routeSpacingM: num(s.rs, t.routeSpacingM), routeEndM: num(s.re, t.routeEndM), openSpacingM: num(s.os, t.openSpacingM), openWallM: num(s.ow, t.openWallM), watts: t.watts },
    signViewM: signViewingM(num(s.signMm, 150), s.lit === '200')
  };
}
const typical = (s: EmSettings) => [s.rs, s.re, s.os, s.ow].join() === [EM_START.rs, EM_START.re, EM_START.os, EM_START.ow].join();

/** Side panel of Emergency: what to add, the fitting, the result and Place. */
export default function EmergencyPanel({ project, settings, onSettings, layout, routes, openRooms, circuits, feederId, onFeeder, onPlace, onCancel }: {
  project: Project;
  settings: EmSettings;
  onSettings: (s: EmSettings) => void;
  layout: EmergencyLayout;
  routes: number;
  openRooms: string[];
  circuits: Feeder[];
  feederId: string;
  onFeeder: (id: string) => void;
  onPlace: () => void;
  onCancel: () => void;
}) {
  const set = (k: keyof EmSettings) => (e: { target: { value: string } }) => onSettings({ ...settings, [k]: e.target.value });
  const { fitting, signViewM } = emFitting(settings);
  const n = (why: string) => layout.fittings.filter((f) => f.why === why).length;
  const total = layout.fittings.length, signs = layout.signs.length;
  const warnings = [...layout.warnings, ...(typical(settings) ? ['Spacings typical — enter the manufacturer\'s spacing table'] : [])];
  return (
    <>
      <h4>Emergency lighting <span className="m">BS 5266-1 / EN 1838</span></h4>
      <div className="cad-pal" role="group" aria-label="What to add">
        {(['route', 'open', 'point'] as const).map((md) => (
          <button key={md} aria-pressed={settings.mode === md} onClick={() => onSettings({ ...settings, mode: md })}>{{ route: 'Escape route', open: 'Open area', point: 'Point of emphasis' }[md]}</button>
        ))}
      </div>
      <div className="cad-devform">
        <label>Point to mark<select aria-label="Point to mark" value={settings.kind} onChange={set('kind')}>{(Object.keys(EMPHASIS_LABEL) as EmphasisKind[]).map((k) => <option key={k} value={k}>{EMPHASIS_LABEL[k]}</option>)}</select></label>
        <label>Route spacing / end (m, spacing table)<span className="cad-devbtns"><input aria-label="Route spacing" type="number" step="0.5" value={settings.rs} onChange={set('rs')} /><input aria-label="Route end distance" type="number" step="0.5" value={settings.re} onChange={set('re')} /></span></label>
        <label>Open spacing / wall (m)<span className="cad-devbtns"><input aria-label="Open area spacing" type="number" step="0.5" value={settings.os} onChange={set('os')} /><input aria-label="Open area wall distance" type="number" step="0.5" value={settings.ow} onChange={set('ow')} /></span></label>
        <label>Exit sign height (mm)<span className="cad-devbtns"><input aria-label="Exit sign height" type="number" step="25" value={settings.signMm} onChange={set('signMm')} /><select aria-label="Exit sign lighting" value={settings.lit} onChange={set('lit')}><option value="200">internally lit</option><option value="100">externally lit</option></select></span></label>
        <label>Premises<select aria-label="Premises" value={settings.hours} onChange={set('hours')}><option value="3">People sleep / reoccupied — 3 h</option><option value="1">Immediate evacuation, not reoccupied — 1 h</option></select></label>
        <label>Circuit<select aria-label="Circuit" value={feederId} onChange={(e) => onFeeder(e.target.value)}>
          <option value="">Choose a circuit (unswitched)…</option>
          {circuits.map((f) => <option key={f.id} value={f.id}>{circuitLabel(project, f)}</option>)}
        </select></label>
      </div>
      <dl className="cad-props" aria-label="Emergency lighting result">
        <dt>Escape routes</dt><dd>{routes} · {m(layout.lengthM)}</dd>
        <dt>Largest gap</dt><dd>{m(layout.maxGapM)} (≤ {fitting.routeSpacingM} m)</dd>
        <dt>At ends / exit</dt><dd>{n('end')}</dd>
        <dt>Changes of direction</dt><dd>{n('direction')}</dd>
        <dt>Points of emphasis</dt><dd>{n('emphasis')}</dd>
        <dt>To meet spacing</dt><dd>{n('spacing')}</dd>
        <dt>Open area</dt><dd>{n('open-area')}{openRooms.length ? ` (${openRooms.join(', ')})` : ''}</dd>
        <dt>Signs</dt><dd>{signs} · {signViewM.toFixed(0)} m view</dd>
        <dt>Duration</dt><dd>{settings.hours} h</dd>
        <dt>Load</dt><dd>{(total + signs) * fitting.watts} W</dd>
      </dl>
      <div className="cad-devform">
        {warnings.map((w) => <span key={w} className="m">⚠ {w}</span>)}
        <div className="cad-devbtns">
          <button className="chip primary" disabled={!total || !feederId} title={feederId ? undefined : 'Choose the circuit first'} onClick={onPlace}>Place {total} fitting{total === 1 ? '' : 's'} and {signs} sign{signs === 1 ? '' : 's'}</button>
          <button className="chip" onClick={onCancel}>Cancel</button>
        </div>
        <span className="m">Spacings are typical until you enter the manufacturer's table</span>
      </div>
    </>
  );
}
