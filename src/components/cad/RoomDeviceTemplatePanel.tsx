import { circuitLabel } from '../../model/cadDevices';
import { m2 } from '../../model/cadMeasure';
import { ROOM_DEVICE_TEMPLATES, ROOM_TEMPLATE_LIMITS, type LvRoomTemplateProposal, type RoomDeviceTemplateKind, type RoomDeviceTemplateScope } from '../../model/roomDeviceTemplate';
import type { ElvRoomTemplateProposal } from '../elv/elvRoomTemplate';
import type { BuildingRoom, Feeder, Project } from '../../types';

export default function RoomDeviceTemplatePanel({ project, room, kind, onKind, scope, onScope, lv, elv, circuits, lightingFeederId, onLightingFeeder, powerFeederId, onPowerFeeder, replace, onReplace, onApprove, onCancel }: {
  project: Project;
  room?: BuildingRoom;
  kind: RoomDeviceTemplateKind;
  onKind: (kind: RoomDeviceTemplateKind) => void;
  scope: RoomDeviceTemplateScope;
  onScope: (scope: RoomDeviceTemplateScope) => void;
  lv?: LvRoomTemplateProposal;
  elv?: ElvRoomTemplateProposal;
  circuits: Feeder[];
  lightingFeederId: string;
  onLightingFeeder: (id: string) => void;
  powerFeederId: string;
  onPowerFeeder: (id: string) => void;
  replace: boolean;
  onReplace: (replace: boolean) => void;
  onApprove: () => void;
  onCancel: () => void;
}) {
  if (!room) return (<><h4>Room devices</h4><div className="cad-devform"><span className="m">Click one room to preview its coordinated LV and ELV device template. Nothing is saved until approval.</span></div></>);
  const lvOn = scope !== 'elv', elvOn = scope !== 'lv';
  const count = (lvOn ? (lv?.lights.length ?? 0) + (lv?.sockets.length ?? 0) : 0) + (elvOn ? (elv?.dataOutlets.length ?? 0) + (elv?.accessPoints.length ?? 0) + (elv?.smokeDetectors.length ?? 0) : 0);
  const limited = (lvOn && !!lv?.limited) || (elvOn && !!elv?.limited) || count > ROOM_TEMPLATE_LIMITS.total;
  const missingCircuit = lvOn && (!lightingFeederId || !powerFeederId);
  const warnings = [...(lvOn ? lv?.warnings ?? [] : []), ...(elvOn ? elv?.warnings ?? [] : [])];
  return (
    <>
      <h4>Room devices <span className="m">{room.name} · {m2(room.areaM2)}</span></h4>
      <div className="cad-devform">
        <label>Template<select aria-label="Room template" value={kind} onChange={(e) => onKind(e.target.value as RoomDeviceTemplateKind)}>
          {ROOM_DEVICE_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select></label>
        <label>Services<select aria-label="Template services" value={scope} onChange={(e) => onScope(e.target.value as RoomDeviceTemplateScope)}>
          <option value="both">LV + ELV</option><option value="lv">LV only</option><option value="elv">ELV only</option>
        </select></label>
        {lvOn && <label>Lighting circuit<select aria-label="Template lighting circuit" value={lightingFeederId} onChange={(e) => onLightingFeeder(e.target.value)}>
          <option value="">Choose a circuit…</option>{circuits.map((f) => <option key={f.id} value={f.id}>{circuitLabel(project, f)}</option>)}
        </select></label>}
        {lvOn && <label>Power circuit<select aria-label="Template power circuit" value={powerFeederId} onChange={(e) => onPowerFeeder(e.target.value)}>
          <option value="">Choose a circuit…</option>{circuits.map((f) => <option key={f.id} value={f.id}>{circuitLabel(project, f)}</option>)}
        </select></label>}
        <label className="m"><span><input type="checkbox" checked={replace} onChange={(e) => onReplace(e.target.checked)} /> Replace template-managed devices already in this room</span></label>
      </div>
      <dl className="cad-props" aria-label="Room device proposal">
        {lvOn && <><dt>Lights</dt><dd>{lv?.lights.length ?? 0}{lv ? ` · ${Math.round(lv.lighting.achievedLux)} lx` : ''}</dd><dt>Twin sockets</dt><dd>{lv?.sockets.length ?? 0}</dd></>}
        {elvOn && <><dt>Data outlets</dt><dd>{elv?.dataOutlets.length ?? 0}</dd><dt>Wi-Fi APs</dt><dd>{elv?.accessPoints.length ?? 0}</dd><dt>Smoke detectors</dt><dd>{elv?.smokeDetectors.length ?? 0}</dd></>}
        <dt>Preview total</dt><dd>{count} / {ROOM_TEMPLATE_LIMITS.total}</dd>
      </dl>
      <div className="cad-devform">
        {limited ? <span className="m">⚠ Preview limit reached. Divide the room or complete its layout manually.</span> : warnings.length ? warnings.map((w) => <span key={w} className="m">⚠ {w}</span>) : <span className="m">✓ Proposal is inside the room and within the bounded preview budget.</span>}
        <div className="cad-devbtns">
          <button className="chip primary" disabled={!count || limited || missingCircuit} title={missingCircuit ? 'Choose both LV circuits first' : limited ? 'The bounded preview cannot be approved' : undefined} onClick={onApprove}>Approve {count} device{count === 1 ? '' : 's'}</button>
          <button className="chip" onClick={onCancel}>Cancel</button>
        </div>
        <span className="m">Only this room is calculated. Preview points are session-only and discarded after approval or cancel.</span>
      </div>
    </>
  );
}
