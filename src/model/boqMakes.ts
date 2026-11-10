import { pushLibrary } from '../database/librarySync';

/** Approved makes, specification references and preambles of a BOQ. The office
 * keeps named lists (saved beside the price lists); a project keeps a copy in
 * its BOQ settings, so the bill travels with the file. The app ships no
 * manufacturer names: the office types them. */
export interface MakeEntry { makes: string[]; specRef?: string }
export interface BoqMakeList {
  id: string;
  name: string;
  date: string;
  orEqual?: boolean; // print "or approved equal" after the makes (default on)
  categories: Record<string, MakeEntry>;
  preambles: Record<string, string>; // by section letter, plus 'general'
}

export const MAX_MAKES = 3;

/** Equipment categories, by BOQ line-key prefix (the part before the first ":"). */
export interface MakeCategory { id: string; section: string; label: string; prefixes: string[] }
export const MAKE_CATEGORIES: MakeCategory[] = [
  { id: 'switchboard', section: 'A', label: 'Switchboards and distribution boards', prefixes: ['panel', 'enc-extra'] },
  { id: 'acb', section: 'B', label: 'ACB', prefixes: ['acb', 'acb-il'] },
  { id: 'mccb', section: 'B', label: 'MCCB', prefixes: ['mccb'] },
  { id: 'mcb', section: 'B', label: 'MCB / RCBO / RCCB', prefixes: ['mcb', 'rccb', 'rcd'] },
  { id: 'isolator', section: 'B', label: 'Isolators and switch-disconnectors', prefixes: ['iso', 'switch-isol'] },
  { id: 'ats', section: 'B', label: 'Automatic transfer switches', prefixes: ['ats'] },
  { id: 'relay', section: 'B', label: 'Protection relays', prefixes: ['relay'] },
  { id: 'spd', section: 'B', label: 'Surge protection devices', prefixes: ['spd'] },
  { id: 'meter', section: 'C', label: 'Meters and instruments', prefixes: ['kwh', 'ct', 'pmu', 'ammeter-ss', 'voltmeter-ss', 'pfr', 'lamps-ryb'] },
  { id: 'transformer', section: 'D', label: 'Transformers', prefixes: ['tx'] },
  { id: 'rmu', section: 'D', label: 'Ring main units', prefixes: ['rmu'] },
  { id: 'generator', section: 'D', label: 'Generators', prefixes: ['gen'] },
  { id: 'ups', section: 'D', label: 'UPS', prefixes: ['ups'] },
  { id: 'capacitor', section: 'D', label: 'Capacitor banks', prefixes: ['cap'] },
  { id: 'ev', section: 'D', label: 'EV chargers', prefixes: ['ev-charger'] },
  { id: 'pv-module', section: 'D', label: 'Solar PV modules', prefixes: ['pv-module'] },
  { id: 'pv-inverter', section: 'D', label: 'Solar PV inverters', prefixes: ['pv-inverter'] },
  { id: 'pv-bos', section: 'D', label: 'Solar PV mounting, DC cable and protection', prefixes: ['pv-mount', 'pv-dc-cable', 'pv-connector', 'pv-dc-isol', 'pv-dc-spd', 'pv-ac-isol'] },
  { id: 'cable', section: 'E', label: 'LV cables and wiring', prefixes: ['cable', 'wire-conductor', 'cpc', 'ecc'] },
  { id: 'accessory', section: 'F', label: 'Cable glands and lugs', prefixes: ['gland', 'lug'] },
  { id: 'busway', section: 'G', label: 'Busbar trunking', prefixes: ['busway', 'busway-el', 'busway-end', 'busway-feed', 'busway-fix', 'busway-tap'] },
  { id: 'tray', section: 'H', label: 'Cable tray and fittings', prefixes: ['tray', 'tray-bend', 'tray-cover', 'tray-cpl', 'tray-red', 'tray-riser', 'tray-sup', 'tray-tee'] },
  { id: 'earthing', section: 'I', label: 'Earthing materials', prefixes: ['earth-body', 'earth-link', 'earth-pit', 'met'] },
  { id: 'luminaire', section: 'J', label: 'Luminaires (types L1…)', prefixes: ['luminaire'] },
  { id: 'emergency', section: 'J', label: 'Emergency lighting and signs', prefixes: ['em'] }
];

const BY_PREFIX = new Map(MAKE_CATEGORIES.flatMap((c) => c.prefixes.map((p) => [p, c.id] as const)));

/** Category of a BOQ line key, or undefined (manual lines, point counts, sundries). */
export function categoryOf(key: string): string | undefined {
  const [kind, second] = key.replace(/:emg$/, '').split(':');
  // Incomers and bus couplers carry the device in the key: "incomer:ACB:1600".
  if (kind === 'incomer' || kind === 'tie') return second === 'ACB' ? 'acb' : second === 'MCCB' ? 'mccb' : undefined;
  return BY_PREFIX.get(kind);
}

/** Up to three non-empty, trimmed, distinct makes. */
export function cleanMakes(makes: readonly (string | undefined)[] | undefined): string[] {
  const out: string[] = [];
  for (const m of makes ?? []) {
    const t = m?.trim();
    if (t && !out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
    if (out.length === MAX_MAKES) break;
  }
  return out;
}

/** "A / B / C or approved equal" — empty when there are no makes. */
export function makesText(makes: readonly string[], orEqual = true): string {
  const m = cleanMakes(makes);
  return m.length ? `${m.join(' / ')}${orEqual ? ' or approved equal' : ''}` : '';
}

export interface LineMakes { makes?: string; specRef?: string }
/** Makes and specification reference of one line: its own override first, then its category. */
export function lineMakes(key: string, list: BoqMakeList | undefined, own?: { makes?: string[]; specRef?: string }): LineMakes {
  const cat = categoryOf(key);
  const entry = cat ? list?.categories[cat] : undefined;
  const ownMakes = cleanMakes(own?.makes);
  const makes = makesText(ownMakes.length ? ownMakes : entry?.makes ?? [], list?.orEqual ?? true);
  const specRef = own?.specRef?.trim() || entry?.specRef?.trim();
  return { makes: makes || undefined, specRef: specRef || undefined };
}

/** Preamble text of a section ('general' for the bill as a whole), trimmed; undefined when empty. */
export function preambleOf(list: BoqMakeList | undefined, section: string): string | undefined {
  return list?.preambles[section]?.trim() || undefined;
}

/** Generic starting preambles: standards-based wording to adapt to the project specification. */
export const DEFAULT_PREAMBLES: Record<string, string> = {
  general: 'Rates shall include supply, delivery to site, installation, testing and commissioning, and all labour, plant and sundry materials, unless the line states supply only or installation only.\n'
    + 'Equipment shall be from the approved makes listed against each item, or an approved equal accepted in writing by the Engineer.\n'
    + 'Work shall comply with the project specification and the local authority regulations. Quantities are measured net from the drawings; the contractor shall allow for wastage.',
  A: 'Switchboards and distribution boards shall be type-tested assemblies to IEC 61439-1/-2, with the form of separation, IP rating and short-circuit rating scheduled. Rates include busbars, internal wiring, labels and spare ways shown.',
  B: 'Circuit breakers shall comply with IEC 60947-2 (ACB, MCCB) or IEC 60898-1 / IEC 61009-1 (MCB, RCBO), with ratings and breaking capacity not less than those scheduled.',
  C: 'Meters and instruments shall be of the accuracy class scheduled and approved by the supply authority where used for billing.',
  E: 'Cables shall comply with the relevant IEC 60502-1 / BS standards and be measured along the route from the drawings. Rates include fixing, terminations at both ends and testing.',
  F: 'Glands and lugs shall suit the cable type and size; rates include fixing and crimping with the correct tooling.',
  H: 'Cable tray and fittings shall be hot-dip galvanised to the specification unless stated otherwise. Rates include supports, couplers, earth continuity and fixings.',
  I: 'Earthing shall comply with IEC 60364-5-54 / BS 7671. Rates include connections, test links, labels and test results.'
};

export const newMakeList = (name = 'Office makes'): BoqMakeList => ({
  id: `mk-${Date.now().toString(36)}`, name, date: new Date().toISOString().slice(0, 10), orEqual: true, categories: {}, preambles: { ...DEFAULT_PREAMBLES }
});

/** A list read from storage or a file: unknown fields dropped, makes cleaned. */
export function normalizeMakeList(v: unknown): BoqMakeList | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Partial<BoqMakeList>;
  if (typeof o.id !== 'string' || typeof o.name !== 'string') return undefined;
  const categories: Record<string, MakeEntry> = {};
  for (const [id, e] of Object.entries(o.categories ?? {})) {
    if (!e || typeof e !== 'object') continue;
    const makes = cleanMakes(Array.isArray(e.makes) ? e.makes.map((x) => typeof x === 'string' ? x : undefined) : []);
    const specRef = typeof e.specRef === 'string' && e.specRef.trim() ? e.specRef.trim() : undefined;
    if (makes.length || specRef) categories[id] = specRef ? { makes, specRef } : { makes };
  }
  const preambles: Record<string, string> = {};
  for (const [s, t] of Object.entries(o.preambles ?? {})) if (typeof t === 'string') preambles[s] = t;
  return { id: o.id, name: o.name, date: typeof o.date === 'string' ? o.date : '', orEqual: o.orEqual !== false, categories, preambles };
}

const KEY = 'lvds.boqMakeLists';
/** The office's saved lists on this computer. */
export function loadMakeLists(): BoqMakeList[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.map(normalizeMakeList).filter((x): x is BoqMakeList => !!x) : [];
  } catch { return []; }
}
export function saveMakeLists(lists: BoqMakeList[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(lists)); void pushLibrary(); } catch { /* storage full or blocked */ }
}
