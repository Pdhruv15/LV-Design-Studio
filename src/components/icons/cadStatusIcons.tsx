/** Design CAD status bar switches as icons (24 × 24 grid, stroked like the Lucide icons beside them). */

type P = { size?: number; strokeWidth?: number; className?: string };
const Svg = ({ size = 18, strokeWidth = 1.7, className, children }: P & { children: React.ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    {children}
  </svg>
);
const Dot = ({ x, y }: { x: number; y: number }) => <circle cx={x} cy={y} r="1.1" fill="currentColor" stroke="none" />;

/** Grid (F7): a square grid; as dots when the grid shows dots. */
export const GridIcon = ({ dots, ...p }: P & { dots?: boolean }) => (
  <Svg {...p}>
    {dots ? [5, 12, 19].flatMap((y) => [5, 12, 19].map((x) => <Dot key={`${x},${y}`} x={x} y={y} />))
      : <><rect x="4" y="4" width="16" height="16" /><path d="M4 9.3h16M4 14.7h16M9.3 4v16M14.7 4v16" /></>}
  </Svg>
);

/** Snap (F9): grid points with the cursor box on one. */
export const SnapIcon = (p: P) => (
  <Svg {...p}>
    {[[5, 5], [12, 5], [19, 5], [5, 12], [19, 12], [5, 19], [12, 19], [19, 19]].map(([x, y]) => <Dot key={`${x},${y}`} x={x} y={y} />)}
    <rect x="9" y="9" width="6" height="6" />
  </Svg>
);

/** Ortho (F8): a right angle with arrowheads. */
export const OrthoIcon = (p: P) => (
  <Svg {...p}><path d="M5 3.5V19h15.5" /><path d="M2.8 6 5 3.5 7.2 6M18 16.8l2.5 2.2-2.5 2.2" /><path d="M5 14h5v5" strokeWidth="1.2" /></Svg>
);

/** Polar tracking (F10): a base line, a dashed tracking ray and the angle's arc. */
export const PolarIcon = (p: P) => (
  <Svg {...p}><path d="M3 20h18" /><path d="M3 20 18 5" strokeDasharray="2.2 2.2" /><path d="M11.5 20a8.5 8.5 0 0 0-2.4-6" /></Svg>
);

/** Object snap (F3): a line ending in the endpoint marker. */
export const OsnapIcon = (p: P) => (
  <Svg {...p}><path d="M3 21 13.5 10.5" /><rect x="12" y="3" width="9" height="9" /></Svg>
);

/** Object snap tracking (F11): a snap marker with dashed tracking lines meeting at a point. */
export const OtrackIcon = (p: P) => (
  <Svg {...p}><rect x="3" y="3" width="7" height="7" /><path d="M10 6.5h11M6.5 10v11" strokeDasharray="2.2 2.2" /><path d="M15.5 15.5l4 4M19.5 15.5l-4 4" /></Svg>
);

/** Dynamic input (F12): the cursor with a value box beside it. */
export const DynIcon = (p: P) => (
  <Svg {...p}><path d="M3.5 3.5 9.5 18l2.2-5.6 5.6-2.2z" /><rect x="13.5" y="14.5" width="8" height="6" rx="1" /></Svg>
);

/** Show lineweights (LWT): three lines of growing weight. */
export const LwtIcon = (p: P) => (
  <Svg {...p}><path d="M4 6h16" strokeWidth="1" /><path d="M4 12h16" strokeWidth="2.2" /><path d="M4 18.5h16" strokeWidth="3.6" /></Svg>
);

/** Fit the drawing to the window: four corner brackets round the drawing. */
export const FitIcon = (p: P) => (
  <Svg {...p}><path d="M3.5 8.5v-5h5M15.5 3.5h5v5M20.5 15.5v5h-5M8.5 20.5h-5v-5" /><rect x="8.5" y="8.5" width="7" height="7" /></Svg>
);
