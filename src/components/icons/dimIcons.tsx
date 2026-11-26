/** Design CAD → Annotate → Dimensions: the forms of dimension as icons (24 × 24 grid, stroked like the Lucide icons
 * beside them): extension lines, the dimension line and its arrows. */

type P = { size?: number; strokeWidth?: number; className?: string };
const Svg = ({ size = 16, strokeWidth = 1.6, className, children }: P & { children: React.ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    {children}
  </svg>
);

/** Linear: horizontal between two extension lines. */
export const DimLinearIcon = (p: P) => <Svg {...p}><path d="M4 5v14M20 5v14M4 11h16" /><path d="M7 9l-3 2 3 2M17 9l3 2-3 2" /></Svg>;
/** Aligned: along a sloping pair of points. */
export const DimAlignedIcon = (p: P) => <Svg {...p}><path d="M4 16l4 4M16 4l4 4M6 18L18 6" /><path d="M6 14.5V18h3.5M18 9.5V6h-3.5" /></Svg>;
/** Angular: an arc between two lines from a vertex. */
export const DimAngularIcon = (p: P) => <Svg {...p}><path d="M4 20h16M4 20L15 6" /><path d="M14 20a10 10 0 0 0-3.8-7.8" /></Svg>;
/** Radius: from the centre of a circle to its edge. */
export const DimRadiusIcon = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="8" /><path d="M12 12l5.6-5.6" /><path d="M14.5 6.5h3.5v3.5" /></Svg>;
/** Diameter: across a circle through its centre. */
export const DimDiameterIcon = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="8" /><path d="M6.3 17.7L17.7 6.3" /><path d="M14.2 6.3h3.5v3.5M9.8 17.7H6.3v-3.5" /></Svg>;
/** Arc length: a dimension arc over an arc, with an arc sign above. */
export const DimArcLengthIcon = (p: P) => <Svg {...p}><path d="M5 17a9 9 0 0 1 14 0" /><path d="M5 17l-1.5 2M19 17l1.5 2" /><path d="M9 7a4 4 0 0 1 6 0" /></Svg>;
/** Jogged radius: a radius line from inside a circle with a jog in it. */
export const DimJoggedIcon = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="8" /><path d="M7 18l3-3-2-2 6-6" /><path d="M14.5 6.5h3.5v3.5" /></Svg>;
/** Ordinate: two leaders with jogs off an axis. */
export const DimOrdinateIcon = (p: P) => <Svg {...p}><path d="M4 20h16M4 20V4" /><path d="M10 20v-6l2-2v-4M4 10h6" /></Svg>;
/** Continue: a chain of dimensions, each from the last. */
export const DimContinueIcon = (p: P) => <Svg {...p}><path d="M3 6v13M10 6v13M17 6v13M3 11h14" /><path d="M17 11h4M19 9l2 2-2 2" /></Svg>;
/** Quick: a row of dimensions over a pick, at a stroke. */
export const DimQuickIcon = (p: P) => <Svg {...p}><path d="M3 5v14M10 5v14M21 5v14M3 9h18" /><path d="M15 12l-2.5 3.5h3L13 20" /></Svg>;
/** Break: a dimension line with a gap where a line crosses it. */
export const DimBreakIcon = (p: P) => <Svg {...p}><path d="M3 6v13M21 6v13M3 11h6M15 11h6" /><path d="M12 3v18" /></Svg>;
/** Text position: a dimension with its text lifted off the line. */
export const DimTextIcon = (p: P) => <Svg {...p}><path d="M3 14v6M21 14v6M3 17h18" /><rect x="7.5" y="4" width="9" height="6" rx="1" /><path d="M12 10v3" /></Svg>;
/** Baseline: each dimension from the same first line, one step further out. */
export const DimBaselineIcon = (p: P) => <Svg {...p}><path d="M3 4v16M11 13v7M20 9v11M3 13h8M3 9h17" /></Svg>;
