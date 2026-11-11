import type { Project } from '../types';
import { plainNotes, type LegendItem } from './legendLayout';
import { earthingLayout, genTag, kindInfo, pitStatus, txUnits, unitKey, unitName, type EarthItem, type EarthLayout } from '../model/earthingPlan';
import { mainBoards, txTag } from '../model/transformers';
import { obstaclesFromSvg, placeTags, type CableTag } from './tagPlacer';
import { escapeHtmlAttr } from '../util/escape';

/** Earthing schematic drawing (printable SVG), in the SLD drawing style.
 *
 * Earth only — no power cables. Earthing system "Shared HV body earth". One band
 * per substation: each RMU followed by the transformers it feeds (the tank /
 * body earth bar of each connected to a stud on the RMU earth bar; the RMU bar
 * to its 2 body-earth pits; the neutral to its own pit), then the LV room (each
 * main board as an earth bar, incoming earths from the sub-boards from the
 * right). Every earth bar has a separate conductor with test link to each pit.
 * Pits are drawn as in the DEWA reference sheet (inspection pit over a chamber
 * with the electrode, tag beside it) and linked pit to pit: neighbours above
 * the pits, the next group along the bottom. Legend and notes at the bottom. */

const PIT = 210, GREEN = '#1a7f37';
/** Widths a substation row wraps before (an LV room or generators beside it: 300 more). The printed sheet tries each
 * and keeps the one that prints largest; the working view uses the first. */
const WRAPS = [2900, 2300, 1800, 1400];
/** Marks a pit named in a "to EP-…" stub, so a stub to a pit on another sheet can name that sheet. */
const REF = '\u0001', REF_END = '\u0002';
const BAND_H = 600; // one row: equipment, conductors, pits and links
/** Width : height of a landscape sheet's drawing area (A-series, after the title block and legend column). */
const SHEET_ASPECT = 1.4;
/** Width of the pit schedule when it takes a column of its own. */
const SCHEDULE_W = 1300;
/** Escaped for text and quoted attributes (project data is untrusted). */
const esc = escapeHtmlAttr;
const ln = (x1: number, y1: number, x2: number, y2: number, w = 1.3, c = '#111') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${w}"/>`;

/** IEC 60617 load-break switch (switch-disconnector), open, on a vertical line centred at (x, y). */
const lbs = (x: number, y: number) => `${ln(x, y + 14, x, y + 6)}${ln(x, y + 6, x - 7, y - 6)}${ln(x - 3, y - 6, x + 3, y - 6)}<circle cx="${x}" cy="${y - 6}" r="1.8" fill="#fff" stroke="#111" stroke-width="1"/>${ln(x, y - 6, x, y - 12)}`;
/** IEC 60617 fuse (rectangle with the line through it). */
const fuse = (x: number, y: number) => `<rect x="${x - 3.5}" y="${y - 7}" width="7" height="14" fill="#fff" stroke="#111" stroke-width="1.1"/>${ln(x, y - 7, x, y + 7, 1)}`;

/** RMU: two ring load-break switches and one T-off switch-fuse on a common busbar, in a dashed enclosure (110 × 66). */
export function rmuSymbol(cx: number, top: number, enclosure = true): string {
  const w = 110, h = 66, l = cx - w / 2;
  const bus = top + 18;
  const xs = [cx - 34, cx, cx + 34];
  let s = enclosure ? `<rect x="${l}" y="${top}" width="${w}" height="${h}" fill="#fff" stroke="#111" stroke-width="1.2" stroke-dasharray="5 2"/>` : '';
  s += ln(xs[0], bus, xs[2], bus, 2);
  for (const x of xs) s += ln(x, bus, x, bus + 8);
  s += lbs(xs[0], bus + 20) + ln(xs[0], bus + 34, xs[0], top + h);
  s += lbs(xs[1], bus + 20) + ln(xs[1], bus + 34, xs[1], top + h);
  s += lbs(xs[2], bus + 20) + fuse(xs[2], bus + 41) + ln(xs[2], bus + 48, xs[2], top + h);
  return s;
}

/** Transformer: two overlapping circles (r). */
const txSymbol = (cx: number, cy: number, r = 13) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#111" stroke-width="1.3"/><circle cx="${cx}" cy="${cy + r * 1.4}" r="${r}" fill="none" stroke="#111" stroke-width="1.3"/>`;
/** Earth bar (copper, with studs) and its ID; a conductor to each pit leaves from the bar, each through a test link. */
const BAR_W = 64, CU = '#b86b2b', TAG = '#1d4f8f';
const earthBar = (cx: number, y: number, id: string, w = BAR_W) => {
  let s = `<rect x="${cx - w / 2}" y="${y}" width="${w}" height="10" rx="2" fill="${CU}" fill-opacity="0.18" stroke="${CU}" stroke-width="1.3"/>`;
  for (let i = 0, n = Math.floor((w - 8) / 14); i < n; i++) s += `<circle cx="${cx - w / 2 + 11 + i * 14}" cy="${y + 5}" r="2.4" fill="#111"/>`;
  return s + idTag(cx + 6, y + 24, id);
};
/** An ID in a rounded outline (earth bars), starting at x. */
const idTag = (x: number, y: number, id: string) => {
  const w = 10 + id.length * 5.6;
  return `<rect x="${x}" y="${y - 10}" width="${w}" height="14" rx="7" fill="#fff" stroke="${TAG}" stroke-width="0.8"/><text x="${x + w / 2}" y="${y + 1}" text-anchor="middle" font-size="8.5" font-weight="bold" fill="${TAG}">${esc(id)}</text>`;
};
/** Test link on a vertical conductor at (x, y): a box the conductor passes through, marked TL. */
const testLink = (x: number, y: number) => `<rect x="${x - 6}" y="${y - 5}" width="12" height="10" fill="#fff" stroke="#111" stroke-width="1"/>${ln(x - 6, y, x + 6, y, 1)}<text x="${x - 9}" y="${y + 3}" text-anchor="end" font-size="7" fill="#5b6b82">TL</text>`;
/** Cable tag: a dot on the cable, a leader and the size in a box (placed clear of the drawing by placeTags). */
const cableTag = (t: ReturnType<typeof placeTags>[number]) =>
  `<g class="ctag"><circle cx="${t.dot[0]}" cy="${t.dot[1]}" r="2" fill="${GREEN}"/><path d="M${t.dot[0]} ${t.dot[1]} L${t.elbow[0]} ${t.elbow[1]} H${t.end[0]}" stroke="#5b6b82" stroke-width="0.9" fill="none"/>` +
  `<rect x="${t.box.x1}" y="${t.box.y1}" width="${t.box.x2 - t.box.x1}" height="${t.box.y2 - t.box.y1}" rx="3" fill="#fff" stroke="#5b6b82" stroke-width="0.8"/><text x="${(t.box.x1 + t.box.x2) / 2}" y="${t.box.y2 - 4.5}" text-anchor="middle" font-size="8">${esc(t.text)}</text></g>`;
/** Filled arrowhead with its tip at (x, y), pointing up / left. */
const headUp = (x: number, y: number) => `<path d="M${x - 3.5} ${y + 8} L${x} ${y} L${x + 3.5} ${y + 8} Z" fill="${GREEN}"/>`;
const headLeft = (x: number, y: number) => `<path d="M${x + 8} ${y - 3.5} L${x} ${y} L${x + 8} ${y + 3.5} Z" fill="${GREEN}"/>`;
/** Words wrapped to lines of at most `max` characters. */
const wrapText = (text: string, max: number) => text.split(' ').reduce<string[]>((lines, w) => {
  const last = lines[lines.length - 1];
  if (last !== undefined && (last + ' ' + w).length <= max) lines[lines.length - 1] = `${last} ${w}`;
  else lines.push(w);
  return lines;
}, []);
/** Dimension line between two pits with its text above. */
const separation = (x1: number, x2: number, y: number, label: string) =>
  `${ln(x1, y, x2, y, 0.7, '#5b6b82')}${ln(x1, y - 4, x1, y + 4, 0.7, '#5b6b82')}${ln(x2, y - 4, x2, y + 4, 0.7, '#5b6b82')}<text x="${(x1 + x2) / 2}" y="${y - 4}" text-anchor="middle" font-size="8" fill="#5b6b82">${esc(label)}</text>`;

/** Earth pit as in the DEWA reference sheet: the inspection pit (circle, centre y — conductors land on its top)
 * over a dashed chamber with the electrode. The circle (class ph) takes the test-status fill on screen. */
const pitSymbol = (x: number, y: number) => `<circle class="ph" cx="${x}" cy="${y}" r="6" fill="#fff" stroke="#111" stroke-width="1.3"/>${ln(x, y + 6, x, y + 26, 1.2)}<rect x="${x - 24}" y="${y + 12}" width="48" height="46" fill="none" stroke="#111" stroke-width="1" stroke-dasharray="4 3"/>${ln(x - 12, y + 26, x + 12, y + 26)}${ln(x - 8, y + 32, x + 8, y + 32)}${ln(x - 4, y + 38, x + 4, y + 38)}`;
/** Link level above a pit row (centre py): out of the pit's top at 45° to here. */
const LK = 18;
/** Horizontal run at y from x1 to x2, hopping (a small arc) over the vertical conductors at xs: crossed, not connected. */
const hopRun = (x1: number, x2: number, y: number, xs: number[]) => {
  const dir = Math.sign(x2 - x1) || 1;
  const hs = xs.filter((h) => (h - x1) * dir > 6 && (x2 - h) * dir > 6).sort((a, b) => dir * (a - b));
  let d = `M${x1} ${y}`;
  for (const h of hs) d += ` H${h - dir * 5} a5 5 0 0 ${dir > 0 ? 1 : 0} ${dir * 10} 0`;
  return `${d} H${x2}`;
};

/** Every transformer unit (TX-1A, TX-1B … where a board has several, per the transformer sizing), in drawing order. */
function transformerUnits(project: Project) {
  const units = txUnits(project);
  return mainBoards(project).filter((b) => b.sourceKva).flatMap((b) => { const n = units.get(b.id) ?? 1; return Array.from({ length: n }, (_, i) => ({ b, u: i + 1, n, name: unitName(txTag(project, b.id) ?? b.id, i + 1, n) })); });
}

/** Earth bar IDs, numbered in drawing order: EB-RMU-01 …, each transformer's EB-TX(N)-nn / EB-TX(B)-nn, each generator's EB-GEN(N)-nn / EB-GEN(B)-nn. */
function earthBarIds(project: Project, L: EarthLayout): Map<string, string> {
  const two = (n: number) => String(n).padStart(2, '0');
  const barId = new Map<string, string>();
  L.items.filter((i) => i.kind === 'rmu').forEach((i, n) => barId.set(i.key, `EB-RMU-${two(n + 1)}`));
  transformerUnits(project).forEach(({ b, u }, i) => { barId.set(unitKey(`txn:${b.id}`, u), `EB-TX(N)-${two(i + 1)}`); barId.set(unitKey(`txb:${b.id}`, u), `EB-TX(B)-${two(i + 1)}`); });
  project.boards.filter((b) => b.standby).forEach((b, n) => { barId.set(`gn:${b.id}`, `EB-GEN(N)-${two(n + 1)}`); barId.set(`gb:${b.id}`, `EB-GEN(B)-${two(n + 1)}`); });
  return barId;
}

/** Pit tags, as on the reference sheet: EP-RMU-1A / 1B, EP-TX(N)-01, EP-MDB-1A … by pit test ID (E1, E2 …).
 * The earthing schematic and the earthing riser both print these. */
export function pitTags(project: Project, L: EarthLayout = earthingLayout(project), barId = earthBarIds(project, L)): Map<string, string> {
  const letter = (i: number, n: number) => (n > 1 ? String.fromCharCode(65 + i) : '');
  const tagOf = new Map<string, string>();
  for (const it of L.items) {
    const ps = L.pits.filter((p) => p.itemKey === it.key), bar = barId.get(it.key);
    const base = it.kind === 'rmu' ? `EP-RMU-${Number(bar?.slice(-2) ?? 0)}` : bar ? bar.replace(/^EB-/, 'EP-') : `EP-${it.equipment}`;
    ps.forEach((p, i) => tagOf.set(p.id, it.kind === 'rmu' ? `${base}${String.fromCharCode(65 + i)}` : `${base}${letter(i, ps.length)}`));
  }
  return tagOf;
}

function drawAt(project: Project, L: EarthLayout, includeSchedule: boolean, opts: EarthingOpts, wrapAt: number) {
  const SUB_MAX_W = wrapAt, MAX_W = wrapAt + 300;
  /** Everything drawn, each part with the band row it belongs to (rows are moved into columns at the end). */
  const parts: { row: number; s: string }[] = [];
  /** The row being drawn: the band at y, or `at` for the pits, links and tags drawn after the bands. */
  let at: number | undefined;
  const rowAt = (v: number) => Math.max(0, Math.floor((v - 50) / BAND_H));
  const out = {
    push: (...s: string[]) => { const row = at ?? rowAt(y); for (const x of s) parts.push({ row, s: x }); },
    join: (sep: string) => parts.map((p) => p.s).join(sep)
  };
  /** Cable size tags, placed at the end clear of everything else. */
  const tags: CableTag[] = [];
  const pitX = new Map<string, number>(), pitY = new Map<string, number>();
  const pitsOf = (it: EarthItem) => L.pits.filter((p) => p.itemKey === it.key);
  const mm = L.conductorMm2;
  const txBoards = mainBoards(project).filter((b) => b.sourceKva);

  /** A separate conductor from the earth bar (centre cx, top by) to each of the item's pits (row at py),
   * each through its own test link. The conductors leave the bar's left half (its ID is under the right
   * half) and run to the pits on their own levels, so they never cross; the pits are linked in the soil. */
  const toPits = (it: EarthItem, cx: number, by: number, py: number, barW: number, studs?: number[]): number => {
    const ps = pitsOf(it);
    if (!ps.length) { out.push(`<path d="M${cx} ${by + 10} V${by + 52}" stroke="${GREEN}" stroke-width="1.6" fill="none"/>`, testLink(cx, by + 46), `<text x="${cx}" y="${py}" text-anchor="middle" fill="#c0392b" font-weight="bold">NO PIT</text>`); return cx; }
    const xs = ps.map((p) => pitX.get(p.id)!).sort((a, b) => a - b);
    let gap = xs.length > 1 ? Math.min(16, (barW / 2 - 6) / (xs.length - 1)) : 0;
    let from = xs.map((_, i) => cx - (xs.length - 1 - i) * gap);
    if (studs && studs.length >= xs.length) { from = studs.slice(0, xs.length); gap = xs.length > 1 ? from[1] - from[0] : 0; }
    // Conductors going the same way: the one starting nearest the pits runs lowest.
    const level = new Map<number, number>();
    const right = xs.map((_, i) => i).filter((i) => xs[i] - from[i] > 0.5), left = xs.map((_, i) => i).filter((i) => from[i] - xs[i] > 0.5).reverse();
    for (const grp of [right, left]) grp.forEach((i, k) => level.set(i, py - LK - 14 - k * 8));
    xs.forEach((px, i) => {
      const sx = from[i], ly = level.get(i);
      out.push(`<path d="M${sx} ${by + 10} V${ly ?? py - 6}${ly !== undefined ? ` H${px} V${py - 6}` : ''}" stroke="${GREEN}" stroke-width="1.6" fill="none"/>`);
      // Close conductors: test links staggered so they never touch.
      out.push(testLink(sx, by + 46 + (gap < 18 ? (i % 2) * 14 : 0)).replace(/<text[^>]*>TL<\/text>/, i ? '' : '$&'));
    });
    const lowest = Math.min(...xs.map((_, i) => level.get(i) ?? py));
    // One size tag for the bar's cables, on the rightmost one, below the test links.
    tags.push({ x: from[from.length - 1], y0: by + 72, y1: (lowest === py ? py - 6 : lowest) - 10, text: `${xs.length > 1 ? `${xs.length} × ` : ''}1C ${mm} mm² Cu/PVC G/Y` });
    return from[0];
  };
  const barId = earthBarIds(project, L);
  const txUnitList = transformerUnits(project);
  const genBoards = project.boards.filter((b) => b.standby);
  /** Equipment → earth bar → test link → pits; the size called out on the conductor to the pits. */
  const BAR_Y = 190;
  /** Each RMU's earth bar (centre x, top y): its studs take the transformer tank / body cables from above
   * (stud 4 for the first transformer, stud 3 for the second); verts = conductors drawn since, to hop over. */
  const rmuBar = new Map<string, { x: number; y: number; n: number; verts: number[] }>();
  const viaBar = (it: EarthItem, cx: number, from: string, top: number, py: number, studs?: number[]) => {
    const by = top + BAR_Y;
    out.push(`<path d="${from} V${by}" stroke="${GREEN}" stroke-width="1.6" fill="none"/>`, earthBar(cx, by, barId.get(it.key) ?? 'EB'));
    if (pitsOf(it).length || !it.sharesPitsOf) toPits(it, cx, by, py, BAR_W, studs);
    // Transformer tank / body: from its bar's first stud, up and across to its own stud on the RMU earth bar.
    if (it.sharesPitsOf) {
      const r = rmuBar.get(it.sharesPitsOf), to = barId.get(it.sharesPitsOf) ?? 'RMU';
      const k = r ? r.n++ : 0, lane = by - 14 - Math.min(k, 3) * 16, rise = cx - 21;
      if (r && r.y === by) {
        const stud = r.x + (k === 0 ? 21 : 7);
        out.push(`<path data-bond="${esc(it.key)}" d="M${rise} ${by} V${lane}${hopRun(rise, stud, lane, r.verts).replace(/^M\S+ \S+/, '')} V${by}" stroke="${GREEN}" stroke-width="1.6" fill="none"/>`);
        const lo = Math.max(stud, ...r.verts.filter((v) => v < rise));
        out.push(`<text x="${(lo + rise) / 2}" y="${lane - 4}" text-anchor="middle" font-size="8" fill="${GREEN}">${esc(k === 0 ? `1C ${mm} mm² to ${to}` : `to ${to}`)}</text>`);
      } else {
        // The RMU is on another row: the cable ends with the bar it goes to.
        out.push(`<path data-bond="${esc(it.key)}" d="M${rise} ${by} V${lane} h-24" stroke="${GREEN}" stroke-width="1.6" fill="none"/><text x="${rise - 28}" y="${lane + 3}" text-anchor="end" font-size="8" fill="${GREEN}">to ${esc(to)}</text>`);
      }
    }
  };
  /** "≥ 6 m" between the first and last pit of one item, at depth dy below the pits. */
  const spread = (it: EarthItem, py: number, dy: number) => {
    const xs = pitsOf(it).map((p) => pitX.get(p.id)!);
    if (xs.length > 1) out.push(separation(Math.min(...xs), Math.max(...xs), py + dy, '6 m minimum separation'));
  };
  const place = (it: EarthItem, from: number, width: number, py: number) => {
    const ps = pitsOf(it);
    const mid = from + width / 2;
    ps.forEach((p, i) => { pitX.set(p.id, mid + (i - (ps.length - 1) / 2) * PIT); pitY.set(p.id, py); });
    return mid;
  };
  const zone = (x: number, y: number, w: number, label: string) => out.push(`<rect x="${x}" y="${y}" width="${w}" height="${BAND_H - 40}" fill="none" stroke="#999" stroke-dasharray="4 3"/><text x="${x + 8}" y="${y + 14}" font-size="8" font-weight="bold">${esc(label)}</text>`);

  // Widths, to decide whether a substation's LV room fits beside it.
  const rmuW = (it: EarthItem) => Math.max(160, pitsOf(it).length * PIT) + 20;
  const lvW = (it: EarthItem) => Math.max(360, pitsOf(it).length * PIT) + 20; // room for the cable tags beside the board's earth conductor

  let y = 50;
  /** Right end of each band row (the row's width). */
  const rowRight: number[] = [];
  const endRow = (x: number) => { rowRight[rowAt(y)] = Math.max(rowRight[rowAt(y)] ?? 0, x); };
  const groups = [...new Set(L.items.map((i) => i.group))];
  for (const g of groups) {
    const rmus = L.items.filter((i) => i.group === g && i.kind === 'rmu');
    const txs = txBoards.filter((b) => L.items.some((i) => i.key === `txn:${b.id}` && i.group === g));
    const lvs = L.items.filter((i) => i.group === g && (i.kind === 'lv' || (i.kind === 'sub' && i.pits > 0)));
    const lvWidth = lvs.reduce((s, i) => s + lvW(i), 0) + 40;
    const name = g.toUpperCase();

    // ---- Substation zone ----------------------------------------------------
    let x = 60;
    let TOP = y, PY = y + 410;
    // A substation wider than the sheet continues on the next row (each row its own zone).
    const wrap = (w: number) => {
      if (x === 60 || x + w <= SUB_MAX_W) return;
      zone(40, TOP, x - 40, name);
      endRow(x);
      y += BAND_H; TOP = y; PY = y + 410; x = 60;
    };
    if (rmus.length || txs.length) {
      const drawn = new Set<string>();
      let afterTx = false;
      const drawRmu = (r: EarthItem) => {
        // Room for the previous transformer's body-bar ID: the RMU's bar sits left of the RMU.
        if (afterTx) x += 70;
        afterTx = false;
        wrap(rmuW(r));
        const w = rmuW(r) - 20, cx = place(r, x, w, PY);
        const fed = txUnitList.filter(({ b }) => txs.includes(b) && (b.rmu?.trim() || `RMU (${txTag(project, b.id)})`) === r.equipment).map((t) => t.name);
        out.push(rmuSymbol(cx, TOP + 50));
        out.push(`<text x="${cx}" y="${TOP + 42}" text-anchor="middle" font-weight="bold">${esc(r.equipment)}</text><text x="${cx}" y="${TOP + 130}" text-anchor="middle" font-size="8">feeds ${esc(fed.join(', ') || '—')}</text>`);
        // Body earth from the enclosure's left side to stud 1 of its earth bar; the pit cables leave studs 1 and 2.
        const rx = cx - 64;
        out.push(`<circle cx="${cx - 55}" cy="${TOP + 106}" r="2.5" fill="${GREEN}"/>`);
        viaBar(r, rx, `M${cx - 55} ${TOP + 106} H${rx - 21}`, TOP, PY, [rx - 21, rx - 7]);
        rmuBar.set(r.key, { x: rx, y: TOP + BAR_Y, n: 0, verts: [] });
        spread(r, PY, 76);
        x += w + 20;
      };
      const drawTx = ({ b, u, name: unitTag }: (typeof txUnitList)[number]) => {
        drawn.add(unitKey(`txb:${b.id}`, u));
        afterTx = true;
        const n = L.items.find((i) => i.key === unitKey(`txn:${b.id}`, u))!, bd = L.items.find((i) => i.key === unitKey(`txb:${b.id}`, u))!;
        const wn = Math.max(100, pitsOf(n).length * PIT), wb = Math.max(100, pitsOf(bd).length * PIT);
        wrap(wn + wb + 20);
        // Tank / body toward the RMU (left), star point away from it.
        const bx = place(bd, x, wb, PY), nx = place(n, x + wb, wn, PY);
        const cx = (nx + bx) / 2, cy = TOP + 80;
        out.push(txSymbol(cx, cy));
        out.push(`<text x="${cx}" y="${cy - 22}" text-anchor="middle" font-weight="bold">${esc(unitTag)}</text><text x="${cx}" y="${cy - 34}" text-anchor="middle" font-size="8">${b.sourceKva} kVA · ${esc(b.vectorGroup ?? 'Dyn11')}</text>`);
        out.push(`<text x="${bx - 5}" y="${cy + 30}" text-anchor="end" font-size="8" fill="#5b6b82">tank / body</text><text x="${nx + 5}" y="${cy + 30}" font-size="8" fill="#5b6b82">star point (N)</text>`);
        viaBar(bd, bx, `M${cx - 13} ${cy + 18} H${bx}`, TOP, PY);
        viaBar(n, nx, `M${cx + 13} ${cy + 18} H${nx}`, TOP, PY);
        // The next transformer's tank cable to the RMU bar passes over these two conductors.
        const rb = bd.sharesPitsOf ? rmuBar.get(bd.sharesPitsOf) : undefined;
        if (rb) rb.verts.push(bx, nx);
        spread(n, PY, 76);
        spread(bd, PY, 76);
        // Neutral and body pit groups kept apart (never joined)
        const bLast = Math.max(...pitsOf(bd).map((p) => pitX.get(p.id)!)), nFirst = Math.min(...pitsOf(n).map((p) => pitX.get(p.id)!));
        if (pitsOf(n).length && pitsOf(bd).length) out.push(separation(bLast, nFirst, PY + 128, '≥ 6 m  N ↔ body'));
        x += wn + wb + 20;
      };
      // Each RMU followed by the transformers it feeds, so their body conductors reach the shared pits
      // without crossing another RMU's.
      const units = txUnitList.filter((t) => txs.includes(t.b));
      const bodyOf = (t: (typeof units)[number]) => L.items.find((i) => i.key === unitKey(`txb:${t.b.id}`, t.u));
      for (const r of rmus) { drawRmu(r); for (const t of units) if (bodyOf(t)?.sharesPitsOf === r.key) drawTx(t); }
      for (const t of units) if (!drawn.has(unitKey(`txb:${t.b.id}`, t.u))) drawTx(t);
      zone(40, TOP, x - 40, name);
    }

    // ---- LV room: beside the substation, or on its own row when too wide -----
    let LT = TOP, lvStart = x === 60 ? 40 : x + 10;
    if (x > 60 && x + lvWidth > MAX_W) { endRow(x); y += BAND_H; LT = y; lvStart = 40; }
    let LP = LT + 410;
    x = lvStart + 20;
    const lvTitle = groups.length > 1 ? `LV ROOM — ${name}` : 'LV ROOM';
    for (const it of lvs) {
      // A long LV room continues on the next row, like the substation.
      if (x > lvStart + 20 && x + lvW(it) > SUB_MAX_W) { zone(lvStart, LT, x - lvStart, lvTitle); endRow(x); y += BAND_H; LT = y; LP = LT + 410; lvStart = 40; x = 60; }
      const w = lvW(it) - 20, cx = place(it, x, w, LP);
      const main = it.kind === 'lv';
      // The board: N bar isolated from earth (the neutral is earthed once, at the transformer star point),
      // and the E bar with the panel body (enclosure / frame) bonded to it. No N–E link in an LV panel.
      const bx = cx - 105, eY = LT + 104;
      out.push(`<rect x="${bx}" y="${LT + 46}" width="210" height="84" fill="#fff" stroke="#111" stroke-width="1.4"/><text x="${bx}" y="${LT + 40}" font-weight="bold">${esc(it.equipment)}</text>`);
      out.push(`${ln(bx + 22, LT + 70, bx + 196, LT + 70, 2.6)}<text x="${bx + 12}" y="${LT + 74}" text-anchor="middle" font-weight="bold">N</text><text x="${bx + 196}" y="${LT + 84}" text-anchor="end" font-size="8" fill="#5b6b82">N isolated from earth</text>`);
      out.push(`${ln(bx + 22, eY, bx + 196, eY, 2.6, GREEN)}<text x="${bx + 12}" y="${eY + 4}" text-anchor="middle" font-weight="bold" fill="${GREEN}">E</text>`);
      // Panel body bonded to the E bar: from the enclosure wall at the bottom to the bar.
      out.push(`<circle cx="${bx + 60}" cy="${LT + 130}" r="2.5" fill="${GREEN}"/><path d="M${bx + 60} ${LT + 130} V${eY}" stroke="${GREEN}" stroke-width="1.4" fill="none"/><circle cx="${bx + 60}" cy="${eY}" r="2.5" fill="${GREEN}"/><text x="${bx + 66}" y="${LT + 124}" font-size="8" fill="#5b6b82">panel body</text>`);
      // Board E bar → main earth bar → test link → pits.
      const by = LT + 236, mx = cx + 70;
      out.push(`<circle cx="${mx}" cy="${eY}" r="3" fill="${GREEN}"/><path d="M${mx} ${eY} V${by}" stroke="${GREEN}" stroke-width="1.6" fill="none"/>`);
      tags.push({ x: mx, y0: LT + 138, y1: by - 10, text: `1C ${mm} mm² Cu/PVC G/Y` });
      out.push(earthBar(cx, by, `EB-LV-${it.equipment}`, 160));
      const first = toPits(it, cx, by, LP, 160);
      out.push(`<text x="${first - 8}" y="${by + 28}" text-anchor="end">${main ? 'MAIN EARTH BAR' : 'EARTH BAR'}</text>`);
      // Bonding of metal parts (main boards): arrows up from the bar under a brace, the parts listed above.
      if (main && L.bonding.length) {
        const n = Math.min(L.bonding.length, 6), x0 = cx - 72, top = by - 34;
        for (let i = 0; i < n; i++) out.push(`<path d="M${x0 + i * 9} ${by} V${top + 6}" stroke="${GREEN}" stroke-width="1.2" fill="none"/>`, headUp(x0 + i * 9, top));
        out.push(`<path d="M${x0 - 3} ${top} q0 -6 6 -6 h${(n - 1) * 9 - 6} q6 0 6 6" stroke="#5b6b82" stroke-width="0.8" fill="none"/>`);
        const lines = wrapText(`BONDED: ${L.bonding.join(' · ')}`, 30);
        lines.forEach((t, i) => out.push(`<text x="${x0 - 4}" y="${top - 12 - (lines.length - 1 - i) * 10}" font-size="8" fill="#5b6b82">${esc(t)}</text>`));
      }
      // Incoming earths from the boards this one feeds (named), into the bar's right end.
      const fed = project.boards.filter((b) => b.upstreamId === it.equipment).map((b) => b.id);
      if (fed.length) {
        const ex = cx + 80, shown = fed.slice(0, 3), more = fed.length - shown.length;
        out.push(`<path d="M${ex + 54} ${by + 5} H${ex + 8}" stroke="${GREEN}" stroke-width="1.2" stroke-dasharray="7 3 1.5 3" fill="none"/>`, headLeft(ex, by + 5));
        [...shown.map((id) => `from ${id}`), ...(more ? [`+ ${more} more`] : [])].forEach((t, i) => out.push(`<text x="${ex + 12}" y="${by + 24 + i * 10}" font-size="8" fill="${GREEN}">${esc(t)}</text>`));
      }
      spread(it, LP, 76);
      x += w + 20;
    }
    if (lvs.length) zone(lvStart, LT, x - lvStart, lvTitle);

    // ---- Standby generators: beside the LV room, or on their own row ----------
    const gens = genBoards.filter((b) => L.items.some((i) => i.key === `gn:${b.id}` && i.group === g));
    if (gens.length) {
      const genW = (b: (typeof gens)[number]) => {
        const n = L.items.find((i) => i.key === `gn:${b.id}`)!, bd = L.items.find((i) => i.key === `gb:${b.id}`)!;
        return Math.max(110, pitsOf(n).length * PIT) + Math.max(170, pitsOf(bd).length * PIT) + 20;
      };
      let GT = LT, gStart = x === 60 ? 40 : x + 10;
      if (x > 60 && x + gens.reduce((s, b) => s + genW(b), 0) + 40 > SUB_MAX_W) { endRow(x); y += BAND_H; GT = y; gStart = 40; }
      let GP = GT + 410;
      x = gStart + 20;
      const gTitle = groups.length > 1 ? `STANDBY GENERATOR — ${name}` : 'STANDBY GENERATOR';
      for (const b of gens) {
        if (x > gStart + 20 && x + genW(b) > SUB_MAX_W) { zone(gStart, GT, x - gStart, gTitle); endRow(x); y += BAND_H; GT = y; GP = GT + 410; gStart = 40; x = 60; }
        const n = L.items.find((i) => i.key === `gn:${b.id}`)!, bd = L.items.find((i) => i.key === `gb:${b.id}`)!;
        const wn = Math.max(110, pitsOf(n).length * PIT), wb = Math.max(170, pitsOf(bd).length * PIT);
        const nx = place(n, x, wn, GP), bx = place(bd, x + wn, wb, GP);
        const cx = (nx + bx) / 2, cy = GT + 90;
        // Generator: circle with G and 3~, its name, rating and the board it supplies through the ATS.
        out.push(`<circle cx="${cx}" cy="${cy}" r="20" fill="#fff" stroke="#111" stroke-width="1.4"/><text x="${cx}" y="${cy + 2}" text-anchor="middle" font-weight="bold" font-size="13">G</text><text x="${cx}" y="${cy + 13}" text-anchor="middle" font-size="7">3~</text>`);
        out.push(`<text x="${cx}" y="${cy - 40}" text-anchor="middle" font-size="8">${b.standby!.kva} kVA · ATS to ${esc(b.id)}</text><text x="${cx}" y="${cy - 28}" text-anchor="middle" font-weight="bold">${esc(genTag(genBoards.indexOf(b)))}</text>`);
        out.push(`<text x="${nx - 5}" y="${cy + 16}" text-anchor="end" font-size="8" fill="#5b6b82">star point (N)</text><text x="${bx + 5}" y="${cy + 16}" font-size="8" fill="#5b6b82">frame / body</text>`);
        out.push(`<circle cx="${cx - 20}" cy="${cy}" r="3" fill="${GREEN}"/><circle cx="${cx + 20}" cy="${cy}" r="3" fill="${GREEN}"/>`);
        viaBar(n, nx, `M${cx - 20} ${cy} H${nx}`, GT, GP);
        viaBar(bd, bx, `M${cx + 20} ${cy} H${bx}`, GT, GP);
        // Fuel tank, enclosure and a spare stud bonded on the body bar (right of the incoming conductor).
        const by = GT + BAR_Y, top = by - 34, parts = ['Fuel tank', 'Enclosure', 'Spare'];
        parts.forEach((_, i) => out.push(`<path d="M${bx + 10 + i * 9} ${by} V${top + 6}" stroke="${GREEN}" stroke-width="1.2" fill="none"/>`, headUp(bx + 10 + i * 9, top)));
        out.push(`<path d="M${bx + 7} ${top} q0 -6 6 -6 h${2 * 9 - 6} q6 0 6 6" stroke="#5b6b82" stroke-width="0.8" fill="none"/>`);
        const lines = wrapText(`BONDED: ${parts.join(' · ')}`, 20);
        lines.forEach((t, i) => out.push(`<text x="${bx + 6}" y="${top - 12 - (lines.length - 1 - i) * 10}" font-size="8" fill="#5b6b82">${esc(t)}</text>`));
        spread(n, GP, 76);
        spread(bd, GP, 76);
        if (pitsOf(n).length && pitsOf(bd).length) out.push(separation(Math.max(...pitsOf(n).map((p) => pitX.get(p.id)!)), Math.min(...pitsOf(bd).map((p) => pitX.get(p.id)!)), GP + 128, '≥ 6 m  N ↔ body'));
        x += wn + wb + 20;
      }
      zone(gStart, GT, x - gStart, gTitle);
    }
    endRow(x);
    y += BAND_H;
  }

  const tagOf = pitTags(project, L, barId);

  // ---- Pit interconnections, pit to pit (same kind, same substation) ----
  // Neighbouring pits on a row: out of each pit's top at 45° and across above the pits.
  // Pits with others between (the next RMU group, the next transformer's neutral): down past the chambers,
  // along the bottom (one depth per kind — body lowest, as on the reference sheet) and up into the far pit.
  const depth: Record<string, number> = { txn: 96, gn: 96, lv: 96, sub: 104, rmu: 112, txb: 112, gb: 112 };
  const kindOf = new Map(L.pits.map((p) => [p.id, p.kind]));
  const onRow = (py: number) => L.pits.filter((p) => pitY.get(p.id) === py).map((p) => pitX.get(p.id)!);
  const riserR = new Set<string>(), riserL = new Set<string>();
  const chains: { x1: number; x2: number; py: number; y: number }[] = [];
  const linkLabel = (x1: number, x2: number, y: number) => (x2 - x1 > 150 ? `<text x="${(x1 + x2) / 2}" y="${y - 4}" text-anchor="middle" font-size="8" fill="${GREEN}">1C ${mm} mm² link</text>` : '');
  for (const [a0, b0] of L.links) {
    if (!pitX.has(a0) || !pitX.has(b0)) continue;
    const py = pitY.get(a0)!;
    at = rowAt(py);
    if (pitY.get(b0) !== py) {
      // On another row: a short stub out of each pit's top, named with the other pit.
      for (const [id, to] of [[a0, b0], [b0, a0]]) {
        const x = pitX.get(id)!, y = pitY.get(id)!;
        at = rowAt(y);
        out.push(`<path d="M${x + 4} ${y - 4} L${x + LK} ${y - LK} h24" stroke="${GREEN}" stroke-width="1.6" fill="none"/><text x="${x + LK + 28}" y="${y - LK + 3}" font-size="8" fill="${GREEN}">to ${esc(tagOf.get(to) ?? to)}${REF}${esc(to)}${REF_END}</text>`);
      }
      continue;
    }
    const [a, b] = pitX.get(a0)! <= pitX.get(b0)! ? [a0, b0] : [b0, a0];
    const ax = pitX.get(a)!, bx = pitX.get(b)!, top = py - LK;
    if (!onRow(py).some((x) => x > ax + 0.5 && x < bx - 0.5)) {
      out.push(`<path d="M${ax + 4} ${py - 4} L${ax + LK} ${top} H${bx - LK} L${bx - 4} ${py - 4}" stroke="${GREEN}" stroke-width="1.6" fill="none"/>`, linkLabel(ax, bx, top));
      continue;
    }
    chains.push({ x1: ax, x2: bx, py, y: py + depth[kindOf.get(a)!] });
    riserR.add(a); riserL.add(b);
  }
  for (const c of chains) {
    at = rowAt(c.py);
    const top = c.py - LK, r1 = c.x1 + 38, r2 = c.x2 - 38;
    // Hop over the risers of the other chains on this row that reach below this run.
    const hops = chains.filter((o) => o !== c && o.py === c.py && o.y > c.y).flatMap((o) => [o.x1 + 38, o.x2 - 38]);
    out.push(`<path d="M${c.x1 + 4} ${c.py - 4} L${c.x1 + LK} ${top} H${r1} V${c.y}${hopRun(r1, r2, c.y, hops).replace(/^M\S+ \S+/, '')} V${top} H${c.x2 - LK} L${c.x2 - 4} ${c.py - 4}" stroke="${GREEN}" stroke-width="1.6" fill="none"/>`, linkLabel(r1, r2, c.y));
  }
  // A measured value takes the colour of its pit's net (linked pits together), the same result as the Checks list.
  const netOf = new Map(L.nets.flatMap((n) => n.pits.map((id) => [id, n] as const)));
  const badge = (x: number, y: number, p: (typeof L.pits)[number], end: boolean) => {
    const net = netOf.get(p.id);
    const [fill, stroke] = net?.ok === undefined ? ['#fff', '#5b6b82'] : net.ok ? ['#e8f5ec', GREEN] : ['#fdecea', '#c0392b'];
    const t = `${p.measured} Ω${opts.mono && net?.ok === false ? ' FAIL' : ''}`, w = 10 + t.length * 5.4, bx = end ? x - w : x;
    return `<rect x="${bx}" y="${y}" width="${w}" height="13" rx="2" fill="${fill}" stroke="${stroke}" stroke-width="0.8"/><text x="${bx + w / 2}" y="${y + 9.5}" text-anchor="middle" font-size="8" font-weight="bold" fill="${stroke}">${esc(t)}</text>`;
  };
  for (const p of L.pits) {
    if (!pitX.has(p.id)) continue;
    const px = pitX.get(p.id)!, py = pitY.get(p.id)!;
    at = rowAt(py);
    // Tag beside the chamber, away from a link riser; the last pit of a pair on its left (as on the sheet).
    const own = L.pits.filter((q) => q.itemKey === p.itemKey);
    const lastOfPair = own.length > 1 && own[own.length - 1].id === p.id;
    const left = !riserL.has(p.id) && (riserR.has(p.id) || lastOfPair);
    const tx = left ? px - 30 : px + (riserR.has(p.id) && riserL.has(p.id) ? 46 : 30), anchor = left ? 'end' : 'start';
    out.push(`<g data-pit="${esc(p.id)}">${pitSymbol(px, py)}<text x="${tx}" y="${py + 30}" font-weight="bold" text-anchor="${anchor}">${esc(tagOf.get(p.id) ?? p.id)}</text><text x="${tx}" y="${py + 42}" font-size="8.5" fill="#5b6b82" text-anchor="${anchor}">${esc(p.id)}</text>${p.measured !== undefined ? badge(tx, py + 47, p, left) : ''}</g>`);
  }

  // ---- Cable tags, last: clear of every line, symbol and text drawn above ----
  for (const t of placeTags(tags, obstaclesFromSvg(out.join('')))) { at = rowAt(t.dot[1]); out.push(cableTag(t)); }
  at = undefined;

  // ---- Legend and notes -------------------------------------------------------
  const ly = y + 10, lx = 40;
  const rows: [string, string, number][] = [
    [`<g transform="translate(26 -16) scale(.5)">${rmuSymbol(0, 0)}</g>`, 'RMU: 2 × ring load-break switch + 1 × T-off switch-fuse (IEC 60617)', 44],
    [`<g transform="translate(26 -10)">${txSymbol(0, 0, 7)}</g>`, 'Transformer', 30],
    [`<rect x="8" y="-5" width="36" height="10" rx="2" fill="${CU}" fill-opacity="0.18" stroke="${CU}" stroke-width="1.3"/>`, 'Equipment earth bar with ID (EB-RMU / EB-TX / EB-GEN)', 26],
    [testLink(30, 0), 'Test link on each conductor from the earth bar to a pit', 26],
    [`<path d="M8 -8 V4 H44 V-2" stroke="${GREEN}" stroke-width="1.6" fill="none"/>`, 'Transformer tank / body earth bar to its stud on the RMU earth bar', 26],
    [`${ln(8, -5, 44, -5, 2.6)}${ln(8, 5, 44, 5, 2.6, GREEN)}${ln(20, 5, 20, 12, 1.4, GREEN)}`, 'Panel N bar (isolated from earth) and E bar with the panel body bonded to it', 26],
    [separation(8, 44, 4, '≥ 6 m'), '6 m minimum separation between pits', 26],
    [`<rect x="12" y="-7" width="30" height="13" rx="2" fill="#e8f5ec" stroke="${GREEN}" stroke-width="0.8"/>`, opts.mono ? 'Measured resistance of the pit; FAIL when its pit group is above the limit' : 'Measured resistance: green within the limit for its pit group, red above', 26],
    [`<path d="M8 0 H44" stroke="${GREEN}" stroke-width="1.6"/>`, `Earth conductor 1C ${mm} mm² CU/PVC`, 26],
    [`${ln(14, -10, 14, 10, 1.6, GREEN)}<circle cx="14" cy="2" r="2" fill="${GREEN}"/><path d="M14 2 L22 -6 H26" stroke="#5b6b82" stroke-width="0.9" fill="none"/><rect x="26" y="-13" width="22" height="13" rx="3" fill="#fff" stroke="#5b6b82" stroke-width="0.8"/>`, 'Cable tag: number and size of the cables from that bar', 26],
    [`<path d="M8 6 L18 -4 H34 L44 6" stroke="${GREEN}" stroke-width="1.6" fill="none"/>`, `Pit-to-pit link 1C ${mm} mm² Cu in the soil (same system, same substation)`, 26],
    [`<path d="${hopRun(8, 44, 2, [26])}" stroke="${GREEN}" stroke-width="1.6" fill="none"/>${ln(26, -8, 26, 10, 1.6, GREEN)}`, 'Crossing, not connected', 26],
    [`<path d="M44 0 H16" stroke="${GREEN}" stroke-width="1.2" stroke-dasharray="7 3 1.5 3"/>${headLeft(8, 0)}`, 'Incoming earth / CPC from the boards it feeds (named)', 26],
    [`<path d="M26 9 V0" stroke="${GREEN}" stroke-width="1.2"/>${headUp(26, -8)}`, 'Bonding of metal parts to the main earth bar', 26],
    [`<g transform="translate(26 -26)">${pitSymbol(0, 0)}</g>`, `Earth pit (EP-…, test ID E…): inspection pit and chamber with min. ${L.electrodeM} m Cu-bonded electrode`, 70]
  ];
  let ry = 34;
  let legendBody = '';
  for (const [sym, text, rh] of rows) { const cy = ry + rh / 2; legendBody += `<g transform="translate(10 ${cy})">${sym}</g><text x="70" y="${cy + 3}" font-size="9">${esc(text)}</text>`; ry += rh; }
  const legendH = ry + 8;
  const legend = `<g transform="translate(${lx} ${ly})"><rect x="0" y="0" width="520" height="${legendH}" fill="#fff" stroke="#111"/><text x="10" y="18" font-weight="bold">LEGEND</text>${ln(0, 24, 520, 24, 0.6)}${legendBody}</g>`;
  const notes = [
    'NOTES',
    `1. EARTHING SYSTEM: ${L.system.name.toUpperCase()}. HV BODY (RMU AND TRANSFORMER TANKS), TRANSFORMER NEUTRAL AND LV EARTHS ARE SEPARATE SYSTEMS.`,
    '2. EACH RMU HAS 2 BODY-EARTH PITS; THE TANK / BODY EARTH BAR OF EACH TRANSFORMER IT FEEDS (MAX. 2) IS CONNECTED TO THE RMU EARTH BAR. ONE NEUTRAL PIT PER TRANSFORMER. NEUTRAL AND BODY EARTHS ARE NOT INTERCONNECTED.',
    '3. EARTH PITS OF DIFFERENT SUBSTATIONS ARE NOT INTERCONNECTED.',
    '4. SUBSTATION EARTHS < 2 Ω; LV EARTH ≤ 1 Ω PER INCOMING SUPPLY / MDB (DEWA).',
    '5. EARTH PITS AT LEAST 6.0 m APART. LIGHTNING PROTECTION NOT SHOWN.',
    '6. NEUTRAL EARTHED AT THE TRANSFORMER STAR POINT ONLY; NO N–E LINK IN LV PANELS. PANEL BODY BONDED TO THE E BAR.',
    '7. A SEPARATE CONDUCTOR WITH TEST LINK FROM THE EARTH BAR TO EACH PIT. PITS OF THE SAME SYSTEM LINKED PIT TO PIT IN THE SOIL, GROUP TO GROUP.',
    '8. GENERATOR NEUTRAL AND BODY EARTHS ARE SEPARATE, EACH ≤ 1 Ω; FUEL TANK AND ENCLOSURE BONDED TO THE GENERATOR EARTH BAR.'
  ];
  const noteSvg = `<g transform="translate(${lx + 560} ${ly})">${notes.map((t, i) => `<text x="0" y="${18 + i * 16}" font-size="9"${i ? '' : ' font-weight="bold"'}>${esc(t)}</text>`).join('')}</g>`;

  const inColumn = opts.furniture === 'column';
  // The schedule is part of the SVG so every drawing export carries the same
  // pit IDs and test information. Wrap long cells rather than compressing text.
  const wrap = (text: string, width: number) => {
    const max = Math.max(1, Math.floor((width - 12) / 6));
    const lines: string[] = [];
    let line = '';
    for (const word of text.split(/\s+/)) {
      if (line && line.length + word.length + 1 > max) { lines.push(line); line = ''; }
      let rest = word;
      while (rest.length > max) { if (line) { lines.push(line); line = ''; } lines.push(rest.slice(0, max)); rest = rest.slice(max); }
      line = line ? `${line} ${rest}` : rest;
    }
    if (line) lines.push(line);
    return lines;
  };
  // Untested pits print a line to fill in on site.
  const blank = opts.mono ? '__________' : '';
  const scheduleRows = [['Pit', 'Equipment / connection', 'Earth system / substation', 'Limit', 'Conductor / electrode', 'Measured', 'Tested (date, by)', 'Result'], ...L.pits.map((p) => {
    const it = L.items.find((item) => item.key === p.itemKey)!;
    const st = pitStatus(p);
    return [`${p.id} ${tagOf.get(p.id) ?? ''}`.trim(), `${it.equipment} / ${it.point}`, `${kindInfo(p.kind).label} / ${it.group}`, `${kindInfo(p.kind).limitOhm} ohm`, `1C ${mm} mm² Cu/PVC, ${L.electrodeM} m Cu-bonded rod`,
      p.measured === undefined ? blank || 'Not tested' : `${p.measured} ohm`, [p.date, p.by].filter(Boolean).join(', ') || blank, st === 'pass' ? 'PASS' : st === 'fail' ? 'FAIL' : blank];
  })];
  /** The pit schedule at x, its title above `top` + 30, tableW wide: the SVG and the y below it. */
  const columnsOf = (tableW: number) => [0.08, 0.19, 0.17, 0.06, 0.15, 0.09, 0.16, 0.1].map((f) => f * tableW);
  const rowH = (cells: string[], columns: number[]) => Math.max(1, ...cells.map((s, i) => wrap(s, columns[i]).length)) * 14 + 12;
  /** The schedule (its heading row, then the pits from..to) at x, its title above `top` + 30, tableW wide. */
  const scheduleAt = (tableX: number, top: number, tableW: number, from = 1, to = scheduleRows.length) => {
    const columns = columnsOf(tableW);
    let tableY = top + 40;
    let svg = `<text x="${tableX}" y="${tableY - 10}" font-size="12" font-weight="bold">EARTH PIT SCHEDULE${from > 1 ? ' (CONTINUED)' : ''}</text>`;
    [scheduleRows[0], ...scheduleRows.slice(from, to)].forEach((cells, r) => {
      const lines = cells.map((s, i) => wrap(s, columns[i]));
      const rh = rowH(cells, columns);
      let cx = tableX;
      lines.forEach((ls, i) => {
        svg += `<rect x="${cx}" y="${tableY}" width="${columns[i]}" height="${rh}" fill="none" stroke="#999" stroke-width="0.7"/>`;
        ls.forEach((text, j) => { svg += `<text x="${cx + 6}" y="${tableY + 16 + j * 14}" font-size="9"${r ? '' : ' font-weight="bold"'}>${esc(text)}</text>`; });
        cx += columns[i];
      });
      tableY += rh;
    });
    return { svg, bottom: tableY };
  };

  // ---- Sheet layout ------------------------------------------------------------
  const n = Math.max(1, Math.round((y - 50) / BAND_H));
  const furnH = inColumn ? 0 : legendH;
  const tail = opts.working || inColumn ? 10 : legendH + 20;
  const pitRow = new Map(L.pits.filter((p) => pitY.has(p.id)).map((p) => [p.id, rowAt(pitY.get(p.id)!)]));
  // Printed sheet: every colour to black, tints to white.
  const mono = (s: string) => (opts.mono ? s.replace(/#(1a7f37|1d4f8f|5b6b82|b86b2b|c0392b)/gi, '#111').replace(/#(e8f5ec|fdecea)/gi, '#fff') : s);
  // The legend's symbols are drawn 8–44 wide about x = 26 of their group, for a row of rh px.
  const legendItems = rows.map(([sym, label, rh], i): LegendItem => ({ key: `e${i}`, label, draw: (x, y) => mono(`<g transform="translate(${x - 26} ${y})">${sym}</g>`), ...(rh > 26 ? { h: rh } : {}) }));
  const furniture = `${legend}
  ${noteSvg}`;
  /** One drawing: the rows (each moved by its shift), the legend and notes at top (unless the sheet's column takes them)
   * and the schedule; stubs to a pit on another sheet name that sheet (sheetOf the pit's row; no sheets, no name). */
  const assemble = (w: number, h: number, rowsOf: (row: number) => [number, number] | undefined, top: number | undefined, sch: string, sub: string, sheetOf?: (row: number) => string | undefined) => {
    const groups = new Map<string, string[]>();
    for (const p of parts) {
      const at = rowsOf(p.row);
      if (!at) continue;
      const key = `${at[0]} ${at[1]}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(p.s);
    }
    const body = [...groups].map(([key, ss]) => (key === '0 0' ? ss.join('\n') : `<g transform="translate(${key})">\n${ss.join('\n')}\n</g>`)).join('\n');
    const dy = top === undefined ? 0 : top - ly;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="Arial" font-size="10" fill="#111">
  <rect width="${w}" height="${h}" fill="#fff"/>
  <text x="${w / 2}" y="30" text-anchor="middle" font-size="14" font-weight="bold">EARTHING SCHEMATIC DIAGRAM</text><text x="${w / 2}" y="44" text-anchor="middle" font-size="9" fill="#5b6b82">Earthing system: ${esc(L.system.name)}${sub}</text>
  ${body}
  ${opts.working || inColumn || top === undefined ? '' : dy ? `<g transform="translate(0 ${dy})">${furniture}</g>` : furniture}
  ${sch}
</svg>`.replace(new RegExp(`${REF}([^${REF_END}]*)${REF_END}`, 'g'), (_, id: string) => {
      const r = pitRow.get(id), no = r === undefined ? undefined : sheetOf?.(r);
      return no ? ` (${esc(no)})` : '';
    });
    return { svg: mono(svg), w, h, ...(inColumn ? { legendItems, notes: plainNotes(notes) } : {}) };
  };

  /** One sheet: the rows flow into columns (whole rows, top to bottom, then the next column), and the schedule goes
   * below or in a column of its own, whichever prints largest on a landscape sheet. The working view keeps one column. */
  const single = () => {
    const plan = (k: number, side: boolean) => {
      const per = Math.ceil(n / k);
      const colW = Array.from({ length: Math.ceil(n / per) }, (_, c) => Math.max(0, ...Array.from(rowRight.slice(c * per, (c + 1) * per), (r) => r ?? 0)) + 30);
      const bandsW = colW.reduce((t, cw) => t + cw, 0), top = 50 + per * BAND_H + 10;
      if (!includeSchedule) return { per, colW, top, w: Math.max(bandsW, 1300), h: top + tail };
      if (side) {
        const sch = scheduleAt(bandsW + 10, 40, SCHEDULE_W - 40);
        return { per, colW, top, sch, w: bandsW + SCHEDULE_W, h: Math.max(top + tail, sch.bottom + 20) };
      }
      const w = Math.max(bandsW, 1300), sch = scheduleAt(40, top + furnH, w - 80);
      return { per, colW, top, sch, w, h: sch.bottom + 20 };
    };
    let best = plan(1, false);
    if (!opts.working) {
      for (let k = 1; k <= n; k++) {
        if (k > 1 && Math.ceil(n / k) === Math.ceil(n / (k - 1))) continue; // same columns as k - 1
        for (const side of includeSchedule ? [false, true] : [false]) {
          const q = plan(k, side);
          if (fit(q) > fit(best) * 1.001) best = q;
        }
      }
    }
    // Each column's rows moved up beside the first column; the legend and notes below the tallest column.
    const colX = best.colW.map((_, c) => best.colW.slice(0, c).reduce((t, cw) => t + cw, 0));
    const shift = (row: number): [number, number] => { const c = Math.floor(row / best.per); return [colX[c], -c * best.per * BAND_H]; };
    return { fit: fit(best), w: best.w, h: best.h, draw: () => assemble(best.w, best.h, shift, best.top, best.sch?.svg ?? '', '') };
  };

  /** Continuation sheets, each at most cap px (the drawing area at the smallest readable scale): whole rows, as many
   * columns and rows as fit; the legend and notes (unless in the sheet's column) and the schedule on the last sheet when
   * they fit there (below the rows or beside them), else on a sheet of their own. */
  const paged = (cap: { w: number; h: number }) => {
    const colW = Math.max(0, ...Array.from(rowRight, (r) => r ?? 0)) + 30;
    const cols = Math.max(1, Math.floor(cap.w / colW)), perCol = Math.max(1, Math.floor((cap.h - 90) / BAND_H)), per = cols * perCol;
    const bandSheets = Math.ceil(n / per), last = n - (bandSheets - 1) * per, lastCols = Math.ceil(last / perCol);
    const top = (rowsDown: number) => 50 + rowsDown * BAND_H + 10;
    type Tail = { sheet: number; w: number; h: number; top?: number; sch: string };
    const ends: Tail[] = [];
    if (includeSchedule) {
      const down = Math.min(last, perCol), usedW = lastCols * colW;
      const belowW = Math.min(cap.w, Math.max(usedW, 1300)), below = scheduleAt(40, top(down) + furnH, belowW - 80);
      const side = scheduleAt(usedW + 10, 40, SCHEDULE_W - 40);
      if (below.bottom + 50 <= cap.h) ends.push({ sheet: bandSheets - 1, w: Math.max(usedW, belowW), h: below.bottom + 40, top: top(down), sch: below.svg });
      else if (usedW + SCHEDULE_W <= cap.w && side.bottom + 50 <= cap.h && top(down) + tail <= cap.h) ends.push({ sheet: bandSheets - 1, w: usedW + SCHEDULE_W, h: Math.max(top(down) + tail, side.bottom + 20) + 20, top: top(down), sch: side.svg });
      else {
        // Sheets of their own: the legend and notes first, then as many pits as fit each sheet (the heading repeated).
        const ownW = Math.min(cap.w, 2400), columns = columnsOf(ownW - 80), heading = rowH(scheduleRows[0], columns);
        for (let from = 1, sheet = bandSheets; from < scheduleRows.length; sheet++) {
          const t0 = sheet === bandSheets ? 60 + furnH : 60;
          let to = from, y0 = t0 + 40 + heading;
          while (to < scheduleRows.length && (to === from || y0 + rowH(scheduleRows[to], columns) + 50 <= cap.h)) y0 += rowH(scheduleRows[to++], columns);
          const sch = scheduleAt(40, t0, ownW - 80, from, to);
          ends.push({ sheet, w: ownW, h: sch.bottom + 40, ...(sheet === bandSheets ? { top: 60 } : {}), sch: sch.svg });
          from = to;
        }
      }
    }
    const count = Math.max(bandSheets, ...ends.map((e) => e.sheet + 1));
    const sheetOfRow = (row: number) => Math.floor(row / per);
    return {
      count,
      draw: (part: number, nos: (string | undefined)[] = []) => {
        const no = (k: number) => nos[k] || `sheet ${k + 1}`;
        const rows = Math.max(0, Math.min(per, n - part * per));
        const usedCols = Math.ceil(rows / perCol);
        const own = ends.find((e) => e.sheet === part);
        const w = Math.max(own?.w ?? 0, usedCols * colW, 1300), h = Math.max(own?.h ?? 0, top(Math.min(rows, perCol)) + 30);
        const shift = (row: number): [number, number] | undefined => {
          if (sheetOfRow(row) !== part) return undefined;
          const i = row - part * per, c = Math.floor(i / perCol);
          return [c * colW, (i % perCol - row) * BAND_H];
        };
        const cont = `${part ? `<text x="40" y="30" font-size="11" font-weight="bold">CONTINUED FROM ${esc(no(part - 1).toUpperCase())}</text>` : ''}${part < count - 1 ? `<text x="${w - 40}" y="${h - 10}" text-anchor="end" font-size="11" font-weight="bold">CONTINUED ON ${esc(no(part + 1).toUpperCase())}</text>` : ''}`;
        return assemble(w, h, shift, own?.top, (own?.sch ?? '') + cont, ` · sheet ${part + 1} of ${count}`, (r) => (sheetOfRow(r) === part ? undefined : no(sheetOfRow(r))));
      }
    };
  };
  return { single, paged, widest: Math.max(0, ...Array.from(rowRight, (r) => r ?? 0)) + 30 };
}

/** The sheet a printed earthing schematic is drawn for: its part (0 = first), the drawing area in px at the smallest
 * readable scale, and the sheet numbers of the parts in the set (for "continued on" and stubs to another sheet). */
export interface EarthingSheet { part: number; capacity: { w: number; h: number }; nos?: (string | undefined)[] }
export interface EarthingOpts {
  mono?: boolean;
  working?: boolean;
  /** The sheet's legend column takes the legend and notes (returned, not drawn); the pit schedule stays. */
  furniture?: 'column';
  /** A printed sheet: drawn to fit it, over several sheets when one would print below the readable scale. */
  sheet?: EarthingSheet;
  /** The row wrap widths tried (default WRAPS). */
  wraps?: number[];
}
const fit = (q: { w: number; h: number }) => Math.min(SHEET_ASPECT / q.w, 1 / q.h);

type Drawing = { svg: string; w: number; h: number; legendItems?: LegendItem[]; notes?: string[] };
/** The chosen layout of a printed schematic: how many sheets, and each sheet drawn on request. */
type Layout = { parts: number; draw: (part: number, nos?: (string | undefined)[]) => Drawing };
/** Layouts already chosen, per project (or the layout passed in) and options: each sheet of a schematic over several
 * sheets is drawn on its own, and choosing the layout draws the whole schematic at every wrap width. */
const layouts = new WeakMap<object, Map<string, Layout>>();

function chooseLayout(project: Project, L: EarthLayout, includeSchedule: boolean, opts: EarthingOpts): Layout {
  const tries = (opts.wraps?.length ? opts.wraps : WRAPS).map((wrap) => drawAt(project, L, includeSchedule, opts, wrap));
  const singles = tries.map((t) => t.single());
  let best = 0;
  singles.forEach((q, i) => { if (q.fit > singles[best].fit * 1.001) best = i; });
  const cap = opts.sheet?.capacity;
  if (!cap || (singles[best].w <= cap.w && singles[best].h <= cap.h)) {
    let one: Drawing | undefined;
    return { parts: 1, draw: () => (one ??= singles[best].draw()) };
  }
  // Over several sheets: the fewest, then the widest wrap; wraps wider than the sheet only when none is narrower.
  const fitting = tries.filter((t) => t.widest <= cap.w);
  const pagings = (fitting.length ? fitting : [tries[tries.length - 1]]).map((t) => t.paged(cap));
  const paging = pagings.reduce((a, b) => (b.count < a.count ? b : a));
  return { parts: paging.count, draw: (part, nos) => paging.draw(Math.min(Math.max(0, part), paging.count - 1), nos) };
}

/** mono: black on white for the printed sheet (plain report style) — results are written (FAIL), not coloured.
 * working: the on-screen working view — the schematic only, without the legend and notes (sheet furniture), one column.
 * The printed schematic tries each row wrap width and keeps the layout that prints largest. With a sheet whose drawing
 * area it does not fit at the readable scale, it continues over sheets (parts: how many). */
export function earthingDrawing(project: Project, given?: EarthLayout, includeSchedule = true, opts: EarthingOpts = {}): Drawing & { parts: number } {
  const L = given ?? earthingLayout(project);
  if (opts.working) return { ...drawAt(project, L, includeSchedule, opts, WRAPS[0]).single().draw(), parts: 1 };
  const key = JSON.stringify([includeSchedule, !!opts.mono, opts.furniture ?? '', opts.sheet?.capacity ?? null, opts.wraps ?? null]);
  const owner: object = given ?? project;
  let byOpts = layouts.get(owner);
  if (!byOpts) layouts.set(owner, (byOpts = new Map()));
  let layout = byOpts.get(key);
  if (!layout) byOpts.set(key, (layout = chooseLayout(project, L, includeSchedule, opts)));
  return { ...layout.draw(opts.sheet?.part ?? 0, opts.sheet?.nos), parts: layout.parts };
}
