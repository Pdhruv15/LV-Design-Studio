import { fileStamp, readRefGeometry, refGeometryOf, sampleDrawing } from '../../engines/cad/cadEngine';
import { planOfLevel } from '../../model/cadPlans';
import { keepRefGeometry, refGeometry, refsOf, type RefGeometry } from '../../model/cadRefs';
import { isSample, pathOfPlan } from './cadState';
import type { Project } from '../../types';

/** Reads a reference file of the project: one of the sample plans, else from where it was found on this computer
 * (desktop). Null when it is not there or cannot be read here (web version). */
export async function readRefFile(projectId: string | undefined, file: string): Promise<RefGeometry | null> {
  if (isSample(file)) {
    const v = await sampleDrawing(file);
    if (!v) return null;
    try { return refGeometryOf(v); } finally { v.close(); }
  }
  const path = pathOfPlan(projectId, file), bytes = path ? await window.lvds?.cadFile?.readBytes?.(path) : null;
  if (!bytes) return null;
  return readRefGeometry(bytes.file, bytes.bytes, (await fileStamp(path)) ?? undefined);
}

/** Plan sheets: the references of a level's plan that print but were not read since the app started are read now,
 * so the sheet prints them without opening the plan in Design CAD first. One that cannot be read still shows in the
 * sheet's notes as not printed. Returns the files read. */
export async function readSheetRefs(p: Project, building: string | undefined, level: string | undefined): Promise<string[]> {
  const plan = building && level ? planOfLevel(p, { building, level }) : undefined;
  if (!plan) return [];
  const read: string[] = [];
  for (const r of refsOf(p, plan.file)) {
    if (!r.print || r.unloaded || refGeometry(r.file)) continue;
    const g = await readRefFile(p.id, r.file).catch(() => null);
    if (!g) continue;
    keepRefGeometry({ ...g, file: r.file });
    read.push(r.file);
  }
  return read;
}
