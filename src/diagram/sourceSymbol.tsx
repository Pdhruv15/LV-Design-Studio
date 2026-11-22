import type { SourceKind } from '../types';

/** The symbol of a supply source on the SLD, by what feeds the supply point. Drawn from primitives relative to the
 * symbol centre (envelope radius 11), by one renderer for the screen (JSX) and one for the printed board sheet (an
 * SVG string, black only). */
type Prim =
  | { t: 'circle'; r: number }
  | { t: 'rect' }
  | { t: 'path'; d: string; thin?: boolean }
  | { t: 'text'; x: number; y: number; s: string };

const CIRCLE: Prim = { t: 'circle', r: 11 };
const G: Prim = { t: 'text', x: 0, y: 4, s: 'G' };
/** The converter: a square with a diagonal, = in its upper-left half and ~ in its lower-right half. */
const CONVERTER: Prim[] = [
  { t: 'rect' }, { t: 'path', d: 'M-11 11 L11 -11' },
  { t: 'path', d: 'M-8 -6.5 h7 M-8 -3 h7' }, { t: 'path', d: 'M1 5 q1.75 -4 3.5 0 t3.5 0' }
];

const PRIMS: Record<SourceKind, Prim[]> = {
  utility: [CIRCLE, { t: 'path', d: 'M-5 0 q2.5 -6 5 0 t5 0' }],
  generator: [CIRCLE, G],
  pv: [
    ...CONVERTER,
    { t: 'path', d: 'M-26 -18 L-20 -10 M-20 -10 l-1 -5 M-20 -10 l-5 1', thin: true },
    { t: 'path', d: 'M-20 -19 L-14 -13 M-14 -13 l-1 -5 M-14 -13 l-5 1', thin: true }
  ],
  wind: [CIRCLE, G, { t: 'path', d: 'M-23 0 V-7 M-23 0 L-29.06 3.5 M-23 0 L-16.94 3.5 M-23 0 H-11' }],
  battery: [...CONVERTER, { t: 'path', d: 'M-17 -6 V6 M-20 -3 V3 M-17 0 H-11' }],
  other: [CIRCLE]
};

/** A source symbol on the screen, centred at (x, y); the surrounding group's classes give the colours. Circles,
 * squares and letters carry their own positions; the line work is moved into place. */
export function SourceSym({ kind, x, y }: { kind: SourceKind; x: number; y: number }) {
  return (
    <>
      {PRIMS[kind].map((p, i) => p.t === 'circle' ? <circle key={i} cx={x} cy={y} r={p.r} className="sym" />
        : p.t === 'rect' ? <rect key={i} x={x - 11} y={y - 11} width={22} height={22} className="sym" />
        : p.t === 'path' ? <path key={i} d={p.d} transform={`translate(${x} ${y})`} className="ln" {...(p.thin ? { strokeWidth: 1 } : {})} />
        : <text key={i} x={x + p.x} y={y + p.y} textAnchor="middle" className="b" style={{ fontSize: 11 }}>{p.s}</text>)}
    </>
  );
}

/** The same symbol as SVG text for the printed board sheet: black strokes, no fill. */
export function sourceSymSvg(kind: SourceKind, x: number, y: number): string {
  const body = PRIMS[kind].map((p) => p.t === 'circle' ? `<circle r="${p.r}" fill="none" stroke="black" stroke-width="1.2"/>`
    : p.t === 'rect' ? '<rect x="-11" y="-11" width="22" height="22" fill="none" stroke="black" stroke-width="1.2"/>'
    : p.t === 'path' ? `<path d="${p.d}" fill="none" stroke="black" stroke-width="${p.thin ? 0.8 : 1.2}"/>`
    : `<text x="${p.x}" y="${p.y}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="bold" fill="black">${p.s}</text>`).join('');
  return `<g transform="translate(${x} ${y})">${body}</g>`;
}
