import { circuitLabel, circuitWay, LV_PALETTE, type PaletteItem, type PointVariant } from '../../model/cadDevices';
import { areaOf, m, m2 } from '../../model/cadMeasure';
import { pointMax } from '../../model/circuitRoom';
import type { SocketLayout, SocketShare } from '../../model/roomSockets';
import type { BuildingRoom, Feeder, PointType, Project } from '../../types';

/** Socket room (SOCK) settings: the socket (a palette id), the spacing typed and whether the room's sockets are replaced. */
export interface SockSettings { socket: string; spacing: string; replace: boolean }
export const SOCK_START: SockSettings = { socket: 's13', spacing: '3', replace: true };

/** The sockets of the palette's Sockets group that are LV points. */
export const SOCKET_ITEMS: PaletteItem[] = LV_PALETTE.filter((x) => x.group === 'Sockets' && 'lv' in x.kind);

/** The palette item chosen, its point type and variant. */
export function socketItemOf(s: SockSettings): { item: PaletteItem; type: PointType; variant?: PointVariant } {
  const item = SOCKET_ITEMS.find((x) => x.id === s.socket) ?? SOCKET_ITEMS[0];
  return { item, type: (item.kind as { lv: PointType }).lv, ...(item.variant ? { variant: item.variant } : {}) };
}

/** Side panel of Socket room: the room kept, the socket, spacing and circuit, what the run comes to, and Place. */
export default function SocketRoomPanel({ project, room, layout, share, settings, onSettings, circuits, feederId, onFeeder, onPlace, onCancel }: {
  project: Project;
  room?: BuildingRoom;
  layout?: SocketLayout;
  share?: SocketShare;
  settings: SockSettings;
  onSettings: (s: SockSettings) => void;
  circuits: Feeder[];
  feederId: string;
  onFeeder: (id: string) => void;
  onPlace: () => void;
  onCancel: () => void;
}) {
  if (!room || !layout || !share) return (<><h4>Socket room</h4><div className="cad-devform"><span className="m">Point at a room to see its sockets, click to keep them. The room needs an outline (Room area, Trace or Rooms).</span></div></>);
  const { type } = socketItemOf(settings), max = pointMax(type);
  const n = layout.sockets.length - share.left.length, off = layout.all.length - layout.sockets.length;
  const s = (k: number) => (k === 1 ? '' : 's');
  const area = room.outline ? areaOf(room.outline).area : room.areaM2;
  return (
    <>
      <h4>Socket room <span className="m">{room.name} · {m2(area)} · walls {m(layout.wallsM)}</span></h4>
      <div className="cad-devform">
        <label>Socket<select aria-label="Socket" value={socketItemOf(settings).item.id} onChange={(e) => onSettings({ ...settings, socket: e.target.value })}>{SOCKET_ITEMS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
        <label>Spacing (m)<input aria-label="Spacing" type="number" step="0.1" value={settings.spacing} onChange={(e) => onSettings({ ...settings, spacing: e.target.value })} /></label>
        <label>Circuit<select aria-label="Circuit" value={feederId} onChange={(e) => onFeeder(e.target.value)}>
          <option value="">Choose a circuit…</option>
          {circuits.map((f) => <option key={f.id} value={f.id}>{circuitLabel(project, f)}</option>)}
        </select></label>
        <label className="m"><span><input type="checkbox" checked={settings.replace} onChange={(e) => onSettings({ ...settings, replace: e.target.checked })} /> Replace the sockets already in this room</span></label>
      </div>
      <dl className="cad-props" aria-label="Socket result">
        <dt>Walls used</dt><dd>{m(layout.usedM)} of {m(layout.wallsM)}</dd>
        <dt>Sockets</dt><dd>{layout.sockets.length}{off ? ` (${off} taken off)` : ''}</dd>
        <dt>Circuits</dt><dd>{share.rows.map((r) => <div key={r.feeder.id}>{circuitWay(r.feeder)} +{r.keys.length} → {r.after}{max !== undefined ? ` / ${max}` : ''}</div>)}</dd>
        {share.left.length > 0 && <><dt>No circuit</dt><dd>{share.left.length} socket{s(share.left.length)}: no circuit with room</dd></>}
      </dl>
      <div className="cad-devform">
        <div className="cad-devbtns">
          <button className="chip primary" disabled={!n || !feederId} title={feederId ? undefined : 'Choose the circuit first'} onClick={onPlace}>Place {n} socket{s(n)}</button>
          <button className="chip" onClick={onCancel}>Cancel</button>
        </div>
        <span className="m">Click a wall to leave it out, a socket to take it off. A wall at an angle takes the nearest right angle.</span>
      </div>
    </>
  );
}
