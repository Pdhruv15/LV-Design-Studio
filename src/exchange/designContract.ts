import { z } from 'zod';

/** Electrical design data for other programs (BIM add-ins, scripts, AI clients), contract `lvds.design` version 1.
 * Read only: the app writes it, nothing reads it back. A sibling of `lvds.exchange` (contracts.ts), not one of its
 * kinds, so programs that check exchange packages are not affected.
 *
 * - Every board and circuit carries its permanent `uid` (model/stableIds) and its `tag` (the name the engineer
 *   sees). Programs should key on `uid`: the tag changes on rename.
 * - SI units at the boundary: A, kA, kW, kVA, V, m, mm², Ω, %, s.
 * - Results come from a calculation run made at export time, so they always match the inputs in the same file;
 *   `calculation.fingerprint` changes when any input to any study changes.
 * - New optional fields may be added within version 1; anything else is a new version. */

export const DESIGN_SCHEMA = 'lvds.design' as const;
export const DESIGN_VERSION = 1 as const;

const id = z.string().min(1).max(200);
const num = z.number().finite();
const status = z.enum(['ok', 'warn', 'bad']);

const board = z.object({
  uid: id.describe('Permanent ID: unchanged by rename, move and undo'),
  tag: id.describe('Board name as shown in the app, e.g. DB-GF1 (changes on rename)'),
  name: z.string().max(200),
  kind: z.string().max(40).optional().describe('MDB, SMDB, DB, EDB, MCC, UPS …'),
  upstreamUid: id.optional().describe('uid of the board that feeds it; absent for a main board'),
  incomerUid: id.optional().describe('uid of the circuit that feeds it'),
  level: z.string().max(120).optional().describe('Floor, from Building information'),
  location: z.string().max(200).optional(),
  ratedCurrentA: num.optional(),
  source: z.object({ kva: num, impedancePct: num.optional(), xr: num.optional(), vectorGroup: z.string().max(20).optional() }).strict().optional().describe('Transformer, main boards only'),
  results: z.object({
    demandKw: num, demandKva: num, powerFactor: num,
    currentA: num.describe('Balanced 3-phase demand current'),
    loadingPct: num.optional(), faultKa: num.describe('3-phase prospective fault at the busbar'),
    voltagePct: num.describe('Busbar voltage as % of nominal')
  }).strict()
}).strict();

const circuit = z.object({
  uid: id.describe('Permanent ID: unchanged by rename, move and undo'),
  tag: id.describe('Circuit ID as shown in the app (changes on rename)'),
  boardUid: id.describe('uid of the board it leaves'),
  feedsBoardUid: id.optional().describe('uid of the board it feeds (incomer / sub-main)'),
  name: z.string().max(200),
  ref: z.string().max(20).optional().describe('DB way reference, e.g. R3'),
  phase: z.enum(['R', 'Y', 'B', 'RYB']).optional(),
  loadType: z.string().max(40),
  essential: z.boolean().optional().describe('Supplied by the standby generator'),
  load: z.object({
    kw: num, demandFactor: num, powerFactor: num,
    points: z.record(z.string(), num).optional().describe('Load schedule points by type'),
    generation: z.boolean().optional()
  }).strict(),
  breaker: z.object({ type: z.string().max(10).describe('B, C, D (MCB), MCCB, ACB'), ratingA: num, icuKa: num.optional(), rcdMa: num.optional() }).strict(),
  cable: z.object({
    type: z.string().max(80), cores: z.union([z.literal(2), z.literal(3), z.literal(4)]), runs: z.number().int().min(1),
    csaMm2: num, cpcMm2: num, lengthM: num, installMethod: z.string().max(20).optional()
  }).strict(),
  results: z.object({
    designCurrentA: num, ampacityA: num, loadingPct: num,
    vdPct: num.describe("This circuit's own cable"), vdTotalPct: num.describe('Source to the end of this circuit'),
    breakerFaultKa: num, endFaultKa: num,
    zsOhm: num.optional(), maxZsOhm: num.optional(), disconnectionS: num.optional(),
    status: z.object({ vd: status, ampacity: z.enum(['ok', 'bad']), protection: z.enum(['ok', 'bad']), icu: z.enum(['ok', 'bad']), disconnection: status.optional(), overall: status }).strict()
  }).strict()
}).strict();

const elvDevice = z.object({
  uid: id.describe('Permanent device ID'),
  type: z.string().max(60),
  buildingId: id, levelId: id, roomId: id.optional(),
  x: num.describe('m on the level plan'), y: num.describe('m on the level plan'), rotationDeg: num.optional()
}).strict();

export const designPackage = z.object({
  schema: z.literal(DESIGN_SCHEMA),
  version: z.literal(DESIGN_VERSION),
  project: z.object({ id: id.optional(), name: z.string().max(200), voltageV: num, frequencyHz: num, vdLimitPct: num }).strict(),
  source: z.object({ app: z.literal('lvds'), appVersion: z.string().max(40).optional(), file: z.string().max(260).optional() }).strict(),
  exportedAt: z.iso.datetime({ offset: true }),
  calculation: z.object({ fingerprint: z.string().regex(/^[0-9a-f]{64}$/).describe('SHA-256 of the inputs of every study') }).strict(),
  boards: z.array(board).max(20000),
  circuits: z.array(circuit).max(200000),
  elvDevices: z.array(elvDevice).max(200000),
  sha256: z.string().regex(/^[0-9a-f]{64}$/).optional().describe('SHA-256 of the package without this field and without exportedAt, keys sorted (canonicalJson)')
}).strict();

export type DesignPackage = z.infer<typeof designPackage>;
export type DesignBoard = z.infer<typeof board>;
export type DesignCircuit = z.infer<typeof circuit>;
