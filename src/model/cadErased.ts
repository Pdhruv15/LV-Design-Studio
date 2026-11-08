import type { CadObject, CadView } from '../engines/cad/cadEngine';
import type { Project } from '../types';

/** Objects of the open drawing erased in Design CAD (CROP: a block cut, replaced by its kept pieces), by handle, per
 * plan file. The drawing file is never changed: the view leaves them out (drawn lines, texts, fills, blocks for Loads
 * from CAD, closed outlines for rooms), the engine no longer picks or snaps to them, and SAVE / SAVEDWG write the copy
 * without them. ⌘Z brings them back with the project. */

/** What the view leaves out, as the engine answers `erase`: object ids and their drawn segments (start, end). */
export interface ErasedParts { objects: number[]; ranges: [number, number][] }

const keyOf = (file: string) => file.trim().toLowerCase();

/** The erased handles of a plan file. */
export const erasedOf = (p: Project, file: string | undefined): string[] => (file ? p.cadErased?.[keyOf(file)] ?? [] : []);

/** The project with these handles erased in a plan file too. */
export function withErased(p: Project, file: string, handles: string[]): Project {
  const list = [...new Set([...erasedOf(p, file), ...handles.map((h) => h.trim().toUpperCase()).filter(Boolean)])];
  return { ...p, cadErased: { ...(p.cadErased ?? {}), [keyOf(file)]: list } };
}

/** The project with every object erased in a plan file back (RESTOREDWG). */
export function restoredErased(p: Project, file: string): Project {
  if (!erasedOf(p, file).length) return p;
  const { [keyOf(file)]: _gone, ...rest } = p.cadErased ?? {};
  return { ...p, cadErased: Object.keys(rest).length ? rest : undefined };
}

/** The drawing as shown with its erased objects left out. Segment indices are kept (fills and outlines refer to them):
 * an erased segment is drawn as nothing (both ends at its start, which a butt-capped stroke does not show). */
export function shownView(v: CadView, parts: ErasedParts, handles: string[]): CadView {
  if (!parts.objects.length && !handles.length) return v;
  const segs = v.segs.slice();
  for (const [a, z] of parts.ranges) for (let i = a; i < z; i++) { segs[i * 4 + 2] = segs[i * 4]; segs[i * 4 + 3] = segs[i * 4 + 1]; }
  const gone = new Set(parts.objects), hs = new Set(handles.map((h) => h.toUpperCase()));
  const inRange = (s: number) => parts.ranges.some(([a, z]) => s >= a && s < z);
  const texts = v.info.texts.filter((t) => t.o === undefined || !gone.has(t.o));
  const fills = (v.info.fills ?? []).filter((f) => !f.loops.some(([a]) => inRange(a)));
  const keep = (o: CadObject) => !hs.has(o.handle.toUpperCase());
  return {
    ...v, segs, info: { ...v.info, texts, fills },
    blocks: () => v.blocks().filter((b) => !hs.has(b.handle.toUpperCase())),
    outlines: () => v.outlines().filter(keep)
  };
}
