import { buildingInfoOf } from '../../calc/building';
import { levelCoverage, reachM, type RoomCoverage } from '../../elv/coverage';
import { coverageSystems, deviceLabel, SYSTEM_LABEL } from './elvLabels';
import type { ElvSystem } from '../../elv/defaults';
import { cameraRangeM, devicesOf, ELV_DEVICES, type ElvDeviceType } from '../../elv/devices';
import { copyDevices, devicesOn, fillPoints, moveDevice, placeDevices, removeDevices, roomAt, type ElvDevice } from '../../elv/placed';
import type { Project } from '../../types';
import type { PlanCells, PlanCover, PlanSymbol } from './elvOverlay';

type Pt = [number, number];
/** A level, as Design CAD names it. */
export interface PlanLevel { building: string; level: string }

/** ELV design on the plans in Design CAD: what the ELV layer draws, and what its tools do. Devices are kept in metres on
 * the plan; the canvas works in drawing units, so everything here takes the plan's metres per unit (`mpu`). */

export { canFill, deviceLabel, devicesFor, SYSTEM_LABEL, SYSTEMS } from './elvLabels';
/** The coverage a device is placed by, for the readout: " · 7.5 m radius", a speaker spacing, a camera's ranges. */
export function coverageNote(t: ElvDeviceType): string {
  const c = ELV_DEVICES[t].coverage;
  if (c?.kind === 'radius') return ` · ${c.m} m radius`;
  if (c?.kind === 'spacing') return ` · at most ${c.m} m apart`;
  if (c?.kind === 'travel') return ` · within ${c.m} m travel of everyone`;
  if (c?.kind === 'cone') return ` · ${c.fovDeg}°: identify ${cameraRangeM(c.fovDeg, c.pixelsH, 'identify').toFixed(1)} m, recognise ${cameraRangeM(c.fovDeg, c.pixelsH, 'recognise').toFixed(1)} m, observe ${cameraRangeM(c.fovDeg, c.pixelsH, 'observe').toFixed(1)} m`;
  return '';
}

const units = (p: Pt, mpu: number): Pt => [p[0] / mpu, p[1] / mpu];
const symbolOf = (t: ElvDeviceType, at: Pt, extra: Partial<PlanSymbol> = {}): PlanSymbol => {
  const s = ELV_DEVICES[t].symbol;
  return { at, shape: s.shape, text: s.text, ...(s.filled ? { filled: true } : {}), ...extra };
};

export interface ElvLayer { symbols: PlanSymbol[]; covers: PlanCover[]; gaps?: PlanCells; coverage: RoomCoverage[] }

/** Coverage per project version, level and system: the page redraws on every pointer move, the check runs once. */
const coverageCache = new WeakMap<Project, Map<string, RoomCoverage[]>>();
function coverageOf(p: Project, lv: PlanLevel, system: ElvSystem): RoomCoverage[] {
  let byKey = coverageCache.get(p);
  if (!byKey) coverageCache.set(p, (byKey = new Map()));
  const key = `${lv.building}\0${lv.level}\0${system}`;
  let c = byKey.get(key);
  if (!c) byKey.set(key, (c = levelCoverage(p, lv.building, lv.level, system)));
  return c;
}

/** The most devices one Fill room run places over several rooms. */
export const FILL_MAX = 400;

/** The ELV layer of a level: every device (other systems dimmed), the chosen system's coverage and uncovered squares,
 * and the Fill room preview for the room under the pointer. A device being dragged (`held`, metres) is drawn where it
 * is held; the uncovered squares follow when it is dropped. */
export function elvLayer(p: Project, lv: PlanLevel, mpu: number, o: { system: ElvSystem; coverage: boolean; selected: string | null; preview?: { type: ElvDeviceType; at: Pt; rooms?: Pt[][] }; held?: { id: string; at: Pt } }): ElvLayer {
  const rooms = new Map(buildingInfoOf(p).rooms.map((r) => [r.id, r]));
  const list = devicesOn(p, lv.building, lv.level).map((d) => (d.id === o.held?.id ? { ...d, x: o.held.at[0], y: o.held.at[1] } : d));
  const symbols = list.map((d) => symbolOf(d.type, units([d.x, d.y], mpu), {
    dim: ELV_DEVICES[d.type].system !== o.system, selected: d.id === o.selected, ...(d.rotationDeg !== undefined ? { rotationDeg: d.rotationDeg } : {})
  }));
  const covers: PlanCover[] = [];
  const coverage = coverageOf(p, lv, o.system);
  let gaps: PlanCells | undefined;
  if (o.coverage) {
    for (const d of list) {
      if (ELV_DEVICES[d.type].system !== o.system) continue;
      const room = d.roomId ? rooms.get(d.roomId) : undefined;
      const clip = room?.outline && d.type !== 'access-point' ? room.outline.map((q) => units(q, mpu)) : undefined;
      const c = ELV_DEVICES[d.type].coverage;
      if (c?.kind === 'cone') {
        const bands = (['identify', 'recognise', 'observe'] as const).map((k) => cameraRangeM(c.fovDeg, c.pixelsH, k) / mpu);
        covers.push({ at: units([d.x, d.y], mpu), r: bands[2], ...(clip ? { clip } : {}), cone: { fovDeg: c.fovDeg, rotationDeg: d.rotationDeg ?? 0, bands } });
      } else if (reachM(d.type) > 0) covers.push({ at: units([d.x, d.y], mpu), r: reachM(d.type) / mpu, ...(clip ? { clip } : {}) });
    }
    const cells = coverage.flatMap((c) => c.gaps.map((g) => units(g, mpu)));
    const step = Math.max(0, ...coverage.map((c) => c.step));
    if (cells.length) gaps = { size: step / mpu, at: cells };
  }
  if (o.preview?.rooms) {
    let n = 0;
    for (const outline of o.preview.rooms) {
      if (n >= FILL_MAX) break;
      for (const d of fillPoints(outline, o.preview.type, FILL_MAX - n)) { symbols.push(symbolOf(d.type, units([d.x, d.y], mpu), { ghost: true })); n++; }
    }
  } else if (o.preview) {
    const room = roomAt(p, lv.building, lv.level, o.preview.at[0], o.preview.at[1]);
    if (room?.outline) for (const d of fillPoints(room.outline, o.preview.type)) symbols.push(symbolOf(d.type, units([d.x, d.y], mpu), { ghost: true }));
  }
  return { symbols, covers, ...(gaps ? { gaps } : {}), coverage };
}

/** The device of the chosen system nearest the point, within `within` metres. */
export function deviceNear(p: Project, lv: PlanLevel, system: ElvSystem, at: Pt, within: number): ElvDevice | undefined {
  let best: { d: ElvDevice; dist: number } | undefined;
  for (const d of devicesOn(p, lv.building, lv.level)) {
    if (ELV_DEVICES[d.type].system !== system) continue;
    const dist = Math.hypot(d.x - at[0], d.y - at[1]);
    if (dist <= within && (!best || dist < best.dist)) best = { d, dist };
  }
  return best?.d;
}

const roomName = (p: Project, id?: string) => (id ? buildingInfoOf(p).rooms.find((r) => r.id === id)?.name : undefined);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Place: one device at the point, in the room under it. Cameras and speakers face +x until rotated. */
export function placeAt(p: Project, lv: PlanLevel, type: ElvDeviceType, at: Pt): { next: Project; id: string; message: string } {
  const { project, ids } = placeDevices(p, lv.building, lv.level, [{ type, x: r2(at[0]), y: r2(at[1]) }]);
  const d = project.elvDevices!.find((x) => x.id === ids[0])!;
  const room = roomName(project, d.roomId);
  return { next: project, id: d.id, message: `${deviceLabel(type)} ${d.id} added${room ? ` to ${room}` : ' outside every room outline'} · ⌘Z to undo` };
}

/** Fill room: a grid of the device in the room under the point. */
export function fillAt(p: Project, lv: PlanLevel, type: ElvDeviceType, at: Pt): { next?: Project; message: string } {
  const room = roomAt(p, lv.building, lv.level, at[0], at[1]);
  if (!room) return { message: 'No room with an outline there. Add the room from the plan first (Design CAD → Rooms).' };
  const items = fillPoints(room.outline!, type);
  if (!items.length) return { message: `${deviceLabel(type)} has no coverage spacing to fill by: place it one by one.` };
  const { project } = placeDevices(p, lv.building, lv.level, items);
  return { next: project, message: `${room.name}: ${plural(items.length, deviceLabel(type).toLowerCase())} placed · ⌘Z to undo` };
}

/** Fill room over several rooms: a grid of the device in each, in the order given; a room that would take the run
 * over FILL_MAX is left out (`left` counts them). One project change. */
export function fillRooms(p: Project, lv: PlanLevel, type: ElvDeviceType, rooms: { name: string; outline: Pt[] }[]): { next?: Project; message: string; placed: number; left: number } {
  const items: ReturnType<typeof fillPoints> = [];
  let count = 0, left = 0;
  for (const room of rooms) {
    const grid = fillPoints(room.outline, type);
    if (!grid.length) continue;
    if (items.length + grid.length > FILL_MAX) { left++; continue; }
    items.push(...grid);
    count++;
  }
  if (!items.length) return { message: `${deviceLabel(type)} has no coverage spacing to fill by: place it one by one.`, placed: 0, left };
  const { project } = placeDevices(p, lv.building, lv.level, items);
  return { next: project, placed: items.length, left, message: `${plural(count, 'room')}: ${plural(items.length, deviceLabel(type).toLowerCase())} placed${left ? ` — ${plural(left, 'room')} left out: ${FILL_MAX} devices a run` : ''} · ⌘Z to undo` };
}

export function moveTo(p: Project, id: string, at: Pt): { next: Project; message: string } {
  const next = moveDevice(p, id, r2(at[0]), r2(at[1]));
  const d = next.elvDevices!.find((x) => x.id === id)!;
  const room = roomName(next, d.roomId);
  return { next, message: `${deviceLabel(d.type)} ${id} moved${room ? ` to ${room}` : ' outside every room outline'} · ⌘Z to undo` };
}

export function rotate(p: Project, id: string, deg: number): { next: Project; message: string } {
  const d = (p.elvDevices ?? []).find((x) => x.id === id)!;
  const a = ((Math.round(deg) % 360) + 360) % 360;
  return { next: moveDevice(p, id, d.x, d.y, a), message: `${deviceLabel(d.type)} ${id} faces ${a}° · ⌘Z to undo` };
}

export function remove(p: Project, id: string): { next: Project; message: string } {
  const d = (p.elvDevices ?? []).find((x) => x.id === id)!;
  return { next: removeDevices(p, [id]), message: `${deviceLabel(d.type)} ${id} deleted · ⌘Z to undo` };
}

/** Copy to levels: how many devices of each system the level holds (every system, in the order of SYSTEM_LABEL). */
export function systemCounts(p: Project, lv: PlanLevel): { system: ElvSystem; label: string; n: number }[] {
  const here = devicesOn(p, lv.building, lv.level);
  return (Object.keys(SYSTEM_LABEL) as ElvSystem[]).map((system) => ({ system, label: SYSTEM_LABEL[system], n: here.filter((d) => ELV_DEVICES[d.type].system === system).length }));
}

/** Copy to levels: this level's devices of the systems chosen to another level at the same plan positions; `replace` first takes off that level's devices of those systems. */
export function copySystems(p: Project, from: PlanLevel, to: PlanLevel, systems: ElvSystem[], replace: boolean): { next: Project; copied: number; removed: number } {
  const types = systems.flatMap((s) => devicesOf(s).map((d) => d.type));
  let next = p, removed = 0;
  if (replace) {
    const old = devicesOn(p, to.building, to.level).filter((d) => types.includes(d.type)).map((d) => d.id);
    next = removeDevices(next, old); removed = old.length;
  }
  const r = copyDevices(next, { buildingId: from.building, levelId: from.level }, { buildingId: to.building, levelId: to.level }, types);
  return { next: r.project, copied: r.ids.length, removed };
}

/** Check level: for each system Coverage offers that has devices on the level, how many rooms it does not fully cover. */
export function coverageGaps(p: Project, lv: PlanLevel): { system: ElvSystem; label: string; roomsNotCovered: number }[] {
  const here = devicesOn(p, lv.building, lv.level);
  return coverageSystems()
    .filter((s) => here.some((d) => ELV_DEVICES[d.type].system === s.id))
    .map((s) => ({ system: s.id, label: s.label, roomsNotCovered: coverageOf(p, lv, s.id).filter((c) => c.gaps.length > 0).length }));
}
