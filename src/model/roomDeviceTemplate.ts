import { buildingInfoOf } from '../calc/building';
import { luminairesOf, roomLighting, roomLightingDefaults, type RoomLightingResult } from '../calc/roomLighting';
import { inside } from './cadMeasure';
import { placeLvPoint, removeLvPoint, type PointLuminaire } from './cadDevices';
import { placeRoomLights } from './roomLights';
import type { LevelRef } from './levels';
import type { BuildingRoom, Project } from '../types';

type Pt = [number, number];

export type RoomDeviceTemplateKind = 'office' | 'meeting' | 'bedroom';
export type RoomDeviceTemplateScope = 'both' | 'lv' | 'elv';

export const ROOM_DEVICE_TEMPLATES: { id: RoomDeviceTemplateKind; label: string }[] = [
  { id: 'office', label: 'Office' },
  { id: 'meeting', label: 'Meeting room' },
  { id: 'bedroom', label: 'Bedroom' }
];

/** Strict preview limits: one room only, and no search grid or rejected proposal is stored. */
export const ROOM_TEMPLATE_LIMITS = { lights: 32, sockets: 8, elv: 24, total: 64 } as const;

export interface LvRoomTemplateProposal {
  roomId: string;
  kind: RoomDeviceTemplateKind;
  lights: Pt[];
  sockets: Pt[];
  luminaire: PointLuminaire;
  lighting: RoomLightingResult;
  limited: boolean;
  warnings: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Evenly spaced points just inside the room boundary, used for wall-mounted outlets. */
export function roomPerimeterPoints(outline: Pt[], count: number): Pt[] {
  if (outline.length < 3 || count <= 0) return [];
  const lengths = outline.map((q, i) => Math.hypot(outline[(i + 1) % outline.length][0] - q[0], outline[(i + 1) % outline.length][1] - q[1]));
  const perimeter = lengths.reduce((sum, n) => sum + n, 0);
  if (!(perimeter > 0)) return [];
  const points: Pt[] = [];
  for (let n = 0; n < count; n += 1) {
    let along = ((n + 0.5) * perimeter) / count;
    let i = 0;
    while (i < lengths.length - 1 && along > lengths[i]) { along -= lengths[i]; i += 1; }
    const a = outline[i], b = outline[(i + 1) % outline.length], len = lengths[i] || 1, t = Math.min(1, along / len);
    const on: Pt = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const normal: Pt = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
    const candidate = [0.2, 0.08, 0.02].flatMap((offset) => [
      [on[0] + normal[0] * offset, on[1] + normal[1] * offset] as Pt,
      [on[0] - normal[0] * offset, on[1] - normal[1] * offset] as Pt
    ]).find((q) => inside(q, outline));
    if (candidate) points.push([r2(candidate[0]), r2(candidate[1])]);
  }
  return points;
}

const socketCount = (kind: RoomDeviceTemplateKind, areaM2: number) => {
  const wanted = kind === 'office' ? Math.max(2, Math.ceil(areaM2 / 12)) : kind === 'meeting' ? Math.max(2, Math.ceil(areaM2 / 15)) : Math.max(3, Math.ceil(areaM2 / 18));
  return Math.min(ROOM_TEMPLATE_LIMITS.sockets, wanted);
};

/** Calculates the LV part only. The caller omits this entirely for an ELV-only preview. */
export function proposeLvRoomTemplate(p: Project, room: BuildingRoom, kind: RoomDeviceTemplateKind): LvRoomTemplateProposal {
  const outline = room.outline ?? [];
  if (outline.length < 3) throw new Error('The room has no outline on the plan: pick or trace it first.');
  const luminaires = luminairesOf();
  const selected = kind === 'bedroom' ? luminaires[0] : [...luminaires].sort((a, b) => b.lumens - a.lumens)[0];
  if (!selected) throw new Error('Add a luminaire to the catalogue first.');
  const defaults = roomLightingDefaults(p, room);
  const lighting = roomLighting(outline, { ...defaults, lumens: selected.lumens, watts: selected.watts, shrMax: selected.shrMax, maxPoints: ROOM_TEMPLATE_LIMITS.lights });
  const sockets = roomPerimeterPoints(outline, socketCount(kind, lighting.areaM2));
  const limited = Math.ceil(lighting.required) > ROOM_TEMPLATE_LIMITS.lights || lighting.points.length + sockets.length > ROOM_TEMPLATE_LIMITS.total;
  const luminaire: PointLuminaire = { id: selected.id, label: selected.label, watts: selected.watts, lumens: selected.lumens, ...(selected.manufacturer ? { manufacturer: selected.manufacturer } : {}) };
  return { roomId: room.id, kind, lights: lighting.points, sockets, luminaire, lighting, limited, warnings: [...lighting.warnings] };
}

/** Approves the LV preview as one immutable project result, replacing only template device types in this room. */
export function approveLvRoomTemplate(p: Project, level: LevelRef, proposal: LvRoomTemplateProposal, lightingFeederId: string, powerFeederId: string, replace = true): { project: Project; placed: number; removed: number } {
  const room = buildingInfoOf(p).rooms.find((r) => r.id === proposal.roomId);
  if (!room?.outline) throw new Error('The selected room is no longer available.');
  if (proposal.limited) throw new Error('The preview reached its point limit. Divide the room or complete the layout manually.');
  if (!p.feeders.some((f) => f.id === lightingFeederId) || !p.feeders.some((f) => f.id === powerFeederId)) throw new Error('Choose the lighting and power circuits.');
  const lights = placeRoomLights(p, level, room.id, lightingFeederId, proposal.lights, replace, proposal.luminaire);
  let next = lights.project, removed = lights.removed;
  if (replace) {
    const old = (next.lvPoints ?? []).filter((d) => d.type === 's13t' && d.buildingId === level.building && d.levelId === level.level && inside([d.x, d.y], room.outline!));
    for (const d of old) next = removeLvPoint(next, d.id);
    removed += old.length;
  }
  for (const [x, y] of proposal.sockets) next = placeLvPoint(next, level, 's13t', powerFeederId, x, y).project;
  return { project: next, placed: proposal.lights.length + proposal.sockets.length, removed };
}
