import { annoOf, unitsPerPaperMm } from './cadAnnotate';
import { dimLength, type DimLook } from './cadSketch';
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
export type DimArrow = DimLook['arrow'];
export const DIM_ARROWS: { id: DimArrow; label: string }[] = [{ id: 'closed', label: 'Closed' }, { id: 'tick', label: 'Tick' }, { id: 'dot', label: 'Dot' }];
/** A dimension style: arrows and their size, text height, the gap at the points measured (offset from origin), how far
 * the extension lines run past the dimension line, and how the length is written. */
export interface CadDimStyle { name: string; arrow: DimArrow; arrowMm: number; textMm: number; offsetMm: number; extendMm: number; decimals: number; unit: 'm' | 'mm' }
/** The styles of a kind and the one new text or dimensions take. */
export interface CadStyles<T> { styles: T[]; current: string }

export const STANDARD = 'Standard';
export const STANDARD_TEXT: CadTextStyle = { name: STANDARD, font: 'Arial', heightMm: 0 };
const standardDim = (p: Project): CadDimStyle => ({ name: STANDARD, arrow: 'tick', arrowMm: 2.5, textMm: annoOf(p).textMm * 0.8, offsetMm: 0.6, extendMm: 1.25, decimals: 2, unit: 'm' });

/** The styles of a kind with Standard among them: the one stored once changed, else as before. */
const withStandard = <T extends { name: string }>(stored: CadStyles<T> | undefined, standard: T): CadStyles<T> =>
  !stored ? { styles: [standard], current: STANDARD } : stored.styles.some((x) => x.name === STANDARD) ? stored : { ...stored, styles: [standard, ...stored.styles] };
export const textStylesOf = (p: Project): CadStyles<CadTextStyle> => withStandard(p.cadTextStyles, STANDARD_TEXT);
export const dimStylesOf = (p: Project): CadStyles<CadDimStyle> => withStandard(p.cadDimStyles, standardDim(p));
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
  return { look: { arrow: s.arrow, size: s.arrowMm * k, off: s.offsetMm * k, ext: s.extendMm * k, unit: s.unit, decimals: s.decimals }, textH: s.textMm * k, style: s };
}
/** A dimension's text: the length in the style's unit and decimal places. */
export const dimText = (lengthM: number, s: Pick<CadDimStyle, 'unit' | 'decimals'>) => dimLength(lengthM, s);

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
