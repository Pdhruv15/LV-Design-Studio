import { CAD_COMMANDS, cadCommand, commandFullName, commandId, type CadCommand, type OwnAliases } from './cadCommands';

/** The user's own keys: a key chord ("F4", "Ctrl+2", "Shift+F5") → the id of its command. */
export type OwnKeys = Readonly<Record<string, string>>;

/** The standard keys, which stay: chord → command id. */
export const STANDARD_KEYS: OwnKeys = { F1: 'HELP', F2: 'HISTORY', F3: 'OSNAP', F7: 'GRID', F8: 'ORTHO', F9: 'SNAP', F10: 'POLAR', F11: 'OTRACK', F12: 'DYN', 'Ctrl+1': 'PR' };

const NAME = /^[A-Z][A-Z0-9]{0,15}$/;
const isId = (id: unknown): id is string => typeof id === 'string' && CAD_COMMANDS.some((c) => commandId(c) === id);
const byId = (id: string): CadCommand | undefined => CAD_COMMANDS.find((c) => commandId(c) === id);
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The names as kept, checked: a name of letters and digits that is no standard alias, for a command that exists (200 at most). */
export function ownAliases(v: unknown): OwnAliases {
  const out: Record<string, string> = {};
  if (!isObject(v)) return out;
  for (const [k, id] of Object.entries(v)) {
    if (Object.keys(out).length >= 200) break;
    if (NAME.test(k) && !cadCommand(k) && isId(id)) out[k] = id;
  }
  return out;
}

/** Why a typed name (trimmed, upper case) cannot be added to the command with this id; null when it can. */
export function aliasProblem(name: string, id: string, own: OwnAliases): string | null {
  if (!NAME.test(name)) return 'Letters and digits only, starting with a letter (16 at most).';
  const other = cadCommand(name, own);
  if (!other) return null;
  const full = commandFullName(other);
  return commandId(other) === id ? `${name} is already a typed name of ${full}.` : `${name} is the typed name of ${full}. Choose another.`;
}

const CHORD = /^(?:Ctrl\+)?(?:Alt\+)?(?:Shift\+)?(?:F(?:[1-9]|1[0-2])|[0-9])$/;
/** Whether the text is a chord a command can have. */
const isChord = (s: string): boolean => {
  if (!CHORD.test(s)) return false;
  const parts = s.split('+'), k = parts[parts.length - 1], mods = parts.slice(0, -1);
  if (/^[0-9]$/.test(k)) return mods.includes('Ctrl');
  return s !== 'Shift+F10' && s !== 'Alt+F4';
};

/** The chord a key press makes ("F4", "Shift+F5", "Ctrl+2"), or null when it is not one a command can have. */
export function chordOf(e: { key: string; code?: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }): string | null {
  const ctrl = e.ctrlKey || e.metaKey;
  const digit = /^Digit([0-9])$/.exec(e.code ?? '')?.[1] ?? (/^[0-9]$/.test(e.key) ? e.key : null);
  const key = /^F(?:[1-9]|1[0-2])$/.test(e.key) ? e.key : digit && ctrl ? digit : null;
  if (!key) return null;
  const chord = `${ctrl ? 'Ctrl+' : ''}${e.altKey ? 'Alt+' : ''}${e.shiftKey ? 'Shift+' : ''}${key}`;
  return isChord(chord) ? chord : null;
}

/** A chord as shown: on a Mac ⌘, ⌥ and ⇧ for Ctrl, Alt and Shift; elsewhere the chord itself. */
export const chordLabel = (chord: string, mac: boolean): string => (mac ? chord.replace('Ctrl+', '⌘').replace('Alt+', '⌥').replace('Shift+', '⇧') : chord);

/** The keys as kept, checked: a chord a command can have that is no standard key, for a command that exists (100 at most). */
export function ownKeys(v: unknown): OwnKeys {
  const out: Record<string, string> = {};
  if (!isObject(v)) return out;
  for (const [k, id] of Object.entries(v)) {
    if (Object.keys(out).length >= 100) break;
    if (isChord(k) && STANDARD_KEYS[k] === undefined && isId(id)) out[k] = id;
  }
  return out;
}

/** The command that has the key, standard or the user's own, if any. */
export function commandOfKey(chord: string, own: OwnKeys): CadCommand | undefined {
  const id = STANDARD_KEYS[chord] ?? own[chord];
  return id === undefined ? undefined : byId(id);
}

/** Why a key cannot be added to the command with this id; null when it can. */
export function keyProblem(chord: string, id: string, own: OwnKeys): string | null {
  const other = commandOfKey(chord, own);
  if (!other) return null;
  const full = commandFullName(other);
  return commandId(other) === id ? `${chord} is already a key of ${full}.` : `${chord} is the key of ${full}. Choose another.`;
}

/** A command's keys: the standard ones, then the user's own for it. */
export function keysOf(c: CadCommand, own: OwnKeys): { chord: string; own: boolean }[] {
  const id = commandId(c);
  return [
    ...Object.keys(STANDARD_KEYS).filter((k) => STANDARD_KEYS[k] === id).map((chord) => ({ chord, own: false })),
    ...Object.keys(own).filter((k) => own[k] === id && STANDARD_KEYS[k] === undefined).map((chord) => ({ chord, own: true }))
  ];
}

/** The commands whose description or any typed name contains every word of the filter, in the list's order. */
export function commandRows(filter: string): CadCommand[] {
  const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [...CAD_COMMANDS];
  return CAD_COMMANDS.filter((c) => { const hay = `${c.desc} ${c.aliases.join(' ')}`.toLowerCase(); return words.every((w) => hay.includes(w)); });
}
