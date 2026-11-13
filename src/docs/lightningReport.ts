import { AIR_METHODS, airResultText, lightningProtection, lpsLayout, type LpsInputs, type LpsResult } from '../calc/lightningProtection';
import { CALC_DISCLAIMER, REPORT_STATUS_TEXT } from '../calc/statusText';
import { boardsInSupplyOrder } from '../calc/summary';
import { SPD_TYPES, type Project } from '../types';
import { esc } from './report';
import { SHEET_CSS, sheetHead } from './upsSolarReport';

/** Lightning protection calculation report: the same content for the PDF sheet, the Word file and the page's
 * section list. Black-and-white; every class value is shown as entered by the engineer. */

export type LpsSectionKey = 'inputs' | 'methods' | 'layout' | 'down' | 'surge' | 'quantities' | 'checks' | 'notes';
export const LPS_SECTIONS: { key: LpsSectionKey; label: string }[] = [
  { key: 'inputs', label: 'Inputs as entered, with references' },
  { key: 'methods', label: 'All four methods with formulas and working' },
  { key: 'layout', label: 'Roof layout drawing' },
  { key: 'down', label: 'Down conductors and earth pits' },
  { key: 'surge', label: 'Surge protection schedule' },
  { key: 'quantities', label: 'Quantities' },
  { key: 'checks', label: 'Checks and warnings' },
  { key: 'notes', label: 'Assumptions and disclaimer' }
];
const ALL = LPS_SECTIONS.map((s) => s.key);

export interface LpsBlock {
  key: LpsSectionKey;
  title: string;
  pairs?: [string, string][];
  table?: { headers: string[]; rows: string[][] };
  notes?: string[];
  /** The roof layout drawing goes here (PDF); Word gets the sentence in `notes`. */
  layout?: boolean;
}

const NOT = 'Not entered';
const n2 = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 });
const val = (v: number | undefined, unit: string) => (v !== undefined && Number.isFinite(v) ? `${n2(v)} ${unit}`.trim() : NOT);
const methodOf = (id: LpsInputs['method']) => AIR_METHODS.find((m) => m.id === id)!;
export const LPS_NOTES = [
  'Method references: IEC 62305-3 for the mesh, protection angle and rolling sphere methods; NFC 17-102 for early streamer emission (ESE) terminals. The ESE method is not an IEC 62305 method: confirm that the authority accepts it.',
  'The protection class, mesh size, rolling sphere radius, protection angle and down conductor spacing are the engineer\'s own entries, from the risk assessment and the current edition of the standard. The ESE advance time is from the manufacturer\'s test certificate. No value of a standard is built into the calculation.',
  'Concept stage, for a flat rectangular roof. Not covered: the risk assessment, separation distance, natural components, bonding details and installation detailing.',
  CALC_DISCLAIMER
];

export function lightningReportBlocks(project: Project, i: LpsInputs, keys: LpsSectionKey[] = ALL, r: LpsResult = lightningProtection(i)): LpsBlock[] {
  const sel = methodOf(i.method);
  const plan = lpsLayout(i, r);
  const boards = boardsInSupplyOrder(project);
  const all: LpsBlock[] = [
    { key: 'inputs', title: 'Inputs as entered', pairs: [
      ['Building (length × width × height)', r.invalid ? NOT : `${n2(i.lengthM)} × ${n2(i.widthM)} × ${n2(i.heightM)} m`],
      ['Protection class', i.lpsClass ? `Class ${i.lpsClass}` : NOT],
      ['Risk assessment reference', i.riskRef?.trim() || NOT],
      ['Air termination method', `${sel.label} (${sel.reference})`],
      ['Mesh size', val(i.meshM, 'm')],
      ['Rolling sphere radius', val(i.sphereRadiusM, 'm')],
      ['Down conductor spacing', val(i.downSpacingM, 'm')],
      ['Rod height above the roof', val(i.rodHeightM, 'm')],
      ['Protection angle', val(i.angleDeg, '°')],
      ['ESE terminal height above the roof', val(i.eseMastM, 'm')],
      ['ESE advance time ΔT', val(i.eseDeltaTUs, 'µs')],
      ['Down conductors for each ESE terminal', val(i.eseDownPerTerminal, '')],
      ['Earth pit at each down conductor', i.earthPitPerDown ? 'Yes' : 'No'],
      ['Earth resistance limit', val(i.earthLimitOhm, 'Ω')],
      ['Bonded to the main earth bar (MET)', i.bondedToMet ? 'Yes' : 'No']
    ] },
    { key: 'methods', title: 'Air termination methods compared', table: {
      headers: ['Method', 'Reference', 'Result', 'Working', 'Status'],
      rows: r.methods.map((a) => [`${methodOf(a.method).label}${a.method === i.method ? ' (selected)' : ''}`, methodOf(a.method).reference, airResultText(a),
        `${a.working}${a.note ? ` — ${a.note}` : ''}`, a.status === 'data' ? REPORT_STATUS_TEXT.data : REPORT_STATUS_TEXT[a.status]])
    } },
    { key: 'layout', title: 'Roof layout — concept', layout: true,
      notes: [r.invalid ? 'Building size not set.' : `${sel.label}: ${plan.terminals.length} air terminal${plan.terminals.length === 1 ? '' : 's'}, ${plan.meshX.length + plan.meshY.length} conductor runs inside the roof edge, ${plan.downs.length} down conductors at equal steps round the perimeter. Not to scale.`] },
    { key: 'down', title: 'Down conductors and earth pits', pairs: [
      ['Building perimeter', `${n2(r.perimeterM)} m`],
      ['Down conductors', r.downConductors ? `${r.downConductors}, ${n2(r.downSpacingM!)} m apart round the perimeter` : REPORT_STATUS_TEXT.data],
      ['Down conductor length', `${n2(r.downConductorM)} m (building height each)`],
      ['Test joints', `${r.testJoints} (one in each down conductor)`],
      ['Earth pits', `${r.earthPits}`],
      ['Ring earth conductor', `${n2(r.ringConductorM)} m (building perimeter)`]
    ] },
    { key: 'surge', title: 'Surge protection at the boards', table: {
      headers: ['Board', 'Kind', 'Surge protection (set on the SLD)'],
      rows: boards.map((b) => [b.id, b.kind ?? '—', SPD_TYPES.find((x) => x.value === b.spd)?.label ?? 'Not set'])
    } },
    { key: 'quantities', title: `Quantities — ${sel.label}`, table: {
      headers: ['Item', 'Quantity', 'Unit'],
      rows: [
        ['Roof conductor', n2(r.selected.roofConductorM), 'm'], ['Air terminals (rods or ESE terminals)', `${r.selected.terminals}`, 'no.'],
        ['Down conductors', `${r.downConductors}`, 'no.'], ['Down conductor length', n2(r.downConductorM), 'm'], ['Test joints', `${r.testJoints}`, 'no.'],
        ['Earth pits', `${r.earthPits}`, 'no.'], ['Ring earth conductor', n2(r.ringConductorM), 'm']
      ]
    } },
    { key: 'checks', title: 'Checks', table: { headers: ['Status', 'Check'], rows: r.checks.map((c) => [REPORT_STATUS_TEXT[c.status], c.text]) } },
    { key: 'notes', title: 'Assumptions and disclaimer', notes: LPS_NOTES }
  ];
  return all.filter((b) => keys.includes(b.key));
}

/** The roof layout in black and white: roof edge, conductor runs, air terminals (squares), down conductors (rings). */
export function lightningLayoutSvg(i: LpsInputs, r: LpsResult): string {
  if (r.invalid) return '';
  const k = Math.min(400 / i.lengthM, 250 / i.widthM), plan = lpsLayout(i, r);
  const X = (m: number) => (35 + m * k).toFixed(1), Y = (m: number) => (30 + m * k).toFixed(1);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 470 330" width="470" height="330" font-family="Arial, sans-serif" font-size="10">
<rect x="${X(0)}" y="${Y(0)}" width="${(i.lengthM * k).toFixed(1)}" height="${(i.widthM * k).toFixed(1)}" fill="none" stroke="#000" stroke-width="1.6"/>
<g stroke="#000" stroke-width="0.8" stroke-dasharray="5 3">${plan.meshX.map((x) => `<line x1="${X(x)}" y1="${Y(0)}" x2="${X(x)}" y2="${Y(i.widthM)}"/>`).join('')}${plan.meshY.map((y) => `<line x1="${X(0)}" y1="${Y(y)}" x2="${X(i.lengthM)}" y2="${Y(y)}"/>`).join('')}</g>
${plan.terminals.map(([x, y]) => `<rect x="${(35 + x * k - 3).toFixed(1)}" y="${(30 + y * k - 3).toFixed(1)}" width="6" height="6" fill="#000"/>`).join('')}
${plan.downs.map(([x, y]) => `<circle cx="${X(x)}" cy="${Y(y)}" r="4" fill="#fff" stroke="#000" stroke-width="1.4"/>`).join('')}
<text x="${X(i.lengthM / 2)}" y="20" text-anchor="middle">${n2(i.lengthM)} m</text><text x="${(40 + i.lengthM * k).toFixed(1)}" y="${Y(i.widthM / 2)}">${n2(i.widthM)} m</text>
<line x1="35" y1="312" x2="60" y2="312" stroke="#000" stroke-width="0.8" stroke-dasharray="5 3"/><text x="66" y="315">Roof conductor</text>
<rect x="166" y="309" width="6" height="6" fill="#000"/><text x="178" y="315">Rod / terminal</text>
<circle cx="280" cy="312" r="4" fill="#fff" stroke="#000" stroke-width="1.4"/><text x="290" y="315">Down conductor</text></svg>`;
}

/** The report as one printable A4 sheet set. */
export function buildLightningReportHtml(project: Project, keys: LpsSectionKey[] = ALL): string {
  const i = project.lightning ?? { lengthM: 0, widthM: 0, heightM: 0, method: 'mesh' as const };
  const r = lightningProtection(i);
  const body = lightningReportBlocks(project, i, keys, r).map((b) => {
    const pairs = b.pairs ? `<table>${b.pairs.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>` : '';
    const table = b.table ? (b.table.rows.length
      ? `<table><tr>${b.table.headers.map((h) => `<th style="width:auto">${esc(h)}</th>`).join('')}</tr>${b.table.rows.map((row) => `<tr>${row.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`
      : '<p class="note">None.</p>') : '';
    const drawing = b.layout ? lightningLayoutSvg(i, r) : '';
    const notes = (b.notes ?? []).map((t) => `<p class="note">${esc(t)}</p>`).join('');
    return `<h2>${esc(b.title)}</h2>${pairs}${table}${drawing}${notes}`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(project.name)} — Lightning protection</title><style>${SHEET_CSS}</style></head><body><section class="page">${sheetHead(project, 'Lightning protection — concept calculation')}${body}</section></body></html>`;
}
