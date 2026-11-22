import { it } from 'vitest';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import JSZip from 'jszip';
import { network } from '../fixtures/networks';
import { issueRevision } from '../../src/model/revisions';
import type { Project, SketchItem } from '../../src/types';

/** Phase 2 step 0 of the native drawing file (docs/notes/Future development/Native drawing file - Phase 2 plan -
 * 2026-11-22.md): what drawn work costs a project save and load today, and what it would cost split off into a
 * zipped .lvplan. Drawn work sizes: BENCH_PLAN_MB (default 1,3,10, as compact JSON); revisions: BENCH_REVS (default 3).
 * Results are a measurement of this machine, not a supported project limit. */
const SIZES = (process.env.BENCH_PLAN_MB ?? '1,3,10').split(',').map(Number);
const REVS = Number(process.env.BENCH_REVS ?? 3);
const { projectText } = createRequire(import.meta.url)('../../electron/projectFiles.cjs') as { projectText: (p: object) => string };

/** The fields the plan moves to .lvplan (step 1 makes this the real list). */
const PLAN_FIELDS = ['cadSketch', 'cadBlockDefs', 'cadErased', 'cadLayouts', 'cadLayerStyle', 'cadLayerFile', 'cadRefs', 'cadPlanUnits', 'cadTextStyles', 'cadDimStyles', 'cadPointStyle', 'cadPatterns'] as const;

const mb = (x: number) => `${(x / 1048576).toFixed(2)} MB`;
const ms = (x: number) => (x >= 1000 ? `${(x / 1000).toFixed(2)} s` : `${x.toFixed(0)} ms`);
const median = <T>(f: () => T, runs = 3): [number, T] => {
  let out!: T; const t: number[] = [];
  for (let i = 0; i < runs; i++) { const s = performance.now(); out = f(); t.push(performance.now() - s); }
  return [t.sort((a, b) => a - b)[runs >> 1], out];
};
const medianAsync = async <T>(f: () => Promise<T>, runs = 3): Promise<[number, T]> => {
  let out!: T; const t: number[] = [];
  for (let i = 0; i < runs; i++) { const s = performance.now(); out = await f(); t.push(performance.now() - s); }
  return [t.sort((a, b) => a - b)[runs >> 1], out];
};

/** Drawn objects as an engineer adds them over a plan: lines, polylines, texts, dimensions and block inserts. */
const item = (i: number): SketchItem => {
  const x = (i % 400) * 1250.125 + 0.375, y = Math.floor(i / 400) * 980.5 + 0.25;
  const layer = ['E-POWR', 'E-LTG', 'E-ANNO', 'E-DIMS', 'E-CONT'][i % 5];
  switch (i % 5) {
    case 0: return { id: `S${i}`, kind: 'line', layer, pts: [[x, y], [x + 1200.5, y + 15.25]] };
    case 1: return { id: `S${i}`, kind: 'pline', layer, pts: [[x, y], [x + 600, y], [x + 600, y + 450.75], [x, y + 450.75]], closed: true };
    case 2: return { id: `S${i}`, kind: 'text', layer, pts: [[x, y]], text: `DB-GF-${i % 97} C${i % 24}`, h: 250 } as SketchItem;
    case 3: return { id: `S${i}`, kind: 'dim', layer, pts: [[x, y], [x + 1200.5, y], [x + 600, y + 500]] };
    default: return { id: `S${i}`, kind: 'insert', layer, pts: [[x, y]], block: 'LAMP 1', rot: 90 } as SketchItem;
  }
};
const withPlan = (p: Project, targetMb: number): Project => {
  const per = JSON.stringify(item(1)).length + 1, n = Math.round((targetMb * 1048576) / per), files = 4;
  const cadSketch = Array.from({ length: files }, (_, f) => ({ file: `plan-L${f}.dwg`, items: Array.from({ length: Math.ceil(n / files) }, (_, i) => item(f * n + i)) }));
  return { ...p, cadSketch, cadErased: { 'plan-l0.dwg': Array.from({ length: 2000 }, (_, i) => (0x1000 + i).toString(16).toUpperCase()) } };
};
const split = (p: Project) => {
  const rest: Record<string, unknown> = { ...p }, plan: Record<string, unknown> = {};
  for (const k of PLAN_FIELDS) if (k in rest) { plan[k] = rest[k]; delete rest[k]; }
  return { rest, plan };
};

it('project save and load with drawn work: today against a split-off .lvplan', async () => {
  const base = network(200, 'shallow');
  const rows: string[] = [];
  for (const size of SIZES) {
    let p = withPlan(base, size);
    for (let r = 0; r < REVS; r++) p = issueRevision(p, { description: `Rev ${r}`, date: '2026-11-22' });

    // Today: one pretty-printed .lvds, written and read whole.
    const [save, text] = median(() => projectText(p));
    const [load] = median(() => JSON.parse(text));

    // Split: .lvds without the drawing fields (revisions still carry their own copies until step 4).
    const { rest, plan } = split(p);
    const [saveRest, restText] = median(() => projectText(rest));
    const [loadRest] = median(() => JSON.parse(restText));
    const drawn = JSON.stringify(plan.cadSketch);
    const zipOf = (level: 'STORE' | 'DEFLATE') => async () => {
      const z = new JSZip();
      z.file('manifest.json', JSON.stringify({ format: 'lvds.plan', version: 1 }));
      for (const s of plan.cadSketch as { file: string }[]) z.file(`drawings/${s.file}.json`, JSON.stringify(s));
      return z.generateAsync({ type: 'nodebuffer', compression: level, compressionOptions: { level: 1 } });
    };
    const [zipStore, stored] = await medianAsync(zipOf('STORE'));
    const [zipDeflate, deflated] = await medianAsync(zipOf('DEFLATE'));
    const [unzip] = await medianAsync(async () => {
      const z = await JSZip.loadAsync(deflated);
      return Promise.all(Object.values(z.files).filter((f) => !f.dir).map(async (f) => JSON.parse(await f.async('string'))));
    });
    const [hash] = median(() => crypto.createHash('sha256').update(deflated).digest('hex'));
    // Step 4: revisions keep a hash of each drawing; the content is stored once.
    const { rest: rest4 } = split({ ...p, revisions: (p.revisions ?? []).map((rv) => ({ ...rv, snapshot: split(rv.snapshot as Project).rest as never })) } as Project);
    const [save4, text4] = median(() => projectText(rest4));

    rows.push(`| ${size} MB | ${mb(text.length)} | ${ms(save)} / ${ms(load)} | ${mb(restText.length)} | ${ms(saveRest)} / ${ms(loadRest)} | ${mb(text4.length)} / ${ms(save4)} | ${mb(drawn.length)} → ${mb(stored.length)} store, ${mb(deflated.length)} deflate | ${ms(zipStore)} / ${ms(zipDeflate)} / ${ms(unzip)} / ${ms(hash)} |`);
  }
  process.stdout.write([
    `Project: network(200 boards), drawn work in 4 drawings, ${REVS} issued revisions.`,
    '| Drawn work | .lvds today | save / load | .lvds split | save / load | .lvds after step 4 / save | .lvplan | zip store / deflate / read / sha256 |',
    '|---|---|---|---|---|---|---|---|',
    ...rows
  ].join("\n") + "\n");
});
