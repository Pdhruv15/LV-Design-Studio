/** External lightning protection at concept stage, for one rectangular building. Four ways of covering the
 * roof are worked out side by side from the same inputs: a conductor mesh, vertical rods by the protection
 * angle, vertical rods by the rolling sphere (methods of IEC 62305-3) and an early streamer emission (ESE)
 * terminal (method of NFC 17-102, which is not an IEC method). Then the down conductors, earth pits and
 * quantities of the chosen method.
 *
 * No value of a standard is built in. The protection class, mesh size, sphere radius, protection angle and
 * down conductor spacing are entered from the engineer's own risk assessment and copy of the standard, and the
 * ESE advance time from the manufacturer's test certificate. A value that is missing gives DATA REQUIRED for
 * the method that needs it — nothing is assumed. Flat roof, plan geometry, metres. Not covered: the risk
 * assessment itself, separation distance, and detailing. */

export type LpsClass = 'I' | 'II' | 'III' | 'IV';
export type AirMethod = 'mesh' | 'angle' | 'sphere' | 'ese';
export const AIR_METHODS: { id: AirMethod; label: string; reference: string }[] = [
  { id: 'mesh', label: 'Mesh on flat roof', reference: 'IEC 62305-3' },
  { id: 'angle', label: 'Vertical rods — protection angle', reference: 'IEC 62305-3' },
  { id: 'sphere', label: 'Vertical rods — rolling sphere', reference: 'IEC 62305-3' },
  { id: 'ese', label: 'ESE air terminal', reference: 'NFC 17-102' }
];

export interface LpsInputs {
  lengthM: number;
  widthM: number;
  heightM: number;
  method: AirMethod;
  /** Protection class (lightning protection level), from the engineer's risk assessment. */
  lpsClass?: LpsClass;
  /** The risk assessment it comes from, e.g. a document number. */
  riskRef?: string;
  /** Mesh size for the class (m). */
  meshM?: number;
  /** Rolling sphere radius for the class (m); also the ESE striking distance. */
  sphereRadiusM?: number;
  /** Largest distance between down conductors for the class (m). */
  downSpacingM?: number;
  /** Rod height above the roof (m), for the two rod methods. */
  rodHeightM?: number;
  /** Protection angle for that rod height and class (degrees). */
  angleDeg?: number;
  /** ESE terminal tip height above the roof (m). */
  eseMastM?: number;
  /** ESE advance time ΔT (µs), from the manufacturer's test certificate. */
  eseDeltaTUs?: number;
  /** Down conductors for each ESE terminal. */
  eseDownPerTerminal?: number;
  /** An earth pit at the foot of each down conductor, as well as the ring conductor. */
  earthPitPerDown?: boolean;
}

export type LpsStatus = 'ok' | 'warn' | 'data';
export interface AirResult {
  method: AirMethod;
  status: LpsStatus;
  /** Inputs the method needs and does not have. */
  missing: string[];
  /** Air terminals (rods or ESE terminals); 0 for the mesh. */
  terminals: number;
  /** Radius one rod or terminal protects at roof level (m); mesh: the mesh size used. */
  radiusM?: number;
  /** Rod grid spacing along the length and the width (m). */
  gridM?: [number, number];
  /** Bays along the length and the width: mesh bays; rod bays (rolling sphere: a rod at every node; protection
   * angle and ESE: one at the centre of each bay). */
  bays?: [number, number];
  /** Mesh runs inside the roof edge, and roof conductor length with the edge (m). */
  meshRuns?: number;
  roofConductorM: number;
  /** How the figure was reached, for the report. */
  working: string;
  note?: string;
}

export interface LpsResult {
  invalid?: string;
  perimeterM: number;
  roofAreaM2: number;
  /** Centre of the roof to its far corner (m): what one central terminal has to reach. */
  halfDiagonalM: number;
  methods: AirResult[];
  selected: AirResult;
  downConductors: number;
  /** Actual distance between down conductors round the perimeter (m). */
  downSpacingM?: number;
  downConductorM: number;
  earthPits: number;
  ringConductorM: number;
  /** Test joints, one in each down conductor. */
  testJoints: number;
  checks: { status: 'ok' | 'warn' | 'bad'; text: string }[];
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const pos = (v: number | undefined): v is number => v !== undefined && Number.isFinite(v) && v > 0;
/** Whole steps needed to span a length; a hair over a whole number (floating point) does not add one. */
const steps = (lengthM: number, stepM: number) => Math.max(1, Math.ceil(lengthM / stepM - 1e-9));

function need(method: AirMethod, missing: string[]): AirResult {
  return { method, status: 'data', missing, terminals: 0, roofConductorM: 0, working: `DATA REQUIRED: ${missing.join(', ')}` };
}

/** Rods on a rectangular grid of squares no larger than `sideM`, one at every node including the roof edge. */
function rodGrid(lengthM: number, widthM: number, sideM: number) {
  const nx = steps(lengthM, sideM), ny = steps(widthM, sideM);
  return { count: (nx + 1) * (ny + 1), grid: [r2(lengthM / nx), r2(widthM / ny)] as [number, number], nx, ny };
}
/** Conductor joining the rods of a grid: every grid line, both ways. */
const gridConductorM = (lengthM: number, widthM: number, nx: number, ny: number) => (ny + 1) * lengthM + (nx + 1) * widthM;

function mesh(i: LpsInputs, perimeterM: number): AirResult {
  if (!pos(i.meshM)) return need('mesh', ['mesh size']);
  const along = steps(i.lengthM, i.meshM) - 1, across = steps(i.widthM, i.meshM) - 1;
  const insideM = along * i.widthM + across * i.lengthM;
  return {
    method: 'mesh', status: 'ok', missing: [], terminals: 0, radiusM: i.meshM, meshRuns: along + across, bays: [along + 1, across + 1], roofConductorM: r2(perimeterM + insideM),
    working: `Roof edge ${r2(perimeterM)} m + ${along} runs of ${r2(i.widthM)} m + ${across} runs of ${r2(i.lengthM)} m, no mesh larger than ${r2(i.meshM)} m`
  };
}

function angle(i: LpsInputs): AirResult {
  const missing = [!pos(i.rodHeightM) && 'rod height', !(pos(i.angleDeg) && i.angleDeg < 90) && 'protection angle (under 90°)'].filter((m): m is string => !!m);
  if (missing.length) return need('angle', missing);
  const radius = i.rodHeightM! * Math.tan((i.angleDeg! * Math.PI) / 180);
  // A circle of that radius covers a square of side r·√2, so rods at the centres of such squares cover the roof.
  const nx = steps(i.lengthM, radius * Math.SQRT2), ny = steps(i.widthM, radius * Math.SQRT2);
  return {
    method: 'angle', status: 'ok', missing: [], terminals: nx * ny, radiusM: r2(radius), gridM: [r2(i.lengthM / nx), r2(i.widthM / ny)], bays: [nx, ny],
    roofConductorM: r2(ny * i.lengthM + nx * i.widthM),
    working: `Radius at roof level = h · tan α = ${r2(i.rodHeightM!)} × tan ${r2(i.angleDeg!)}° = ${r2(radius)} m; one rod at the centre of each ${r2(i.lengthM / nx)} × ${r2(i.widthM / ny)} m bay`
  };
}

function sphere(i: LpsInputs): AirResult {
  const missing = [!pos(i.rodHeightM) && 'rod height', !pos(i.sphereRadiusM) && 'rolling sphere radius'].filter((m): m is string => !!m);
  if (missing.length) return need('sphere', missing);
  const r = i.sphereRadiusM!, h = i.rodHeightM!;
  if (h >= r) return { ...need('sphere', ['rod height below the sphere radius']), working: 'Rod height must be less than the rolling sphere radius' };
  // A sphere resting on the tips of four rods sags r − √(r² − (d/2)²) at the centre of the bay, d its diagonal.
  // It stays off the roof while that sag is no more than the rod height: d ≤ 2·√(2rh − h²).
  const diagonal = 2 * Math.sqrt(2 * r * h - h * h);
  const g = rodGrid(i.lengthM, i.widthM, diagonal / Math.SQRT2);
  return {
    method: 'sphere', status: 'ok', missing: [], terminals: g.count, radiusM: r2(diagonal / 2), gridM: g.grid, bays: [g.nx, g.ny],
    roofConductorM: r2(gridConductorM(i.lengthM, i.widthM, g.nx, g.ny)),
    working: `Largest bay diagonal = 2 · √(2rh − h²) = 2 × √(2 × ${r2(r)} × ${r2(h)} − ${r2(h)}²) = ${r2(diagonal)} m; rods on a ${g.grid[0]} × ${g.grid[1]} m grid`
  };
}

/** Protection radius of an ESE terminal at the level it protects (NFC 17-102 method): h the tip height above
 * that level, r the striking distance for the class, ΔL = ΔT × 1 m/µs. Below 5 m the radius is in proportion
 * to the height; the method does not apply below 2 m. */
export function eseRadiusM(tipHeightM: number, sphereRadiusM: number, deltaTUs: number): number {
  if (tipHeightM < 2) return NaN;
  const at = (h: number) => Math.sqrt(2 * sphereRadiusM * h - h * h + deltaTUs * (2 * sphereRadiusM + deltaTUs));
  return tipHeightM >= 5 ? at(tipHeightM) : (tipHeightM * at(5)) / 5;
}

function ese(i: LpsInputs, halfDiagonalM: number): AirResult {
  const missing = [!(pos(i.eseMastM) && i.eseMastM >= 2) && 'terminal height (2 m or more)', !pos(i.sphereRadiusM) && 'rolling sphere radius',
    !pos(i.eseDeltaTUs) && 'advance time ΔT'].filter((m): m is string => !!m);
  if (missing.length) return need('ese', missing);
  const rp = eseRadiusM(i.eseMastM!, i.sphereRadiusM!, i.eseDeltaTUs!);
  if (!(rp > 0)) return need('ese', ['terminal height below the rolling sphere radius']);
  const one = rp >= halfDiagonalM;
  const nx = one ? 1 : steps(i.lengthM, rp * Math.SQRT2), ny = one ? 1 : steps(i.widthM, rp * Math.SQRT2);
  return {
    method: 'ese', status: 'warn', missing: [], terminals: nx * ny, radiusM: r2(rp), gridM: one ? undefined : [r2(i.lengthM / nx), r2(i.widthM / ny)], bays: [nx, ny],
    roofConductorM: 0,
    working: `Rp = √(2rh − h² + ΔL(2r + ΔL)) with r ${r2(i.sphereRadiusM!)} m, h ${r2(i.eseMastM!)} m, ΔL ${r2(i.eseDeltaTUs!)} m = ${r2(rp)} m; the roof's far corner is ${r2(halfDiagonalM)} m from its centre`,
    note: 'NFC 17-102 method, not an IEC 62305 method: confirm that the authority accepts it'
  };
}

export function lightningProtection(i: LpsInputs): LpsResult {
  const empty: AirResult = need(i.method, ['building size']);
  if (![i.lengthM, i.widthM, i.heightM].every(pos)) {
    return { invalid: 'Building length, width and height must be more than zero', perimeterM: 0, roofAreaM2: 0, halfDiagonalM: 0, methods: [], selected: empty,
      downConductors: 0, downConductorM: 0, earthPits: 0, ringConductorM: 0, testJoints: 0, checks: [{ status: 'bad', text: 'Building size not set' }] };
  }
  const perimeterM = 2 * (i.lengthM + i.widthM);
  const halfDiagonalM = Math.hypot(i.lengthM, i.widthM) / 2;
  const methods = [mesh(i, perimeterM), angle(i), sphere(i), ese(i, halfDiagonalM)];
  const selected = methods.find((m) => m.method === i.method)!;

  const checks: LpsResult['checks'] = [];
  checks.push(i.lpsClass ? { status: 'ok', text: `Protection class ${i.lpsClass} entered` } : { status: 'bad', text: 'Protection class not entered' });
  checks.push(i.riskRef?.trim() ? { status: 'ok', text: `Risk assessment reference: ${i.riskRef.trim()}` } : { status: 'warn', text: 'No risk assessment reference given for the protection class' });
  checks.push(selected.status === 'data' ? { status: 'bad', text: `Air termination: DATA REQUIRED — ${selected.missing.join(', ')}` }
    : { status: selected.note ? 'warn' : 'ok', text: selected.note ?? 'Air termination covers the whole roof' });

  let downConductors = 0;
  if (selected.status !== 'data') {
    if (i.method === 'ese') {
      if (pos(i.eseDownPerTerminal)) downConductors = selected.terminals * Math.ceil(i.eseDownPerTerminal);
      else checks.push({ status: 'bad', text: 'Down conductors: DATA REQUIRED — down conductors for each ESE terminal' });
    } else if (pos(i.downSpacingM)) downConductors = Math.max(2, steps(perimeterM, i.downSpacingM));
    else checks.push({ status: 'bad', text: 'Down conductors: DATA REQUIRED — down conductor spacing' });
  }
  if (downConductors) checks.push({ status: 'ok', text: `${downConductors} down conductors, ${r2(perimeterM / downConductors)} m apart round the perimeter` });

  return {
    perimeterM: r2(perimeterM), roofAreaM2: r2(i.lengthM * i.widthM), halfDiagonalM: r2(halfDiagonalM), methods, selected,
    downConductors, downSpacingM: downConductors ? r2(perimeterM / downConductors) : undefined, downConductorM: r2(downConductors * i.heightM),
    earthPits: i.earthPitPerDown ? downConductors : 0, ringConductorM: downConductors ? r2(perimeterM) : 0, testJoints: downConductors, checks
  };
}

/** What a method gives, in a line (the page and the report). */
export function airResultText(a: AirResult): string {
  const n = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (a.status === 'data') return '—';
  if (a.method === 'mesh') return `${a.meshRuns} runs · ${n(a.roofConductorM)} m of roof conductor`;
  if (a.method === 'ese') return `Rp ${n(a.radiusM!)} m · ${a.terminals} terminal${a.terminals === 1 ? '' : 's'}`;
  return `${a.terminals} rod${a.terminals === 1 ? '' : 's'} on a ${n(a.gridM![0])} × ${n(a.gridM![1])} m grid`;
}

/** Where things sit on the roof plan (metres from one corner), for the concept layout: mesh lines inside the
 * roof edge, the rods or terminals, and the down conductors at equal steps round the perimeter. */
export interface LpsLayout { meshX: number[]; meshY: number[]; terminals: [number, number][]; downs: [number, number][] }
export function lpsLayout(i: Pick<LpsInputs, 'lengthM' | 'widthM'>, r: LpsResult): LpsLayout {
  const out: LpsLayout = { meshX: [], meshY: [], terminals: [], downs: [] };
  const a = r.selected, L = i.lengthM, W = i.widthM;
  if (r.invalid) return out;
  if (a.bays && a.status !== 'data') {
    const [nx, ny] = a.bays;
    if (a.method === 'mesh' || a.method === 'sphere') {
      for (let x = 1; x < nx; x++) out.meshX.push(r2((x * L) / nx));
      for (let y = 1; y < ny; y++) out.meshY.push(r2((y * W) / ny));
    }
    if (a.method === 'sphere') for (let x = 0; x <= nx; x++) for (let y = 0; y <= ny; y++) out.terminals.push([r2((x * L) / nx), r2((y * W) / ny)]);
    if (a.method === 'angle' || a.method === 'ese') for (let x = 0; x < nx; x++) for (let y = 0; y < ny; y++) out.terminals.push([r2(((x + 0.5) * L) / nx), r2(((y + 0.5) * W) / ny)]);
  }
  const per = 2 * (L + W);
  for (let k = 0; k < r.downConductors; k++) {
    const d = (k * per) / r.downConductors;
    out.downs.push(d < L ? [r2(d), 0] : d < L + W ? [L, r2(d - L)] : d < 2 * L + W ? [r2(2 * L + W - d), W] : [0, r2(per - d)]);
  }
  return out;
}
