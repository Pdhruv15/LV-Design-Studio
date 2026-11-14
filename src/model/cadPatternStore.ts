import { validCustom, withPatterns, type CustomPattern } from './cadHatch';

/** Design CAD → Hatch patterns kept on this computer for every project (browser storage; none when it is refused). */
const KEY = 'lvds.cadPatterns.computer', MAX = 500;

/** The patterns kept on this computer (only valid ones, at most 500). */
export function loadComputerPatterns(): CustomPattern[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((c): c is CustomPattern => validCustom(c)).slice(0, MAX) : [];
  } catch { return []; }
}
/** Keeps the list on this computer; false when storage refused it. */
export function saveComputerPatterns(list: CustomPattern[]): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(list.filter((c) => validCustom(c)).slice(0, MAX))); return true; } catch { return false; }
}
/** Adds patterns to the ones kept on this computer (one of the same name is replaced); the list now kept. */
export function keepComputerPatterns(add: CustomPattern[]): CustomPattern[] {
  const list = withPatterns(loadComputerPatterns(), add);
  saveComputerPatterns(list);
  return list;
}
