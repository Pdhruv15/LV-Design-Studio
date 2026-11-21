import type { Project } from '../types';
import { settingsOf } from '../types';
import { assess } from './loadAssessment';
import { summarize } from './spacePlan';
import { buildDashboard } from './dashboard';
import { sizeGeneratorByBoards, sizeTransformers, txGenPlanOf } from './txGen';
import { isEssential } from './sizing';

export interface SupplyRow {
  key: 'assessment' | 'plan' | 'study' | 'network';
  /** e.g. "2 × 1,250 kVA", or "1,000 + 1,500 kVA" when the sizes differ. */
  transformers: string;
  count: number;
  totalKva: number; // installed kVA carrying the demand (duty units for the assessment)
  demandKva: number;
  loadingPct: number; // demandKva ÷ totalKva × 100 (0 when there is no kVA)
  rmus?: number; // plan only
  differs: boolean; // its transformers text is not the assessment's (false for the assessment row and when there is no assessment)
}

const f0 = (n: number) => n.toLocaleString('en-US');
const sizesText = (kvas: number[]) => kvas.every((k) => k === kvas[0]) ? `${kvas.length} × ${f0(kvas[0])} kVA` : `${kvas.map(f0).join(' + ')} kVA`;
const pct = (demand: number, kva: number) => kva > 0 ? (demand / kva) * 100 : 0;

/** The transformers as the load assessment gives them, as the space plan arranges them and as the network has them. Rows that have nothing are left out. */
export function supplyProgress(project: Project, withStudy = false): SupplyRow[] {
  const rows: SupplyRow[] = [];
  const a = project.loadAssessment;
  const r = a ? assess(a) : undefined;
  if (r?.tx) {
    const totalKva = r.tx.duty * r.tx.kva;
    rows.push({ key: 'assessment', transformers: `${r.tx.count} × ${f0(r.tx.kva)} kVA`, count: r.tx.count, totalKva, demandKva: r.mdKva, loadingPct: pct(r.mdKva, totalKva), differs: false });
  }
  const text0 = rows[0]?.transformers;
  const plan = project.spacePlan;
  if (plan?.areas.length) {
    const s = summarize(plan);
    const kvas = plan.transformers.length ? plan.transformers.map((t) => t.kva) : Array.from({ length: s.requiredTransformers }, () => s.transformerKva);
    if (kvas.length) {
      const totalKva = kvas.reduce((x, y) => x + y, 0);
      const transformers = sizesText(kvas);
      rows.push({ key: 'plan', transformers, count: kvas.length, totalKva, demandKva: s.demandKva, loadingPct: pct(s.demandKva, totalKva), rmus: plan.transformers.length ? s.rmus.length : s.requiredRmus, differs: text0 !== undefined && transformers !== text0 });
    }
  }
  if (withStudy) {
    try {
      const growth = 1 + settingsOf(project).futureGrowthPct / 100;
      const tx = sizeTransformers(project, txGenPlanOf(project)).filter((t) => t.recommendedKva);
      const kvas = tx.flatMap((t) => Array.from({ length: t.split }, () => t.recommendedKva!));
      if (kvas.length) {
        const totalKva = kvas.reduce((x, y) => x + y, 0);
        const demandKva = tx.reduce((x, t) => x + t.demandKva * growth, 0);
        const transformers = sizesText(kvas);
        rows.push({ key: 'study', transformers, count: kvas.length, totalKva, demandKva, loadingPct: pct(demandKva, totalKva), differs: text0 !== undefined && transformers !== text0 });
      }
    } catch { /* an incomplete project has no study figures yet */ }
  }
  try {
    const d = buildDashboard(project);
    if (d.transformers.length) {
      const transformers = sizesText(d.transformers.map((t) => t.kva));
      rows.push({ key: 'network', transformers, count: d.transformers.length, totalKva: d.transformerKva, demandKva: d.demandKva, loadingPct: pct(d.demandKva, d.transformerKva), differs: text0 !== undefined && transformers !== text0 });
    }
  } catch { /* an incomplete project has no network figures yet */ }
  return rows;
}

export interface GeneratorRow { key: 'assessment' | 'study' | 'network'; essentialKw?: number; neededKva?: number; setText: string; differs: boolean }
export interface GeneratorProgress { rows: GeneratorRow[]; /** Essential kW that are still stand-in feeders made from the load assessment or the space plan. */ standInKw: number; standInFeeders: number }

const NO_FIT = 'no standard set fits';

/** The standby generator as the load assessment gives it, as this study sizes it and as the network has it. */
export function generatorProgress(project: Project): GeneratorProgress {
  const rows: GeneratorRow[] = [];
  const a = project.loadAssessment;
  const r = a ? assess(a) : undefined;
  if (r && r.generatorKvaRequired > 0) {
    const setText = r.generatorKva ? `${r.generatorCount > 1 ? `${r.generatorCount} × ` : ''}${f0(r.generatorKva)} kVA` : NO_FIT;
    rows.push({ key: 'assessment', essentialKw: r.generatorKw, neededKva: r.generatorKvaRequired, setText, differs: false });
  }
  let installed: number | undefined;
  try {
    const g = sizeGeneratorByBoards(project, txGenPlanOf(project));
    installed = g.installedKva;
    if (g.demandKva > 0) {
      const setText = g.recommendedKva ? `${f0(g.recommendedKva)} kVA` : NO_FIT;
      rows.push({ key: 'study', essentialKw: g.demandKw, neededKva: Math.max(g.runningDesignKva, g.startDesignKva), setText, differs: rows.length > 0 && setText !== rows[0].setText });
    }
  } catch { /* an incomplete project has no study figures yet */ }
  if (rows.length) {
    const setText = installed ? `${f0(installed)} kVA` : 'none on the SLD';
    const compare = rows.find((x) => x.key === 'study') ?? rows[0];
    rows.push({ key: 'network', setText, differs: !installed || setText !== compare.setText });
  }
  const standIn = project.feeders.filter((f) => isEssential(f) && (f.fromRoom?.startsWith('la:') || f.fromRoom?.startsWith('sp:')));
  return { rows, standInKw: standIn.reduce((x, f) => x + f.loadKw * f.demandFactor, 0), standInFeeders: standIn.length };
}
