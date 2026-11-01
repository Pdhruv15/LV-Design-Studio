/** Numbers and dates for the screen and for documents: thousands separators, '—' when there is no value. */

/** Up to `d` decimals, trailing zeros dropped (12.5, 3). */
export const fmtUpTo = (v: number | undefined, d = 2) =>
  v === undefined || !Number.isFinite(v) ? '—' : v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: 0 });

/** Exactly `d` decimals (1,250, 0.85). */
export const fmtFixed = (v: number | undefined, d = 0) =>
  v === undefined || !Number.isFinite(v) ? '—' : v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

/** A calculated value in a document: prints with its format (20,558.80) and, in Excel, stays a real number shown with `numFmt`. */
export class Figure {
  /** Rounded to what is printed, so the PDF and the Excel cell agree. Adding 0 turns -0 into 0, which never prints as "-0.0". */
  readonly value: number;
  readonly decimals: number;
  constructor(v: number, decimals: number) {
    this.value = Number(v.toFixed(decimals)) + 0;
    this.decimals = decimals;
  }
  toString() { return fmtFixed(this.value, this.decimals); }
  get numFmt() { return this.decimals ? `#,##0.${'0'.repeat(this.decimals)}` : '#,##0'; }
}

const figure = (v: number | undefined, d: number): Figure | '—' => (v === undefined || !Number.isFinite(v) ? '—' : new Figure(v, d));

/** The one format of each kind of calculated value, the same in every document. Ratings, sizes and
 * limits someone typed are not calculated: they print as written (`plain`). */
export const fig = {
  /** kW, kVA, kvar. */
  power: (v: number | undefined) => figure(v, 2),
  /** A. */
  current: (v: number | undefined) => figure(v, 1),
  /** kA. */
  fault: (v: number | undefined) => figure(v, 2),
  /** Voltage drop and margins, %. */
  pct: (v: number | undefined) => figure(v, 2),
  /** Loading and shares of a rating, %. */
  loading: (v: number | undefined) => figure(v, 1),
  /** Power factor, demand ratio. */
  ratio: (v: number | undefined) => figure(v, 2),
  /** A power factor held against a target: at 2 decimals 0.947 would read as a 0.95 target met. */
  pf3: (v: number | undefined) => figure(v, 3),
  /** V. */
  volts: (v: number | undefined) => figure(v, 1),
  /** kWh. */
  energy: (v: number | undefined) => figure(v, 1),
  /** Room and tray dimensions, calculated areas: m, m². */
  size: (v: number | undefined) => figure(v, 2),
  /** kg/m. */
  weight: (v: number | undefined) => figure(v, 2),
  /** Ω. */
  ohm: (v: number | undefined) => figure(v, 4),
  /** Any other calculated value, with its own decimals. */
  fixed: figure,
  /** Ratings, sizes and bank kvar, as an engineer writes them: no comma, no trailing zeros (1600, 12.5). A real number in Excel. */
  plain: (v: number | undefined, d = 0): number | '—' => (v === undefined || !Number.isFinite(v) ? '—' : Number(v.toFixed(d)))
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Day, month index and year. An ISO date is the day as written, never moved by the time zone; a time is read in local time.
 * Undefined for text that isn't a date. */
function dayOf(d: string | number | Date): [number, number, number] | undefined {
  const iso = typeof d === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.trim()) : null;
  if (iso) {
    const [y, m, day] = [+iso[1], +iso[2], +iso[3]];
    const real = new Date(Date.UTC(y, m - 1, day)); // 2026-02-31 is not a date
    return real.getUTCMonth() === m - 1 && real.getUTCDate() === day ? [day, m - 1, y] : undefined;
  }
  if (typeof d === 'string' && !/^\d{4}-\d{2}-\d{2}T/.test(d.trim())) return undefined;
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? undefined : [t.getDate(), t.getMonth(), t.getFullYear()];
}

/** 1 Nov 2026, the same on every computer. Text that isn't a date stays as typed; no date prints as nothing. */
export const fmtDate = (d: string | number | Date | undefined) => {
  if (d === undefined) return '';
  const p = dayOf(d);
  return p ? `${p[0]} ${MONTHS[p[1]].slice(0, 3)} ${p[2]}` : String(d);
};

/** How Excel shows `excelDate`: 1 Nov 2026. */
export const DATE_NUMFMT = 'd mmm yyyy';

/** An ISO date as an Excel cell: a real date, so a register column still sorts by date. Text that isn't a date stays as typed. */
export const excelDate = (d: string): Date | string => {
  const p = dayOf(d);
  return p ? new Date(Date.UTC(p[2], p[1], p[0])) : d;
};

/** 15 October 2026, for covers and headings. Text that isn't a date stays as typed. */
export const fmtDateLong = (d: string | number | Date) => {
  const p = dayOf(d);
  return p ? `${p[0]} ${MONTHS[p[1]]} ${p[2]}` : String(d);
};

/** 14:05, on the 24-hour clock on every computer. */
export const fmtTime = (d: string | number | Date) => {
  const t = new Date(d);
  return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
};
