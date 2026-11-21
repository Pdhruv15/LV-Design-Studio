import type { BuildingRoom, Project } from '../../types';
import type { ElvDeviceType } from '../../elv/devices';
import type { NewElvDevice } from '../../elv/placed';
import { fillPoints, inside, placeDevices, removeDevices } from '../../elv/placed';

type Pt = [number, number];
export type ElvRoomTemplateKind = 'office' | 'meeting' | 'bedroom';

const LIMITS = { data: 12, accessPoints: 4, smoke: 8, total: 24 } as const;
export const ELV_ROOM_TEMPLATE_LIMIT = LIMITS.total;

export interface ElvRoomTemplateProposal {
  roomId: string;
  kind: ElvRoomTemplateKind;
  dataOutlets: Pt[];
  accessPoints: Pt[];
  smokeDetectors: Pt[];
  limited: boolean;
  warnings: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Boundary points are calculated locally so the ELV boundary remains independent of the LV model. */
function perimeterPoints(outline: Pt[], count: number): Pt[] {
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

const pointsOf = (items: NewElvDevice[]): Pt[] => items.map((d) => [d.x, d.y]);

/** Calculates at most 24 ELV points for the one selected room. */
export function proposeElvRoomTemplate(room: BuildingRoom, kind: ElvRoomTemplateKind): ElvRoomTemplateProposal {
  const outline = room.outline ?? [];
  if (outline.length < 3) throw new Error('The room has no outline on the plan: pick or trace it first.');
  const wantedData = kind === 'office' ? Math.max(2, Math.ceil(room.areaM2 / 8)) : kind === 'meeting' ? Math.max(2, Math.ceil(room.areaM2 / 15)) : 2;
  const dataOutlets = perimeterPoints(outline, Math.min(LIMITS.data, wantedData));
  const apProbe = fillPoints(outline, 'access-point', LIMITS.accessPoints + 1);
  const smokeProbe = fillPoints(outline, 'smoke-detector', LIMITS.smoke + 1);
  const accessPoints = pointsOf(apProbe.slice(0, LIMITS.accessPoints));
  const smokeDetectors = pointsOf(smokeProbe.slice(0, LIMITS.smoke));
  const limited = wantedData > LIMITS.data || apProbe.length > LIMITS.accessPoints || smokeProbe.length > LIMITS.smoke;
  const warnings = limited ? [`The room exceeds the ${LIMITS.total}-point ELV preview budget; divide it or complete the layout manually.`] : [];
  return { roomId: room.id, kind, dataOutlets, accessPoints, smokeDetectors, limited, warnings };
}

const devicesOf = (proposal: ElvRoomTemplateProposal): NewElvDevice[] => [
  ...proposal.dataOutlets.map(([x, y]) => ({ type: 'data-outlet' as const, x, y })),
  ...proposal.accessPoints.map(([x, y]) => ({ type: 'access-point' as const, x, y })),
  ...proposal.smokeDetectors.map(([x, y]) => ({ type: 'smoke-detector' as const, x, y }))
];

/** Replaces only the three template-managed ELV types in the selected room. */
export function approveElvRoomTemplate(p: Project, room: BuildingRoom, proposal: ElvRoomTemplateProposal, replace = true): { project: Project; placed: number; removed: number } {
  if (proposal.limited) throw new Error('The preview reached its point limit. Divide the room or complete the layout manually.');
  const types = new Set<ElvDeviceType>(['data-outlet', 'access-point', 'smoke-detector']);
  const old = replace ? (p.elvDevices ?? []).filter((d) => d.buildingId === room.buildingId && d.levelId === room.levelId && (d.roomId === room.id || (!d.roomId && !!room.outline && inside([d.x, d.y], room.outline))) && types.has(d.type)).map((d) => d.id) : [];
  const without = old.length ? removeDevices(p, old) : p;
  const added = placeDevices(without, room.buildingId, room.levelId, devicesOf(proposal));
  return { project: added.project, placed: added.ids.length, removed: old.length };
}
