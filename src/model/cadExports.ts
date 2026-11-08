import type { PlacedItem } from './cadDevices';
import type { SketchItem } from '../types';

/** Design CAD File → Export lists: the devices placed on a plan and the cable routes drawn, as table rows (metres, two
 * decimals). Pure; the page turns them into a workbook. */

export const DEVICE_HEAD = ['Kind', 'Device', 'Circuit / board', 'Room', 'X (m)', 'Y (m)'];
const KIND = { lv: 'LV point', elv: 'ELV device', board: 'Board' } as const;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** One row per device placed, by kind then circuit then name. */
export function deviceRows(placed: PlacedItem[]): (string | number)[][] {
  return [...placed]
    .sort((a, b) => a.what.localeCompare(b.what) || a.detail.localeCompare(b.detail) || a.label.localeCompare(b.label))
    .map((d) => [KIND[d.what], d.label, d.what === 'lv' ? d.detail.split(' · ')[0] : d.detail, d.room ?? '', r2(d.x), r2(d.y)]);
}

export const CABLE_HEAD = ['Cable', 'Routes', 'Length on plan (m)'];

/** Length of a drawn path (drawing units). */
const pathLength = (pts: [number, number][]) => pts.slice(1).reduce((t, q, i) => t + Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]), 0);

/** Per cable: how many routes are drawn for it and their length on this plan (metres: `factor` m per drawing unit). */
export function cableRows(sketch: SketchItem[], labelOf: (id: string) => string, factor: number): (string | number)[][] {
  const by = new Map<string, { n: number; len: number }>();
  for (const it of sketch) {
    if (!it.cable) continue;
    const k = labelOf(it.id);
    const x = by.get(k) ?? { n: 0, len: 0 };
    by.set(k, { n: x.n + 1, len: x.len + pathLength(it.pts) * factor });
  }
  return [...by.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })).map(([k, x]) => [k, x.n, r2(x.len)]);
}
