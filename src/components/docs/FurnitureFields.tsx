import { FURNITURE_TEXT_MM, MIN_TEXT_MM, type SheetFurniture } from '../../model/drawingSet';

/** The sheet furniture choices (what prints around the drawing): for the set, where a blank value is today's output,
 * and for one sheet, where a blank value follows the set (base = the set's values, named in the blank option). */
export const ZONE_LABEL: Record<NonNullable<SheetFurniture['zones']>, string> = { off: 'Off', large: 'A2 and A1', all: 'Every paper' };
export const NOTES_LABEL: Record<NonNullable<SheetFurniture['notesPlace']>, string> = { block: 'Above the title block', column: 'In the legend column' };
const minTextLabel = (v: number) => (v === MIN_TEXT_MM[0] ? `${v} mm (as before)` : `${v} mm`);

export function FurnitureFields({ value, base, onChange }: { value: SheetFurniture; base?: SheetFurniture; onChange: (f: SheetFurniture) => void }) {
  const set = <K extends keyof SheetFurniture>(k: K, v: SheetFurniture[K] | undefined) => {
    const next = { ...value };
    if (v === undefined) delete next[k]; else next[k] = v;
    onChange(next);
  };
  // The blank option: for a sheet, the set's value; for the set, today's output.
  const blank = (label: string) => <option value="">{base ? `As the set (${label})` : label}</option>;
  const num = (v: string) => (v === '' ? undefined : Number(v));
  return (
    <>
      <label>Zone references<select value={value.zones ?? ''} onChange={(e) => set('zones', (e.target.value || undefined) as SheetFurniture['zones'])}>
        {blank(ZONE_LABEL[base?.zones ?? 'off'])}{(Object.keys(ZONE_LABEL) as (keyof typeof ZONE_LABEL)[]).map((z) => <option key={z} value={z}>{ZONE_LABEL[z]}</option>)}
      </select></label>
      <label>Centring marks<select value={value.centring === undefined ? '' : value.centring ? 'on' : 'off'} onChange={(e) => set('centring', e.target.value === '' ? undefined : e.target.value === 'on')}>
        {blank(base?.centring ? 'Print' : 'Off')}<option value="off">Off</option><option value="on">Print</option>
      </select></label>
      <label>Legend and column text<select value={value.textMm ?? ''} onChange={(e) => set('textMm', num(e.target.value) as SheetFurniture['textMm'])}>
        {blank(`${base?.textMm ?? FURNITURE_TEXT_MM[0]} mm`)}{FURNITURE_TEXT_MM.map((v) => <option key={v} value={v}>{v} mm</option>)}
      </select></label>
      <label>Notes<select value={value.notesPlace ?? ''} onChange={(e) => set('notesPlace', (e.target.value || undefined) as SheetFurniture['notesPlace'])}>
        {blank(NOTES_LABEL[base?.notesPlace ?? 'block'])}{(Object.keys(NOTES_LABEL) as (keyof typeof NOTES_LABEL)[]).map((z) => <option key={z} value={z}>{NOTES_LABEL[z]}</option>)}
      </select></label>
      <label>Notes box width (mm)<input className="bi-text" inputMode="decimal" defaultValue={value.notesWidthMm ?? ''} key={`nw${value.notesWidthMm ?? ''}`} placeholder={base?.notesWidthMm ? `As the set (${base.notesWidthMm})` : 'As the title block'}
        onBlur={(e) => { const v = num(e.target.value.trim()); if (v !== value.notesWidthMm && (v === undefined || (Number.isFinite(v) && v > 0))) set('notesWidthMm', v); }} /></label>
      <label>Smallest drawing text<select value={value.minTextMm ?? ''} onChange={(e) => set('minTextMm', num(e.target.value))}>
        {blank(minTextLabel(base?.minTextMm ?? MIN_TEXT_MM[0]))}{MIN_TEXT_MM.map((v) => <option key={v} value={v}>{minTextLabel(v)}</option>)}
      </select></label>
    </>
  );
}
