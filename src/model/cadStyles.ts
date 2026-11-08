import { annoOf, unitsPerPaperMm } from './cadAnnotate';
import { dimLength, type DimArrow, type DimFormat, type DimLook, type DimUnit } from './cadSketch';
import type { Project } from '../types';

/** Design CAD text and dimension styles (STYLE, DIMSTYLE), kept per project. Each kind has a "Standard" that draws as
 * before (text at the annotation text height, dimensions sized from their length) until it is changed: unchanged it is
 * not stored, so a project that never changed its styles stores none. Sizes are paper mm at the annotation scale. */

/** Fonts a text style can use: those that print the same on the sheets and in Save DXF. The sheets print text in
 * Arial, and Save DXF does not write text styles yet (its texts take the drawing's own Standard style), so Arial only
 * until both write more. */
export const CAD_FONTS = ['Arial'] as const;
export type CadFont = (typeof CAD_FONTS)[number];
/** A text style: its font and height (paper mm; 0 asks each time, starting from the annotation text height). */
export interface CadTextStyle { name: string; font: CadFont; heightMm: number }
export type { DimArrow, DimUnit };
export const DIM_ARROWS: { id: DimArrow; label: string }[] = [
  { id: 'closed', label: 'Closed' }, { id: 'filled', label: 'Closed filled' }, { id: 'open', label: 'Open' }, { id: 'open30', label: 'Open 30°' },
  { id: 'open90', label: 'Right angle' }, { id: 'tick', label: 'Tick' }, { id: 'archTick', label: 'Architectural tick' }, { id: 'dot', label: 'Dot blank' },
  { id: 'dotFilled', label: 'Dot' }, { id: 'dotSmall', label: 'Dot small' }, { id: 'box', label: 'Box' }, { id: 'boxFilled', label: 'Box filled' }, { id: 'none', label: 'None' }
];
export const DIM_UNITS: DimUnit[] = ['m', 'cm', 'mm'];
/** Where a style puts the text: over the line on the side away from the points (as before), above it as read,
 * centred in a break of it, or below it. */
export type DimTextPos = 'outside' | 'above' | 'centered' | 'below';
export const DIM_TEXT_POS: { id: DimTextPos; label: string }[] = [{ id: 'outside', label: 'Outside' }, { id: 'above', label: 'Above' }, { id: 'centered', label: 'Centred' }, { id: 'below', label: 'Below' }];
export type DimTextAlong = 'centre' | 'first' | 'second';
export const DIM_TEXT_ALONG: { id: DimTextAlong; label: string }[] = [{ id: 'centre', label: 'Centred' }, { id: 'first', label: 'At extension line 1' }, { id: 'second', label: 'At extension line 2' }];
/** A dimension style: arrows (the second end's when it differs) and their size, text height, the gap at the points
 * measured (offset from origin), how far the extension lines run past the dimension line and the dimension line past
 * them, which extension lines are drawn, where the text goes and its gap from the line, and how the length is written
 * (unit, decimals, measurement scale, rounding, trailing zeros, decimal comma, prefix and suffix). */
export interface CadDimStyle {
  name: string; arrow: DimArrow; arrow2: DimArrow | 'same'; arrowMm: number; textMm: number; offsetMm: number; extendMm: number; dleMm: number;
  hideExt1: boolean; hideExt2: boolean; textPos: DimTextPos; textAlong: DimTextAlong; textFlat: boolean; gapMm: number;
  decimals: number; unit: DimUnit; scale: number; round: number; trimZeros: boolean; comma: boolean; prefix: string; suffix: string;
}
/** The styles of a kind and the one new text or dimensions take. */
export interface CadStyles<T> { styles: T[]; current: string }

export const STANDARD = 'Standard';
export const STANDARD_TEXT: CadTextStyle = { name: STANDARD, font: 'Arial', heightMm: 0 };
/** What a style has that styles saved before these settings did not: as those drew. */
export const DIM_DEFAULTS: Omit<CadDimStyle, 'name' | 'arrow' | 'arrowMm' | 'textMm' | 'offsetMm' | 'extendMm' | 'decimals' | 'unit'> = {
  arrow2: 'same', dleMm: 0, hideExt1: false, hideExt2: false, textPos: 'outside', textAlong: 'centre', textFlat: false, gapMm: 0.6,
  scale: 1, round: 0, trimZeros: false, comma: false, prefix: '', suffix: ''
};
const standardDim = (p: Project): CadDimStyle => ({ name: STANDARD, arrow: 'tick', arrowMm: 2.5, textMm: annoOf(p).textMm * 0.8, offsetMm: 0.6, extendMm: 1.25, decimals: 2, unit: 'm', ...DIM_DEFAULTS });
/** A style saved before some settings existed, with them as it drew. */
export const fullDimStyle = (s: Partial<CadDimStyle> & Pick<CadDimStyle, 'name'>, p: Project): CadDimStyle => ({ ...standardDim(p), ...s });

/** The styles of a kind with Standard among them: the one stored once changed, else as before. */
const withStandard = <T extends { name: string }>(stored: CadStyles<T> | undefined, standard: T): CadStyles<T> =>
  !stored ? { styles: [standard], current: STANDARD } : stored.styles.some((x) => x.name === STANDARD) ? stored : { ...stored, styles: [standard, ...stored.styles] };
export const textStylesOf = (p: Project): CadStyles<CadTextStyle> => withStandard(p.cadTextStyles, STANDARD_TEXT);
export function dimStylesOf(p: Project): CadStyles<CadDimStyle> {
  const s = withStandard(p.cadDimStyles, standardDim(p));
  return { ...s, styles: s.styles.map((x) => fullDimStyle(x, p)) };
}
/** What the project keeps of the styles saved: Standard only once changed, and nothing at all when only an unchanged
 * Standard is left as the current style. */
function toStore<T extends { name: string }>(s: CadStyles<T>, standard: T): CadStyles<T> | undefined {
  const same = (x: T) => JSON.stringify(Object.entries(x).sort()) === JSON.stringify(Object.entries(standard).sort());
  const styles = s.styles.filter((x) => !(x.name === STANDARD && same(x)));
  return styles.length || s.current !== STANDARD ? { styles, current: s.current } : undefined;
}
export const textStylesToStore = (s: CadStyles<CadTextStyle>) => toStore(s, STANDARD_TEXT);
export const dimStylesToStore = (p: Project, s: CadStyles<CadDimStyle>) => toStore(s, standardDim(p));
/** Standard as before: not changed, so not stored. */
export const dimStandardAsBefore = (p: Project) => !p.cadDimStyles?.styles.some((x) => x.name === STANDARD);
const currentOf = <T extends { name: string }>(s: CadStyles<T>) => s.styles.find((x) => x.name === s.current) ?? s.styles[0];
export const currentTextStyle = (p: Project) => currentOf(textStylesOf(p));
export const currentDimStyle = (p: Project) => currentOf(dimStylesOf(p));

/** How a new dimension looks (drawing units): from the current dimension style; none (sized from its length, as
 * before) while that is Standard unchanged. */
export function dimLookOf(p: Project, metresPerUnit: number): { look: DimLook; textH: number; style: CadDimStyle } | undefined {
  const s = currentDimStyle(p);
  if (s.name === STANDARD && dimStandardAsBefore(p)) return undefined;
  const k = unitsPerPaperMm(annoOf(p), metresPerUnit);
  return { look: lookOf(s, k), textH: s.textMm * k, style: s };
}
/** A style's look at k drawing units per paper mm: what differs from how dimensions drew before is all it keeps. */
export function lookOf(s: CadDimStyle, k: number): DimLook {
  return {
    arrow: s.arrow, size: s.arrowMm * k, off: s.offsetMm * k, ext: s.extendMm * k, unit: s.unit, decimals: s.decimals,
    ...(s.arrow2 !== 'same' && s.arrow2 !== s.arrow ? { arrow2: s.arrow2 } : {}),
    ...(s.textPos !== 'outside' ? { textPos: s.textPos, gap: s.gapMm * k } : {}),
    ...(s.textAlong !== 'centre' ? { textAlong: s.textAlong } : {}),
    ...(s.textFlat ? { textFlat: true } : {}),
    ...(s.dleMm > 0 ? { dle: s.dleMm * k } : {}),
    ...(s.hideExt1 ? { hideExt1: true } : {}), ...(s.hideExt2 ? { hideExt2: true } : {}),
    ...formatOf(s)
  };
}
/** How a style writes the length, beyond its unit and decimals: only what is set. */
const formatOf = (s: CadDimStyle): DimFormat => ({
  ...(s.scale > 0 && s.scale !== 1 ? { scale: s.scale } : {}), ...(s.round > 0 ? { round: s.round } : {}), ...(s.trimZeros ? { trimZeros: true } : {}),
  ...(s.comma ? { comma: true } : {}), ...(s.prefix ? { prefix: s.prefix } : {}), ...(s.suffix ? { suffix: s.suffix } : {})
});
/** A dimension's text: the length as the style writes it. */
export const dimText = (lengthM: number, s: Pick<CadDimStyle, 'unit' | 'decimals'> & Partial<CadDimStyle>) =>
  dimLength(lengthM, { unit: s.unit, decimals: s.decimals, ...formatOf({ ...DIM_DEFAULTS, ...s } as CadDimStyle) });

/** A name not yet used: "Style 1", "Style 2"… */
export function newStyleName(names: string[], base = 'Style'): string {
  const used = new Set(names.map((n) => n.toLowerCase()));
  for (let i = 1; ; i += 1) if (!used.has(`${base} ${i}`.toLowerCase())) return `${base} ${i}`;
}
/** Why a style cannot be deleted, if it cannot: Standard stays, and so does the current one. */
export const cannotDelete = (s: CadStyles<{ name: string }>, name: string) => (name === STANDARD ? 'Standard cannot be deleted.' : name === s.current ? 'Set another style current first.' : undefined);
/** Why a style cannot take a name, if it cannot: blank, or another style's. */
export function badName(s: CadStyles<{ name: string }>, from: string, to: string): string | undefined {
  const t = to.trim();
  if (from === STANDARD && t !== STANDARD) return 'Standard keeps its name.';
  if (!t) return 'Give the style a name.';
  if (s.styles.some((x) => x.name !== from && x.name.toLowerCase() === t.toLowerCase())) return `There is already a style named ${t}.`;
  return undefined;
}
