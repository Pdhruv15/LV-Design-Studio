import { AIR_METHODS } from '../calc/lightningProtection';
import type { Project } from '../types';
import { earthingSystemOf } from './earthingPlan';
import { currentRevision, revisionStamp } from './revisions';
import { mainBoards } from './transformers';

/** The project specification (Specification page): sections of numbered clauses whose values come from the
 * project. A clause's text holds fields as {{key}}; each is filled from the design when the specification is shown
 * or exported, so the specification follows the design. A field the project has no value for shows DATA REQUIRED.
 * The clause wording is the engineer's own: the starter set is plain wording to edit, not text of any standard. */

export type SpecKind = 'heading' | 'clause' | 'note';
export interface SpecClause { id: string; kind: SpecKind; text: string }
export interface SpecSection { id: string; title: string; included: boolean; clauses: SpecClause[] }
/** A detail the engineer adds to the document's information (name and value), usable in a clause as a field. */
export interface SpecDetail { id: string; name: string; value: string }
/** The document's own information: its number and status, the parties, and any further details. A party left
 * blank is read from the project (Project information) where the project has it, so nothing is typed twice. */
export interface SpecInfo { number?: string; status?: string; client?: string; consultant?: string; mainContractor?: string; mepContractor?: string; details?: SpecDetail[] }
export type SpecPaper = 'A4' | 'A3';
/** Left, centre and right text of a header or footer; each may hold fields, and {{page}} and {{pages}}. */
export type SpecSlots = [string, string, string];
export type SpecLogoPlace = 'none' | 'header-left' | 'header-right' | 'footer-left' | 'footer-right';
export interface SpecMargins { top: number; right: number; bottom: number; left: number }
/** Page setup of the exported document. Anything left out takes the default (SPEC_SETUP). */
export interface SpecSetup {
  paper?: SpecPaper; landscape?: boolean; marginsMm?: SpecMargins; header?: SpecSlots; footer?: SpecSlots;
  logo?: string; // the document's own logo (data: URL); none: the project's company logo
  logoPlace?: SpecLogoPlace; // the logo takes the place of that slot's text
  watermark?: string; // e.g. DRAFT, behind the text of every page
}
export interface SpecDoc { title: string; sections: SpecSection[]; info?: SpecInfo; setup?: SpecSetup }

// ---- fields from the project

export type SpecPartyKey = 'client' | 'consultant' | 'mainContractor' | 'mepContractor';
/** The parties of the document, and where the project already holds each (Project information). */
export const SPEC_PARTIES: { key: SpecPartyKey; label: string; from: (p: Project) => string | undefined }[] = [
  { key: 'client', label: 'Client', from: (p) => p.info?.owner },
  { key: 'consultant', label: 'Consultant', from: (p) => p.info?.consultant?.trim() || p.drawing?.company },
  { key: 'mainContractor', label: 'Main contractor', from: (p) => p.info?.contractor },
  { key: 'mepContractor', label: 'MEP contractor', from: () => undefined }
];

export interface SpecField { key: string; label: string; group: string; value?: string }
const n = (v: number | undefined, unit: string) => (v !== undefined && Number.isFinite(v) && v > 0 ? `${v.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${unit}`.trim() : undefined);
const t = (v: string | undefined) => (v?.trim() ? v.trim() : undefined);

/** Every field a clause can use, with its value from this project (none: the project does not have it yet). */
export function specFields(p: Project, doc: SpecDoc | undefined = p.spec): SpecField[] {
  const main = mainBoards(p)[0];
  const lp = p.lightning;
  const info = doc?.info;
  return [
    { key: 'doc.title', label: 'Document title', group: 'Document', value: t(doc?.title) },
    { key: 'doc.number', label: 'Document number', group: 'Document', value: t(info?.number) },
    { key: 'doc.status', label: 'Document status', group: 'Document', value: t(info?.status) },
    ...SPEC_PARTIES.map((x) => ({ key: `party.${x.key}`, label: x.label, group: 'Parties', value: t(info?.[x.key]) ?? t(x.from(p)) })),
    ...(info?.details ?? []).filter((d) => d.name.trim()).map((d) => ({ key: `detail.${d.id}`, label: d.name.trim(), group: 'Additional details', value: t(d.value) })),
    { key: 'project.issue', label: 'Revision and date', group: 'Project', value: t(revisionStamp(p)) },
    { key: 'project.name', label: 'Project name', group: 'Project', value: t(p.name) },
    { key: 'project.revision', label: 'Revision', group: 'Project', value: t(currentRevision(p)?.id) },
    { key: 'project.voltage', label: 'System voltage', group: 'Project', value: n(p.voltageV, 'V') },
    { key: 'project.frequency', label: 'Frequency', group: 'Project', value: n(p.frequencyHz, 'Hz') },
    { key: 'main.id', label: 'Main board', group: 'Main switchboard', value: t(main?.id) },
    { key: 'main.rated', label: 'Rated current', group: 'Main switchboard', value: n(main?.ratedCurrentA, 'A') },
    { key: 'main.icw', label: 'Short-time withstand (1 s)', group: 'Main switchboard', value: n(main?.busbarIcwKa, 'kA') },
    { key: 'main.busbar', label: 'Busbar material', group: 'Main switchboard', value: t(main?.busbarMaterial) },
    { key: 'main.ip', label: 'Degree of protection', group: 'Main switchboard', value: t(main?.ipRating) },
    { key: 'main.location', label: 'Location', group: 'Main switchboard', value: t(main?.location) },
    { key: 'main.transformer', label: 'Transformer rating', group: 'Main switchboard', value: n(main?.sourceKva, 'kVA') },
    { key: 'boards.count', label: 'Number of boards', group: 'Distribution', value: p.boards.length ? String(p.boards.length) : undefined },
    { key: 'earthing.system', label: 'Earthing system', group: 'Earthing', value: p.earthingPlan ? earthingSystemOf(p.earthingPlan.system).name : undefined },
    { key: 'earthing.conductor', label: 'Earth conductor', group: 'Earthing', value: p.earthingPlan ? n(p.earthingPlan.conductorMm2 ?? 70, 'mm²') : undefined }, // 70: the schematic's own default
    { key: 'lightning.class', label: 'Lightning protection class', group: 'Lightning protection', value: lp?.lpsClass ? `Class ${lp.lpsClass}` : undefined },
    { key: 'lightning.method', label: 'Air termination method', group: 'Lightning protection', value: lp ? AIR_METHODS.find((m) => m.id === lp.method)?.label : undefined }
  ];
}

// ---- showing the specification

export type SpecRun = { text: string } | { field: string; label: string; value?: string };
export interface SpecLine { id: string; kind: SpecKind; no: string; runs: SpecRun[] }
export interface SpecBlock { id: string; no: string; title: string; lines: SpecLine[] }
export interface SpecMissing { sectionNo: string; clauseNo: string; key: string; label: string }
export interface SpecView { blocks: SpecBlock[]; missing: SpecMissing[] }

const FIELD = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
/** The field keys a text uses, in order. */
export const fieldKeys = (text: string): string[] => [...text.matchAll(FIELD)].map((m) => m[1]);

function runsOf(text: string, fields: Map<string, SpecField>): SpecRun[] {
  const out: SpecRun[] = [];
  let at = 0;
  for (const m of text.matchAll(FIELD)) {
    if (m.index! > at) out.push({ text: text.slice(at, m.index) });
    const f = fields.get(m[1]);
    // A field the app does not know stays in the text as the engineer wrote it, marked as missing.
    out.push({ field: m[1], label: f?.label ?? m[1], ...(f?.value !== undefined ? { value: f.value } : {}) });
    at = m.index! + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}

/** The included sections, numbered — sections 1, 2 …, headings 2.1, 2.2 …, clauses 2.1.1 … (a clause before any
 * heading is 2.1, 2.2 …) — with every field filled from the project, and the list of fields that have no value. */
export function specView(doc: SpecDoc, p: Project): SpecView {
  const fields = new Map(specFields(p, doc).map((f) => [f.key, f]));
  const blocks: SpecBlock[] = [], missing: SpecMissing[] = [];
  let s = 0;
  for (const sec of doc.sections) {
    if (!sec.included) continue;
    const no = String(++s);
    let h = 0, c = 0;
    const lines: SpecLine[] = sec.clauses.map((cl) => {
      let num = '';
      if (cl.kind === 'heading') { num = `${no}.${++h}`; c = 0; } else if (cl.kind === 'clause') num = h ? `${no}.${h}.${++c}` : `${no}.${++c}`;
      const runs = runsOf(cl.text, fields);
      for (const r of runs) if ('field' in r && r.value === undefined) missing.push({ sectionNo: no, clauseNo: num, key: r.field, label: r.label });
      return { id: cl.id, kind: cl.kind, no: num, runs };
    });
    blocks.push({ id: sec.id, no, title: sec.title, lines });
  }
  return { blocks, missing };
}
/** A line as plain text, fields filled in (DATA REQUIRED where the project has no value). */
export const lineText = (l: Pick<SpecLine, 'runs'>): string => l.runs.map((r) => ('text' in r ? r.text : r.value ?? `DATA REQUIRED: ${r.label}`)).join('');

// ---- document information and page setup

export const SPEC_SETUP: Required<Omit<SpecSetup, 'logo' | 'watermark'>> = {
  paper: 'A4', landscape: false, marginsMm: { top: 22, right: 16, bottom: 20, left: 18 },
  header: ['{{project.name}}', '', '{{doc.title}}'], footer: ['{{project.issue}}', '', 'Page {{page}} of {{pages}}'], logoPlace: 'none'
};
export const SPEC_PAPER_MM: Record<SpecPaper, [number, number]> = { A4: [210, 297], A3: [297, 420] };
export interface SpecPage extends Required<Omit<SpecSetup, 'logo' | 'watermark'>> { logo?: string; watermark?: string }
/** The page setup in full: the document's own choices over the defaults, the logo the document's own or else the
 * project's company logo. Margins are kept between 5 and 60 mm so a page always has room for text. */
export function specSetup(doc: SpecDoc, p: Project): SpecPage {
  const s = doc.setup ?? {}, m = s.marginsMm ?? SPEC_SETUP.marginsMm;
  const mm = (v: number, d: number) => (Number.isFinite(v) ? Math.min(60, Math.max(5, v)) : d);
  const d = SPEC_SETUP.marginsMm;
  return {
    paper: s.paper ?? SPEC_SETUP.paper, landscape: s.landscape ?? false,
    marginsMm: { top: mm(m.top, d.top), right: mm(m.right, d.right), bottom: mm(m.bottom, d.bottom), left: mm(m.left, d.left) },
    header: s.header ?? SPEC_SETUP.header, footer: s.footer ?? SPEC_SETUP.footer, logoPlace: s.logoPlace ?? 'none',
    logo: t(s.logo) ?? t(p.drawing?.logo), watermark: t(s.watermark)
  };
}
export type SlotRun = { text: string } | { page: 'page' | 'pages' };
/** A header or footer slot as text and page numbers, fields filled in (DATA REQUIRED where there is no value). */
export function slotRuns(text: string, doc: SpecDoc, p: Project): SlotRun[] {
  const fields = new Map(specFields(p, doc).map((f) => [f.key, f]));
  const out: SlotRun[] = [];
  const say = (v: string) => { const last = out[out.length - 1]; if (last && 'text' in last) last.text += v; else if (v) out.push({ text: v }); };
  let at = 0;
  for (const m of text.matchAll(FIELD)) {
    say(text.slice(at, m.index));
    if (m[1] === 'page' || m[1] === 'pages') out.push({ page: m[1] });
    else { const f = fields.get(m[1]); say(f?.value ?? `DATA REQUIRED: ${f?.label ?? m[1]}`); }
    at = m.index! + m[0].length;
  }
  say(text.slice(at));
  return out;
}
/** A slot as it reads on page 1 of 1, for showing on screen. */
export const slotText = (text: string, doc: SpecDoc, p: Project, page = '1', pages = '1'): string =>
  slotRuns(text, doc, p).map((r) => ('text' in r ? r.text : r.page === 'page' ? page : pages)).join('');

export const withInfo = (doc: SpecDoc, patch: Partial<SpecInfo>): SpecDoc => ({ ...doc, info: { ...doc.info, ...patch } });
export const withSetup = (doc: SpecDoc, patch: Partial<SpecSetup>): SpecDoc => ({ ...doc, setup: { ...doc.setup, ...patch } });
export const withTitle = (doc: SpecDoc, title: string): SpecDoc => (title.trim() ? { ...doc, title: title.trim() } : doc);
/** Adds a detail (name and value) to the document's information; its field is detail.<id>. */
export function addDetail(doc: SpecDoc, name = '', value = ''): SpecDoc {
  const details = doc.info?.details ?? [];
  let i = details.length + 1;
  while (details.some((d) => d.id === `D${i}`)) i++;
  return withInfo(doc, { details: [...details, { id: `D${i}`, name, value }] });
}
export const withDetail = (doc: SpecDoc, id: string, patch: Partial<Omit<SpecDetail, 'id'>>): SpecDoc => withInfo(doc, { details: (doc.info?.details ?? []).map((d) => (d.id === id ? { ...d, ...patch } : d)) });
export const removeDetail = (doc: SpecDoc, id: string): SpecDoc => withInfo(doc, { details: (doc.info?.details ?? []).filter((d) => d.id !== id) });
/** How many times the clauses use a field (a detail in use is not deleted without saying so). */
export const fieldUses = (doc: SpecDoc, key: string): number => doc.sections.reduce((n, s) => n + s.clauses.reduce((m, c) => m + fieldKeys(c.text).filter((k) => k === key).length, 0), 0);

// ---- editing: every edit returns a new document, so one edit is one undo step

const nextId = (doc: SpecDoc, prefix: string): string => {
  const used = new Set(doc.sections.flatMap((s) => [s.id, ...s.clauses.map((c) => c.id)]));
  let i = used.size + 1;
  while (used.has(`${prefix}${i}`)) i++;
  return `${prefix}${i}`;
};
const mapSection = (doc: SpecDoc, id: string, fn: (s: SpecSection) => SpecSection): SpecDoc => ({ ...doc, sections: doc.sections.map((s) => (s.id === id ? fn(s) : s)) });

export const withSectionIncluded = (doc: SpecDoc, id: string, included: boolean): SpecDoc => mapSection(doc, id, (s) => ({ ...s, included }));
export const withSectionTitle = (doc: SpecDoc, id: string, title: string): SpecDoc => (title.trim() ? mapSection(doc, id, (s) => ({ ...s, title: title.trim() })) : doc);
export function addSection(doc: SpecDoc, title: string): SpecDoc {
  return title.trim() ? { ...doc, sections: [...doc.sections, { id: nextId(doc, 'S'), title: title.trim(), included: true, clauses: [] }] } : doc;
}
export const removeSection = (doc: SpecDoc, id: string): SpecDoc => ({ ...doc, sections: doc.sections.filter((s) => s.id !== id) });
/** Moves a section up (−1) or down (+1) the list. */
export function moveSection(doc: SpecDoc, id: string, by: -1 | 1): SpecDoc {
  const i = doc.sections.findIndex((s) => s.id === id), j = i + by;
  if (i < 0 || j < 0 || j >= doc.sections.length) return doc;
  const sections = [...doc.sections];
  [sections[i], sections[j]] = [sections[j], sections[i]];
  return { ...doc, sections };
}

/** Adds a clause to a section: after the clause `after`, or at the end. */
export function addClause(doc: SpecDoc, sectionId: string, kind: SpecKind, text: string, after?: string): SpecDoc {
  const id = nextId(doc, 'C');
  return mapSection(doc, sectionId, (s) => {
    const i = after ? s.clauses.findIndex((c) => c.id === after) : -1;
    const clauses = [...s.clauses];
    clauses.splice(i < 0 ? clauses.length : i + 1, 0, { id, kind, text });
    return { ...s, clauses };
  });
}
export const withClause = (doc: SpecDoc, sectionId: string, clauseId: string, change: Partial<Pick<SpecClause, 'text' | 'kind'>>): SpecDoc =>
  mapSection(doc, sectionId, (s) => ({ ...s, clauses: s.clauses.map((c) => (c.id === clauseId ? { ...c, ...change } : c)) }));
export const removeClause = (doc: SpecDoc, sectionId: string, clauseId: string): SpecDoc => mapSection(doc, sectionId, (s) => ({ ...s, clauses: s.clauses.filter((c) => c.id !== clauseId) }));
export function moveClause(doc: SpecDoc, sectionId: string, clauseId: string, by: -1 | 1): SpecDoc {
  return mapSection(doc, sectionId, (s) => {
    const i = s.clauses.findIndex((c) => c.id === clauseId), j = i + by;
    if (i < 0 || j < 0 || j >= s.clauses.length) return s;
    const clauses = [...s.clauses];
    [clauses[i], clauses[j]] = [clauses[j], clauses[i]];
    return { ...s, clauses };
  });
}

// ---- the starter specification

type Starter = [title: string, included: boolean, lines: [SpecKind, string][]];
/** Plain starter wording for the engineer to edit into the office's own. Written for this app; not text of a standard. */
const STARTER: Starter[] = [
  ['General requirements', true, [
    ['heading', 'Scope'],
    ['clause', 'This specification covers the electrical installation for {{project.name}}. It is to be read with the drawings, the schedules and the other sections of the contract documents.'],
    ['clause', 'The installation shall be complete and working. Anything needed for that, whether or not it is named here, shall be included.'],
    ['heading', 'System'],
    ['clause', 'The supply is {{project.voltage}}, three phase and neutral, {{project.frequency}}.'],
    ['clause', 'Equipment and materials shall be new, of a current design, and suitable for the conditions on site.'],
    ['heading', 'Submissions'],
    ['clause', 'Before ordering, the contractor shall submit for review the technical data, shop drawings and calculations for each item in this specification.']
  ]],
  ['LV switchboards', true, [
    ['heading', 'Scope'],
    ['clause', 'This section covers the design, manufacture, testing, delivery and installation of the main LV switchboard {{main.id}} and the other switchboards in the board schedule.'],
    ['heading', 'Ratings'],
    ['clause', 'The main switchboard shall be rated {{main.rated}} at {{project.voltage}}, {{project.frequency}}.'],
    ['clause', 'The rated short-time withstand current shall be not less than {{main.icw}} for 1 s, to suit the fault level at the board.'],
    ['clause', 'The degree of protection shall be {{main.ip}} and the busbars shall be {{main.busbar}}.'],
    ['heading', 'Testing'],
    ['clause', 'Each switchboard shall be tested at the works before delivery and again on site after installation. Test records shall be submitted.']
  ]],
  ['Distribution boards', true, [
    ['clause', 'Distribution boards shall be as the board schedule and the load schedules, {{boards.count}} boards in all including the main switchboard.'],
    ['clause', 'Each board shall have a circuit chart fixed inside the door, typed, and matching the as-built load schedule.']
  ]],
  ['Cables and wiring', true, [
    ['clause', 'Cables shall be of the types and sizes in the cable schedule. Sizes are the minimum; the contractor shall confirm them for the routes and installation methods used.'],
    ['clause', 'Each cable shall be in one length between its terminations, with no joints unless agreed in writing.'],
    ['clause', 'Every cable shall be labelled at both ends with the reference in the cable schedule.']
  ]],
  ['Cable containment', true, [
    ['clause', 'Cable trays, ladders and trunking shall be as the containment drawings and the tray schedule, with spare capacity as shown.'],
    ['clause', 'Containment shall be earthed and electrically continuous along its length.']
  ]],
  ['Earthing and lightning protection', true, [
    ['heading', 'Earthing'],
    ['clause', 'The earthing system shall be as the earthing schematic: {{earthing.system}}. Main earth conductors shall be {{earthing.conductor}} copper.'],
    ['clause', 'Each earth pit shall be tested, and its measured resistance recorded against its reference on the earthing schematic.'],
    ['heading', 'Lightning protection'],
    ['clause', 'The lightning protection system shall be {{lightning.class}}, with an air termination of this type: {{lightning.method}}.'],
    ['clause', 'Down conductors, test joints and earth pits shall be as the lightning protection layout.']
  ]],
  ['Lighting and emergency lighting', true, [
    ['clause', 'Luminaires shall be as the luminaire schedule. Samples shall be submitted for review before ordering.'],
    ['clause', 'Emergency lighting shall light the escape routes, open areas and exit signs shown on the drawings, and shall be tested for its full rated duration.']
  ]],
  ['Fire alarm', false, [
    ['clause', 'The fire alarm system shall be as the fire alarm schematic and device schedule, and shall be approved by the authority before handover.']
  ]],
  ['CCTV and access control', false, [
    ['clause', 'CCTV cameras, recorders and access control devices shall be as the ELV schedules.']
  ]],
  ['Structured cabling', false, [
    ['clause', 'Structured cabling shall be as the ELV schedules, tested end to end, with test results submitted.']
  ]]
];
export function starterSpec(): SpecDoc {
  let c = 0;
  return {
    title: 'Electrical specification',
    sections: STARTER.map(([title, included, lines], i) => ({ id: `S${i + 1}`, title, included, clauses: lines.map(([kind, text]) => ({ id: `C${++c}`, kind, text })) }))
  };
}
