import { REFLECTANCES } from '../../calc/lighting';
import { luminairesOf, roomLighting, roomLightingDefaults, type RoomLightingInput, type RoomLightingResult } from '../../calc/roomLighting';
import { circuitLabel } from '../../model/cadDevices';
import { m, m2 } from '../../model/cadMeasure';
import type { BuildingRoom, Feeder, Project } from '../../types';

/** Light room (LUX) settings: the luminaire and the room's values the engineer changed (blank = the room's default). */
export interface LuxSettings { lum: string; mf: string; uf: string; refl: string; replace: boolean; lux?: string; ceil?: string; wp?: string }
export const LUX_START: LuxSettings = { lum: '', mf: '0.8', uf: '', refl: '533', replace: true };

const num = (s: string | undefined, d: number) => (s !== undefined && s.trim() !== '' && Number.isFinite(Number(s)) ? Number(s) : d);

/** The lumen-method input for a room from its defaults and the settings, and the result. */
export function lightingOf(p: Project, room: BuildingRoom, s: LuxSettings): { input: RoomLightingInput; result: RoomLightingResult } {
  const d = roomLightingDefaults(p, room);
  const list = luminairesOf();
  const lum = list.find((x) => x.id === s.lum) ?? list[0];
  const input: RoomLightingInput = {
    ...d, targetLux: num(s.lux, d.targetLux), ceilingM: num(s.ceil, d.ceilingM), workPlaneM: num(s.wp, d.workPlaneM), reflectance: s.refl,
    mf: num(s.mf, d.mf), lumens: lum.lumens, watts: lum.watts, shrMax: lum.shrMax, ...(s.uf.trim() ? { uf: num(s.uf, NaN) } : {})
  };
  return { input, result: roomLighting(room.outline ?? [], input) };
}

/** Side panel of Light room: the room kept, its inputs, the result and Place. */
export default function RoomLightingPanel({ project, room, lit, settings, onSettings, circuits, feederId, onFeeder, onPlace, onCancel }: {
  project: Project;
  room?: BuildingRoom;
  lit?: { input: RoomLightingInput; result: RoomLightingResult };
  settings: LuxSettings;
  onSettings: (s: LuxSettings) => void;
  circuits: Feeder[];
  feederId: string;
  onFeeder: (id: string) => void;
  onPlace: () => void;
  onCancel: () => void;
}) {
  if (!room || !lit) return (<><h4>Light room</h4><div className="cad-devform"><span className="m">Point at a room to see its lights, click to keep them. The room needs an outline (Room area, Trace or Rooms).</span></div></>);
  const { input, result: r } = lit;
  const set = (k: keyof LuxSettings) => (e: { target: { value: string } }) => onSettings({ ...settings, [k]: e.target.value });
  const bad = !!r.invalid;
  const lumId = luminairesOf().find((x) => x.id === settings.lum)?.id ?? luminairesOf()[0].id;
  return (
    <>
      <h4>Light room <span className="m">{room.name} · {m2(r.areaM2)} · perimeter {m(r.perimeterM)}</span></h4>
      <div className="cad-devform">
        <label>Target lux (room type: {roomLightingDefaults(project, room).targetLux})<input aria-label="Target lux" type="number" value={settings.lux ?? String(input.targetLux)} onChange={set('lux')} /></label>
        <label>Ceiling (m)<input aria-label="Ceiling height" type="number" step="0.1" value={settings.ceil ?? String(input.ceilingM)} onChange={set('ceil')} /></label>
        <label>Working plane (m)<input aria-label="Working plane" type="number" step="0.05" value={settings.wp ?? String(input.workPlaneM)} onChange={set('wp')} /></label>
        <label>Reflectances<select aria-label="Reflectances" value={settings.refl} onChange={set('refl')}>{REFLECTANCES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select></label>
        <label>Luminaire (database: Luminaires)<select aria-label="Luminaire" value={lumId} onChange={set('lum')}>{luminairesOf().map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
        <label>Maintenance factor<input aria-label="Maintenance factor" type="number" step="0.05" value={settings.mf} onChange={set('mf')} /></label>
        <label>UF (blank = estimated)<input aria-label="Utilisation factor" type="text" placeholder="estimated" value={settings.uf} onChange={set('uf')} /></label>
        <label>Circuit<select aria-label="Circuit" value={feederId} onChange={(e) => onFeeder(e.target.value)}>
          <option value="">Choose a circuit…</option>
          {circuits.map((f) => <option key={f.id} value={f.id}>{circuitLabel(project, f)}</option>)}
        </select></label>
        <label className="m"><span><input type="checkbox" checked={settings.replace} onChange={(e) => onSettings({ ...settings, replace: e.target.checked })} /> Replace the lights already in this room</span></label>
      </div>
      {bad ? <div className="cad-devform"><span className="m">{r.invalid}</span></div> : (
        <dl className="cad-props" aria-label="Lighting result">
          <dt>Room index K</dt><dd>{r.k.toFixed(2)}</dd>
          <dt>UF{r.ufEstimated ? ' (est.)' : ''}</dt><dd>{r.uf.toFixed(2)}</dd>
          <dt>Needed</dt><dd>{r.required.toFixed(1)}</dd>
          <dt>Placed</dt><dd>{r.count}</dd>
          <dt>Achieved</dt><dd>{Math.round(r.achievedLux)} lx</dd>
          <dt>Spacing</dt><dd>{r.spacingXM.toFixed(2)} × {r.spacingYM.toFixed(2)} m</dd>
          <dt>SHR</dt><dd>{r.shr.toFixed(2)}{input.shrMax ? ` / ${input.shrMax}` : ''}</dd>
          <dt>Power</dt><dd>{r.totalW} W · {r.wPerM2.toFixed(1)} W/m²</dd>
        </dl>
      )}
      <div className="cad-devform">
        {!bad && (r.warnings.length ? r.warnings.map((w) => <span key={w} className="m">⚠ {w}</span>) : <span className="m">✓ Meets the target</span>)}
        <div className="cad-devbtns">
          <button className="chip primary" disabled={bad || !r.count || !feederId} title={feederId ? undefined : 'Choose the circuit first'} onClick={onPlace}>Place {r.count} light{r.count === 1 ? '' : 's'}</button>
          <button className="chip" onClick={onCancel}>Cancel</button>
        </div>
        <span className="m">Average illuminance only — DIALux / Relux for uniformity and glare</span>
      </div>
    </>
  );
}
