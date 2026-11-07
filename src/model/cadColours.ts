/** Design CAD colours: a named colour, an index colour 1–255 (the colour numbers of DXF files, kept as the number so a
 * saved drawing can write it as it is), or a true colour (#rrggbb). Stored on layers and objects as text:
 * '' = ByLayer (or "as drawn" for the architect's layers), 'idx:8' = colour 8, '#ff3b30' = a true colour.
 * Screen only: sheets print black-and-white. */

const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;

/** RGB of a hue (degrees) at value v (0–255) and saturation s (0–1). */
function hsv(h: number, s: number, v: number): string {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return hex(r + m, g + m, b + m);
}

const BASIC = ['#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ffffff', '#808080', '#c0c0c0'];
const GREYS = ['#333333', '#505050', '#696969', '#828282', '#bebebe', '#ffffff'];
const SHADE_V = [255, 165, 127, 76, 38];

/** Screen colour of each index, 1–255 (0 is unused). 10–249: 24 hues 15° apart, each in five shades, full and half
 * saturation; 250–255: greys. */
export const INDEX_COLOURS: string[] = Array.from({ length: 256 }, (_, i) => {
  if (i >= 1 && i <= 9) return BASIC[i - 1];
  if (i >= 250) return GREYS[i - 250];
  if (i >= 10) { const k = i - 10, h = Math.floor(k / 10) * 15, n = k % 10; return hsv(h, n % 2 ? 0.5 : 1, SHADE_V[Math.floor(n / 2)]); }
  return '';
});

const BASIC_NAMES = ['Red', 'Yellow', 'Green', 'Cyan', 'Blue', 'Magenta', 'White / black', 'Grey', 'Light grey'];

/** The named colours offered first (the same as before index colours). */
export const NAMED_COLOURS: { id: string; label: string }[] = [
  { id: '#ffffff', label: 'White / black' }, { id: '#ff3b30', label: 'Red' }, { id: '#ffcc00', label: 'Yellow' },
  { id: '#34c759', label: 'Green' }, { id: '#32ade6', label: 'Cyan' }, { id: '#0a84ff', label: 'Blue' }, { id: '#bf5af2', label: 'Magenta' },
  { id: '#8e8e93', label: 'Grey' }, { id: '#48484a', label: 'Dark grey' }
];

/** The index of 'idx:N' (1–255), else undefined. */
export function colourIndex(c: string | undefined): number | undefined {
  const m = c?.match(/^idx:(\d{1,3})$/);
  const n = m ? Number(m[1]) : NaN;
  return n >= 1 && n <= 255 ? n : undefined;
}
export const indexColour = (n: number): string => `idx:${n}`;

/** The CSS colour to draw with ('' / undefined = none of its own). */
export function colourCss(c: string | undefined): string | undefined {
  if (!c) return undefined;
  const n = colourIndex(c);
  if (n !== undefined) return INDEX_COLOURS[n];
  return /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : undefined;
}

/** How a colour is named in the app: "Colour 8", "Red", "RGB 18,171,52". */
export function colourLabel(c: string | undefined, blank = 'ByLayer'): string {
  if (!c) return blank;
  const n = colourIndex(c);
  if (n !== undefined) return n <= 9 ? `${BASIC_NAMES[n - 1]} (${n})` : `Colour ${n}`;
  const named = NAMED_COLOURS.find((x) => x.id === c.toLowerCase());
  if (named) return named.label;
  const v = colourCss(c);
  return v ? `RGB ${[1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16)).join(',')}` : blank;
}

/** A colour typed by the engineer: an index (8, or "colour 8"), #rrggbb / #rgb, or "r,g,b". Undefined when it is none. */
export function parseColour(text: string): string | undefined {
  const t = text.trim().toLowerCase().replace(/^colou?r\s*/, '');
  if (/^\d{1,3}$/.test(t)) { const n = Number(t); return n >= 1 && n <= 255 ? indexColour(n) : undefined; }
  if (/^#?[0-9a-f]{6}$/.test(t)) return `#${t.replace('#', '')}`;
  if (/^#?[0-9a-f]{3}$/.test(t)) return `#${t.replace('#', '').split('').map((x) => x + x).join('')}`;
  const rgb = t.match(/^(?:rgb\s*)?\(?\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*\)?$/);
  if (rgb) { const v = rgb.slice(1).map(Number); return v.every((x) => x <= 255) ? hex(v[0], v[1], v[2]) : undefined; }
  return undefined;
}
