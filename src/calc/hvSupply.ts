import type { GridSource, Project, Rmu } from '../types';
import { C_MV, DEFAULT_GRID_XR, gridFaultMva, type Status } from './electrical';

/** HV supply and RMUs: the grid source's fault level and the RMU ratings checked against it. */

/** Up to `d` decimals, trailing zeros dropped (11 kV, 26.2 kA). */
const num = (v: number, d = 1) => v.toLocaleString('en-US', { maximumFractionDigits: d });

/** Initial short-circuit current Ik″ (kA) of a grid source at its own voltage. */
export function gridFaultKa(g: GridSource): number | undefined {
  const s = gridFaultMva(g);
  return s && g.kv > 0 ? s / (Math.sqrt(3) * g.kv) : undefined;
}

/** The RMU record for a name used on the main boards. */
export const rmuRecord = (project: Project, name: string): Rmu | undefined => project.rmus?.find((r) => r.name === name.trim());

/** Grid source feeding an RMU: the one it names, else the project's first. */
export function rmuSource(project: Project, name: string): GridSource | undefined {
  const list = project.gridSources ?? [];
  const id = rmuRecord(project, name)?.sourceId;
  return (id && list.find((g) => g.id === id)) || list[0];
}

/** Ring (R) and tee-off (T) ways of an RMU configuration such as "RRTT". */
export function rmuWays(config: string): { ring: number; tOff: number } {
  const c = config.toUpperCase();
  return { ring: [...c].filter((x) => x === 'R').length, tOff: [...c].filter((x) => x === 'T').length };
}

export interface RmuCheck { label: string; status: Status; text: string }
export interface RmuChecks { rmu: string; source?: GridSource; transformers: string[]; checks: RmuCheck[] }

/** Each RMU in use (or recorded): its tee-off ways against the transformers it feeds, its rated voltage
 * against the grid voltage, and its short-time rating against the grid fault level (I²t equal when the
 * durations differ). Only the values entered are checked. */
export function rmuChecks(project: Project): RmuChecks[] {
  const mains = project.boards.filter((b) => !b.upstreamId);
  const names = [...new Set([...mains.map((b) => b.rmu?.trim()).filter((x): x is string => !!x), ...(project.rmus ?? []).map((r) => r.name)])];
  return names.map((name) => {
    const r = rmuRecord(project, name);
    const source = rmuSource(project, name);
    const transformers = mains.filter((b) => b.sourceKva && b.rmu?.trim() === name).map((b) => b.id);
    const checks: RmuCheck[] = [];
    if (r?.config) {
      const { tOff } = rmuWays(r.config);
      checks.push({ label: 'Tee-off ways', status: transformers.length <= tOff ? 'ok' : 'bad', text: `${transformers.length} transformer${transformers.length === 1 ? '' : 's'} on ${tOff} T-off way${tOff === 1 ? '' : 's'} (${r.config})` });
    }
    if (r?.ratedKv && source?.kv) {
      checks.push({ label: 'Rated voltage', status: r.ratedKv >= source.kv ? 'ok' : 'bad', text: `${num(r.ratedKv, 1)} kV for a ${num(source.kv, 1)} kV supply` });
    }
    const ik = source && gridFaultKa(source);
    if (r?.ikKa && ik) {
      const tr = r.ikDurationS ?? 1;
      const tf = source.faultDurationS ?? tr;
      const eq = r.ikKa * Math.sqrt(tr / tf); // same I²t over the supply's fault duration
      const dur = tf === tr ? `${tr} s` : `${tr} s (${num(eq, 1)} kA for ${tf} s)`;
      checks.push({ label: 'Short-time rating', status: eq >= ik - 1e-9 ? 'ok' : 'bad', text: `${num(r.ikKa, 1)} kA ${dur} against ${num(ik, 1)} kA from ${source.name}` });
    }
    return { rmu: name, source, transformers, checks };
  });
}

/** One line on the MV network for the reports: the grid fault levels used, or undefined when the
 * network is taken as infinite (no grid source with a fault level). */
export function mvNetworkText(project: Project): string | undefined {
  const used = (project.gridSources ?? []).filter((g) => gridFaultMva(g));
  if (!used.length) return undefined;
  const one = (g: GridSource) => `${g.name}${g.operator ? ` (${g.operator})` : ''} ${num(g.kv, 1)} kV, S″kQ ${num(gridFaultMva(g)!, 1)} MVA (${num(gridFaultKa(g)!, 1)} kA), X/R ${num(g.xr && g.xr > 0 ? g.xr : DEFAULT_GRID_XR, 1)}`;
  return `MV network from the grid fault level: ${used.map(one).join('; ')}; c max = ${C_MV} on the HV side, impedance referred to the LV side through each transformer`;
}

/** Short label of a grid source for the SLD: operator, voltage and fault level. */
export function gridLabel(g: GridSource): string {
  const s = gridFaultMva(g);
  return [`${num(g.kv, 1)} kV`, s ? `${num(s, 1)} MVA` : undefined].filter(Boolean).join(' · ');
}

/** Short label of an RMU for the SLD box: name, configuration and voltage. */
export function rmuLabel(project: Project, name: string): string {
  const r = rmuRecord(project, name);
  const kv = rmuSource(project, name)?.kv;
  return [name, r?.config, kv ? `${num(kv)} kV` : '11 kV'].filter(Boolean).join(' · ');
}

/** The RMU's ratings as one line (the SLD tooltip and the Transformers card). */
export function rmuRatings(project: Project, name: string): string {
  const r = rmuRecord(project, name);
  if (!r) return '';
  return [
    r.ratedKv ? `${num(r.ratedKv)} kV` : undefined,
    r.ratedA ? `${num(r.ratedA, 0)} A` : undefined,
    r.ikKa ? `${num(r.ikKa)} kA ${r.ikDurationS ?? 1} s` : undefined,
    r.insulation ? (r.insulation === 'eco-gas' ? 'eco-gas' : r.insulation === 'SF6' ? 'SF6' : `${r.insulation} insulated`) : undefined,
    r.tOff === 'vcb' ? 'T-off circuit breaker + relay' : r.tOff === 'fuse' ? `T-off switch-fuse${r.fuseA ? ` ${num(r.fuseA, 0)} A` : ''}` : undefined,
    r.owner ? `${r.owner === 'authority' ? 'authority' : 'consumer'} owned` : undefined
  ].filter(Boolean).join(', ');
}
