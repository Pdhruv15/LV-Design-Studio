import { lightningProtection, lpsLayout, type LpsInputs } from '../calc/lightningProtection';
import type { Project, SketchItem } from '../types';
import { withBlockDef, type CadBlockDef } from './cadBlocks';
import { plansOf } from './cadPlans';
import { planScale } from './cadUnits';

/** The lightning protection study's roof layout as a Design CAD block: the roof edge conductor, the conductor runs
 * inside it, the rods or terminals, and the down conductors with their numbers. The block's base point is one corner
 * of the roof, so the engineer inserts it on the roof plan at that corner and turns it to suit (INSERT). Concept
 * geometry in plan only; the block is in the drawing's own units. */

export const LP_BLOCK = 'LP-ROOF-LAYOUT';
/** Layer 0: the block's objects take the layer the block is inserted on, as blocks usually do. */
export const LP_LAYER = '0';

/** The block for a drawing whose unit is `metresPerUnit` long (0.001 for millimetres); none while the study has no
 * layout to draw. */
export function lightningRoofBlock(i: LpsInputs, metresPerUnit: number): CadBlockDef | undefined {
  const r = lightningProtection(i);
  if (r.invalid || r.selected.status === 'data' || !(metresPerUnit > 0)) return undefined;
  const plan = lpsLayout(i, r), u = (m: number) => m / metresPerUnit;
  const at = (x: number, y: number): [number, number] => [u(x), u(y)];
  let n = 0;
  const item = (it: Omit<SketchItem, 'id' | 'layer'>): SketchItem => ({ id: `LP${++n}`, layer: LP_LAYER, ...it });
  const items: SketchItem[] = [item({ kind: 'pline', pts: [at(0, 0), at(i.lengthM, 0), at(i.lengthM, i.widthM), at(0, i.widthM)], closed: true })];
  for (const x of plan.meshX) items.push(item({ kind: 'line', pts: [at(x, 0), at(x, i.widthM)] }));
  for (const y of plan.meshY) items.push(item({ kind: 'line', pts: [at(0, y), at(i.lengthM, y)] }));
  // Rods and terminals: a 0.3 m square; down conductors: a 0.5 m circle with its number beside it.
  for (const [x, y] of plan.terminals) items.push(item({ kind: 'pline', pts: [at(x - 0.15, y - 0.15), at(x + 0.15, y - 0.15), at(x + 0.15, y + 0.15), at(x - 0.15, y + 0.15)], closed: true }));
  plan.downs.forEach(([x, y], k) => {
    items.push(item({ kind: 'circle', pts: [at(x, y)], r: u(0.25) }));
    items.push(item({ kind: 'text', pts: [at(x + 0.4, y + 0.4)], text: `DC${k + 1}`, h: u(0.4) }));
  });
  return { name: LP_BLOCK, description: 'Lightning protection roof layout (concept), from the Lightning protection study', items, explodable: true };
}

/** Drawings that are a level's plan, the roof's first when a level is named so. */
export function lightningPlanFiles(p: Project): { file: string; label: string }[] {
  const list = plansOf(p).filter((x): x is typeof x & { file: string } => !!x.file).map((x) => ({ file: x.file, label: `${x.label} — ${x.file}` }));
  return [...list.filter((x) => /roof/i.test(x.label)), ...list.filter((x) => !/roof/i.test(x.label))];
}

/** The project with the roof layout block defined (or redefined) in a drawing: inserts of it follow the study. */
export function withLightningBlock(p: Project, file: string): { project: Project; unit: string; assumed: boolean } | undefined {
  if (!p.lightning) return undefined;
  const scale = planScale(p, file, p.cadPlans?.find((x) => x.file.trim().toLowerCase() === file.trim().toLowerCase())?.units);
  const def = lightningRoofBlock(p.lightning, scale.factor);
  return def ? { project: withBlockDef(p, file, def), unit: scale.label, assumed: scale.assumed } : undefined;
}
