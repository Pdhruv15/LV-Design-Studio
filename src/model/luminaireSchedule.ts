import { buildingInfoOf } from '../calc/building';
import { EMERGENCY_ITEMS, type EmergencyKind, type LvPoint } from './cadDevices';
import { floorLabel, floorList } from './levels';
import type { Project } from '../types';

/** Luminaire schedule: the lights placed on the plans, by type. A luminaire Light room (LUX) placed is one type per
 * catalogue entry and wattage (L1, L2…); emergency lights and signs are EM1, EX1 and DS1. Points without a type
 * (placed one by one from the palette) are counted by the load schedule instead and are not listed. */

export interface LuminaireType {
  code: string; // L1, L2…, EM1, EX1, DS1
  key: string; // BOQ item key
  description: string;
  watts?: number;
  lumens?: number;
  manufacturer?: string;
  count: number;
  byBoard: Record<string, number>; // count per board of the circuits they are on
  levels: string[]; // floors they are placed on
}

const EM_CODE: Record<EmergencyKind, string> = { fitting: 'EM1', 'exit-sign': 'EX1', 'direction-sign': 'DS1' };
const EM_TEXT: Record<EmergencyKind, string> = {
  fitting: 'self-contained LED emergency luminaire; mode (maintained / non-maintained) and duration to the emergency lighting design',
  'exit-sign': 'self-contained LED exit sign, ISO 7010 pictogram, viewing distance to the design',
  'direction-sign': 'self-contained LED directional exit sign, ISO 7010 pictogram with arrow, viewing distance to the design'
};

const pointNo = (d: LvPoint) => Number(d.id.replace(/\D/g, '')) || 0;

export function luminaireSchedule(p: Project): LuminaireType[] {
  const feeders = new Map(p.feeders.map((f) => [f.id, f]));
  const info = buildingInfoOf(p);
  const floors = floorList(info);
  const levelOf = (d: LvPoint) => {
    const f = floors.find((x) => x.ref.building === d.buildingId && x.ref.level === d.levelId);
    return f ? floorLabel(info, f) : d.levelId;
  };
  const types = new Map<string, LuminaireType & { first: number; emg?: EmergencyKind }>();
  // In placing order (point ids are never reused), so the first type placed stays L1.
  for (const d of [...(p.lvPoints ?? [])].sort((a, b) => pointNo(a) - pointNo(b))) {
    const f = feeders.get(d.feederId);
    if (!f || f.existing) continue;
    let t: Omit<LuminaireType, 'code' | 'count' | 'byBoard' | 'levels'> & { emg?: EmergencyKind };
    if (d.emergency) t = { key: `em:${d.emergency}`, description: `${EMERGENCY_ITEMS[d.emergency].label}: ${EM_TEXT[d.emergency]}`, emg: d.emergency };
    else if (d.luminaire) {
      const l = d.luminaire;
      t = { key: `luminaire:${encodeURIComponent(l.id)}:${l.watts}`, description: `${l.label}${l.manufacturer ? `, ${l.manufacturer}` : ''}`, watts: l.watts, lumens: l.lumens, manufacturer: l.manufacturer };
    } else continue;
    const it = types.get(t.key) ?? { ...t, code: t.emg ? EM_CODE[t.emg] : '', count: 0, byBoard: {}, levels: [], first: pointNo(d) };
    it.count++;
    it.byBoard[f.boardId] = (it.byBoard[f.boardId] ?? 0) + 1;
    const lv = levelOf(d);
    if (!it.levels.includes(lv)) it.levels.push(lv);
    types.set(t.key, it);
  }
  const all = [...types.values()];
  let n = 0;
  for (const t of all.filter((x) => !x.code).sort((a, b) => a.first - b.first)) t.code = `L${++n}`;
  const rank = (c: string) => ['L', 'EM', 'EX', 'DS'].indexOf(c.replace(/\d+$/, ''));
  return all
    .sort((a, b) => rank(a.code) - rank(b.code) || a.first - b.first)
    .map(({ first: _first, emg: _emg, ...t }) => t);
}
