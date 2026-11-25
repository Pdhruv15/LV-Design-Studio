import type { FaultPoint } from '../types';

/** A fault point mark on the SLD: an arrow whose tip is at the place of the fault, and a tag with the mark's
 * number (F1, F2…). It leans right on a busbar and left (`left`) on a cable, where the cable's own text is on the
 * right. Colours come from the theme variables, which print as black on white. */
export function FaultMark({ point, x, y, left }: { point: FaultPoint; x: number; y: number; left?: boolean }) {
  const w = Math.max(26, 10 + point.id.length * 8), k = left ? -1 : 1;
  const line = { stroke: 'var(--tx)', strokeWidth: 1.6, fill: 'none' } as const;
  return (
    <g className="fault-mark" data-lv-id={`fault:${point.id}`} pointerEvents="none">
      <title>{`Fault point ${point.id}${point.name ? ` — ${point.name}` : ''}`}</title>
      <path d={`M${x} ${y} L${x + k * 26} ${y - 22} L${x + k * 20} ${y - 10} L${x + k * 44} ${y - 26}`} style={line} />
      <path d={`M${x} ${y} l${k * 10} -3 l${k * -5} -6 z`} style={{ fill: 'var(--tx)', stroke: 'none' }} />
      <rect x={left ? x - 46 - w : x + 46} y={y - 38} width={w} height={18} style={{ ...line, strokeWidth: 1.3, fill: 'var(--panel)' }} />
      <text x={x + k * (46 + w / 2)} y={y - 25} textAnchor="middle" style={{ fill: 'var(--tx)', fontSize: 11, fontWeight: 600 }}>{point.id}</text>
    </g>
  );
}
