import { annoOf, unitsPerPaperMm } from './cadAnnotate';
import type { DimLook } from './cadSketch';
import type { Project } from '../types';

/** Design CAD text and dimension styles (STYLE, DIMSTYLE), kept per project. A project without them has one of each,
 * "Standard", that draws as before: text at the annotation text height, dimensions sized from their length. Sizes are
 * paper mm at the annotation scale. */

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

export const textStylesOf = (p: Project): CadStyles<CadTextStyle> => p.cadTextStyles ?? { styles: [STANDARD_TEXT], current: STANDARD };
export const dimStylesOf = (p: Project): CadStyles<CadDimStyle> => p.cadDimStyles ?? { styles: [standardDim(p)], current: STANDARD };
const currentOf = <T extends { name: string }>(s: CadStyles<T>) => s.styles.find((x) => x.name === s.current) ?? s.styles[0];
export const currentTextStyle = (p: Project) => currentOf(textStylesOf(p));
export const currentDimStyle = (p: Project) => currentOf(dimStylesOf(p));

/** How a new dimension looks (drawing units): from the current dimension style once the project has styles; none
 * (sized from its length, as before) until then. */
export function dimLookOf(p: Project, metresPerUnit: number): { look: DimLook; textH: number; style: CadDimStyle } | undefined {
  if (!p.cadDimStyles) return undefined;
  const s = currentDimStyle(p), k = unitsPerPaperMm(annoOf(p), metresPerUnit);
  return { look: { arrow: s.arrow, size: s.arrowMm * k, off: s.offsetMm * k, ext: s.extendMm * k }, textH: s.textMm * k, style: s };
}
/** A dimension's text: the length in the style's unit and decimal places. */
export const dimText = (lengthM: number, s: Pick<CadDimStyle, 'unit' | 'decimals'>) => (s.unit === 'mm' ? lengthM * 1000 : lengthM).toFixed(Math.max(0, Math.min(4, Math.round(s.decimals))));

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
