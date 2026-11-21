import type { Project, SpaceArea, SpacePlan, SpacePlanSettings, SpaceUse } from '../types';
import { buildingInfoOf } from './building';
import { assess, buildingFigures, clgInBasis, DEFAULT_DIVERSITY, DEFAULT_FACTORS, isCooled, LA_LOCATIONS, type LaStandard, type LoadAssessment } from './loadAssessment';
import { DEFAULT_USES, emptyPlan, planSizes, summarize, usesOf } from './spacePlan';

/** The load assessment against the space plan. The assessment says how much (maximum demand,
 * transformers); the plan says from where (loads on MDBs, MDBs on transformers, transformers
 * on RMUs). Nothing here changes the plan on its own. */

const round2 = (x: number) => Math.round(x * 100) / 100;

/** The assessment's loads as plan rows: one per building and load category (services and
 * custom loads included), each with its connected kW and its diversity. A category is shared
 * between the counted buildings by their floor area. Fire and life safety is not in the
 * normal demand (demand factor 0). */
export function assessmentLoads(project: Project, a: LoadAssessment): SpaceArea[] {
  const info = buildingInfoOf(project);
  const ids = a.from?.buildingIds;
  const counted = ids?.length ? info.buildings.filter((b) => ids.includes(b.id)) : info.buildings;
  const parts = counted.length ? counted.map((b) => ({ id: b.id, name: b.name, gfa: buildingFigures(project, [b.id]).gfaM2 ?? 0 })) : [{ id: 'all', name: project.name || 'Building', gfa: 1 }];
  const total = parts.reduce((s, p) => s + p.gfa, 0);
  const out: SpaceArea[] = [];
  for (const p of parts) {
    const share = total > 0 ? p.gfa / total : 1 / parts.length;
    for (const c of assess(a).categories) {
      const kw = round2(c.connectedKw * share);
      if (kw < 0.005) continue;
      out.push({ id: `la-${p.id}-${c.key.replace(':', '-')}`, building: p.name, name: c.label, use: 'services', kw, demandFactor: c.diversity, from: 'la', laKey: c.key });
    }
  }
  return out;
}

/** The plan with the assessment's loads as its rows. Rows taken from the rooms or from an
 * earlier take are replaced; rows typed by hand are kept, and so is the panel of a row that
 * was there before. */
export function takeLoads(project: Project, plan: SpacePlan, a: LoadAssessment): SpacePlan {
  const panelOf = new Map(plan.areas.map((x) => [x.id, x.panel]));
  const typed = plan.areas.filter((x) => x.from !== 'la' && !x.id.startsWith('room-') && !x.id.startsWith('unit-'));
  const rows = assessmentLoads(project, a).map((x) => ({ ...x, ...(panelOf.get(x.id) ? { panel: panelOf.get(x.id) } : {}) }));
  const uses = plan.uses && !plan.uses.some((u) => u.id === 'services') ? [...plan.uses, DEFAULT_USES.find((u) => u.id === 'services')!] : plan.uses;
  const { kept: _kept, ...rest } = plan;
  return { ...rest, areas: [...rows, ...typed], ...(uses ? { uses } : {}) };
}

/** The plan's settings with the assessment's loading limit, power factor, spare and coincidence. */
export function withAssessmentSettings(s: SpacePlanSettings, a: LoadAssessment): SpacePlanSettings {
  const pf = a.supply.pf > 0 && a.supply.pf <= 1 ? a.supply.pf : 0.9;
  return { ...s, maxLoadingPct: a.supply.maxLoadingPct || 100, powerFactor: pf, growthPct: a.supply.sparePct || 0, coincidence: a.supply.coincidence || 1 };
}

export interface PlanLinkRow { key: 'md' | 'tx' | 'sizes' | 'settings'; assessment: string; plan: string; differs: boolean; pct?: number }
export interface PlanLink {
  rows: PlanLinkRow[];
  /** The plan's rows come from the assessment. */
  fromAssessment: boolean;
  differs: boolean;
  /** Differs, and the user has not kept the plan's figures against this state of the assessment. */
  notice: boolean;
}

const n0 = (x: number) => Math.round(x).toLocaleString('en-US');
const range = (xs: number[]) => (xs.length > 2 ? `${n0(xs[0])} to ${n0(xs[xs.length - 1])} kVA` : `${xs.map(n0).join(' or ')} kVA`);
const settingsText = (loading: number, pf: number, spare: number, coincidence: number) => `${n0(loading)} % · ${pf.toFixed(2)} · ${n0(spare)} % · ${coincidence.toFixed(2)}`;

function signature(a: LoadAssessment): string {
  const r = assess(a);
  return [Math.round(r.mdKva), r.tx?.count ?? 0, r.tx?.kva ?? 0, a.supply.maxLoadingPct, a.supply.pf, a.supply.sparePct, a.supply.coincidence].join('|');
}

/** The assessment's figures beside the plan's: maximum demand, transformers, sizes and settings. Undefined without an assessment. */
export function planLink(project: Project): PlanLink | undefined {
  const a = project.loadAssessment;
  if (!a) return undefined;
  const plan = project.spacePlan ?? emptyPlan();
  const r = assess(a), sum = summarize(plan), s = plan.settings;
  const pf = a.supply.pf > 0 && a.supply.pf <= 1 ? a.supply.pf : 0.9;
  const mdDiffers = Math.abs(sum.demandKva - r.mdKva) > Math.max(1, 0.02 * r.mdKva);
  const txA = r.tx ? `${r.tx.count} × ${n0(r.tx.kva)} kVA` : '—', txP = `${sum.requiredTransformers} × ${n0(sum.transformerKva)} kVA`;
  const setA = settingsText(a.supply.maxLoadingPct || 100, pf, a.supply.sparePct || 0, a.supply.coincidence || 1);
  const setP = settingsText(s.maxLoadingPct, s.powerFactor, s.growthPct, s.coincidence ?? 1);
  const sizesA = r.txSizes.filter((x) => x <= (a.supply.maxTxKva || Infinity)), sizesP = planSizes(s);
  const rows: PlanLinkRow[] = [
    { key: 'md', assessment: `${n0(r.mdKva)} kVA`, plan: `${n0(sum.demandKva)} kVA`, differs: mdDiffers, pct: r.mdKva > 0 ? ((sum.demandKva - r.mdKva) / r.mdKva) * 100 : undefined },
    { key: 'tx', assessment: txA, plan: txP, differs: !!r.tx && txA !== txP },
    { key: 'sizes', assessment: sizesA.length ? range(sizesA) : '—', plan: range(sizesP), differs: sizesA.join() !== sizesP.join() },
    { key: 'settings', assessment: setA, plan: setP, differs: setA !== setP }
  ];
  const differs = rows.some((x) => x.differs);
  return { rows, fromAssessment: plan.areas.some((x) => x.from === 'la'), differs, notice: differs && plan.kept !== signature(a) };
}

/** Keeps the plan's own figures: the notice stays away until the assessment changes again. */
export function keepPlanFigures(plan: SpacePlan, a: LoadAssessment): SpacePlan {
  return { ...plan, kept: signature(a) };
}

/** Use types from a density standard: one per space and location, its W/m² the lighting, power and
 * (for a cooled space) the electrical A/C load together, its demand factor their diversities weighed
 * by load. With no assessment, the starting cooling factor and diversities are used. */
export function usesFromStandard(std: LaStandard, a?: LoadAssessment): SpaceUse[] {
  const factor = a ? a.factors.cool[a.services.cool] ?? 0 : DEFAULT_FACTORS.cool.vrf;
  const d = a?.diversity ?? DEFAULT_DIVERSITY;
  return std.spaces.map((x) => {
    const ac = isCooled(x) ? clgInBasis(x.clg, std.acBasis, 'electrical', factor) : 0;
    const w = x.ltg + x.pwr + ac;
    const loc = x.location ? LA_LOCATIONS.find((l) => l.value === x.location)!.label.toLowerCase() : '';
    return {
      id: x.location ? `${x.id}-${x.location}` : x.id, label: loc ? `${x.label} (${loc})` : x.label,
      wPerM2: Math.round(w * 10) / 10, demandFactor: w > 0 ? round2((x.ltg * d.ltg + x.pwr * d.pwr + ac * d.hvac) / w) : 1
    };
  });
}

/** The plan with the standard's use types: uses the rows refer to and the standard lacks are kept. */
export function withStandardUses(plan: SpacePlan, std: LaStandard, a?: LoadAssessment): SpacePlan {
  const next = usesFromStandard(std, a);
  const used = new Set(plan.areas.map((x) => x.use));
  const kept = usesOf(plan).filter((u) => (used.has(u.id) || u.id === 'services') && !next.some((n) => n.id === u.id));
  return { ...plan, uses: [...next, ...kept] };
}
