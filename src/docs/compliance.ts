import type { FeederResult, Status } from '../calc/electrical';
import { cableSizeText } from '../calc/electrical';
import { breakerTypeOf } from '../calc/earthing';
import { planPfc } from '../calc/pfc';
import { REPORT_STATUS_TEXT, type ReportStatus } from '../calc/statusText';
import { boardSummary } from '../calc/summary';
import { sizeGeneratorByBoards, sizeTransformers, txGenPlanOf } from '../calc/txGen';
import { sizeUps } from '../calc/ups';
import { settingsOf } from '../types';
import { esc } from './report';
import { PRINT, statusSpan } from './printStyles';
import type { CalcData, Cell, Scope, Table } from './studyReport';
import { fig } from '../util/format';

/** Results and compliance layer of the design report: equipment, load and
 * cable summaries, the master compliance table and a few engineering charts.
 * Report data only — every figure is read from the calculation results; the
 * margins are the difference between a calculated value and its limit. */

const C =(s: ReportStatus): Cell => ({ v: REPORT_STATUS_TEXT[s], s });
const worst = (xs: Status[]): Status => (xs.includes('bad') ? 'bad' : xs.includes('warn') ? 'warn' : 'ok');
const pick = <T,>(xs: T[], key: (x: T) => number) => xs.reduce<T | undefined>((a, x) => (a === undefined || key(x) > key(a) ? x : a), undefined);

export interface ComplianceRow { check: string; item: string; calculated: string; requirement: string; margin: string; status: ReportStatus }

export interface Results {
  equipment: Table[];
  load: Table;
  cables: Table;
  compliance: ComplianceRow[];
  charts: { title: string; caption: string; svg: string }[];
}

export function buildResults(data: CalcData, scope: Scope): Results {
  const p = data.project, set = settingsOf(p), plan = txGenPlanOf(p);
  const byId = new Map(data.results.map((r) => [r.feeder.id, r]));
  const circuits = [...scope.incomers, ...scope.feeders].map((f) => byId.get(f.id)).filter((r): r is FeederResult => !!r);
  const withFinals = [...circuits, ...scope.finals.map((f) => byId.get(f.id)).filter((r): r is FeederResult => !!r)];
  const sums = scope.boards.map((b) => boardSummary(p, b));
  const tx = sizeTransformers(p, plan).filter((r) => scope.ids.has(r.board.id));
  const gen = sizeGeneratorByBoards(p, plan);
  const genNeeded = gen.demandKw > 0 || gen.recommendedKva !== undefined;
  const pfc = planPfc(p);
  const banks = pfc.rows.filter((r) => scope.ids.has(r.boardId) && r.bankKvar > 0);
  const ups = (p.upsSystems ?? []).filter((u) => !u.boardId || scope.ids.has(u.boardId)).map((u) => ({ u, r: sizeUps(p, u) }));
  const want = new Set(withFinals.map((r) => r.feeder.id));
  const earth = data.earthing.filter((e) => want.has(e.feeder.id));
  const sel = data.selectivity.filter((s) => want.has(s.downstream.id));

  // ---- Equipment summary
  const equipment: Table[] = [];
  if (tx.length) equipment.push({ title: 'Transformers', headers: ['Main board', 'Installed (kVA)', '%Z', 'Required (kVA)', 'Demand (kVA)', 'Loading', 'Status'],
    rows: tx.map((r) => [r.board.id, r.installedKva ?? 'Not defined', r.board.sourceImpedancePct ?? 'Not defined', fig.power(r.designKva), fig.power(r.demandKva), r.loadingPct !== undefined ? `${fig.loading(r.loadingPct)} %` : '—',
      C(r.adequate === false || !r.recommendedKva ? 'bad' : r.installedKva ? 'ok' : 'data')]) });
  if (genNeeded) equipment.push({ title: 'Standby generator', headers: ['Essential demand (kVA)', 'Required (kVA)', 'Recommended', 'Installed (kVA)', 'Status'],
    rows: [[fig.power(gen.demandKva), fig.power(Math.max(gen.runningDesignKva, gen.startDesignKva)), gen.recommendedKva ? `${gen.recommendedKva} kVA` : 'Above the largest set', gen.installedKva ?? 'Not defined',
      C(gen.installedOk === false || !gen.recommendedKva ? 'bad' : gen.installedKva ? 'ok' : 'data')]] });
  equipment.push({ title: 'Distribution boards (MDB, SMDB, DB, MCC)', headers: ['Board', 'Type', 'Bus rating (A)', 'Demand (A)', 'Loading', 'Ik″ (kA)', 'Status'],
    rows: sums.map((s) => [s.board.id, s.board.kind ?? (s.board.upstreamId ? 'DB' : 'MDB'), s.board.ratedCurrentA ?? 'Not defined', fig.current(s.currentA), s.loadingPct === undefined ? '—' : `${fig.loading(s.loadingPct)} %`, fig.fault(s.faultKA),
      C(s.loadingStatus ?? 'data')]) });
  if (ups.length) equipment.push({ title: 'UPS', headers: ['UPS', 'Board', 'Load (kVA)', 'Selected (kVA)', 'Loading', 'Autonomy (min)', 'Status'],
    rows: ups.map(({ u, r }) => [u.name, u.boardId ?? '—', fig.power(r.loadKva), r.upsKva ?? 'Above the data', r.loadingPct !== undefined ? `${fig.loading(r.loadingPct)} %` : '—', u.autonomyMin,
      C(!r.upsKva || r.busMismatch ? 'bad' : r.loadingPct !== undefined && r.loadingPct > u.maxLoadingPct ? 'warn' : 'ok')]) });
  if (banks.length) equipment.push({ title: 'Capacitor banks', headers: ['Location', 'Bank (kvar)', 'Steps', 'PF before → after', 'Target PF', 'Status'],
    rows: banks.map((r) => [r.label, fig.plain(r.bankKvar, 1), r.steps > 1 ? `${r.steps} × ${r.stepKvar}` : 'Fixed', `${fig.ratio(r.pfBefore)} → ${fig.pf3(r.pfAfter)}`, r.pfTarget, C(r.warn ? 'warn' : r.pfAfter >= r.pfTarget - 1e-6 ? 'ok' : 'warn')]) });

  // ---- Load summary
  const roots = sums.filter((s) => scope.roots.includes(s.board));
  const load: Table = { title: 'Load summary', headers: ['Item', 'Value'], rows: [
    ['Connected load', `${fig.power(roots.reduce((a, s) => a + s.connectedKw, 0))} kW`],
    ['Maximum demand', `${fig.power(roots.reduce((a, s) => a + s.demandKw, 0))} kW · ${fig.power(roots.reduce((a, s) => a + s.demandKva, 0))} kVA`],
    ...tx.map((r) => [`Transformer ${r.board.id} loading`, r.installedKva ? `${fig.loading(r.loadingPct!)} % of ${r.installedKva} kVA (design limit ${set.transformerMaxLoadingPct} %)` : 'Installed rating not defined'] as Cell[]),
    ...tx.filter((r) => r.installedKva).map((r) => [`Transformer ${r.board.id} spare`, `${fig.power(r.installedKva! - r.demandKva)} kVA`] as Cell[]),
    ...(genNeeded ? [['Generator loading', gen.installedKva ? `${fig.loading((gen.demandKva / gen.installedKva) * 100)} % of ${gen.installedKva} kVA` : 'Installed rating not defined'] as Cell[]] : []),
    ...(genNeeded && gen.installedKva ? [['Generator spare', `${fig.power(gen.installedKva - gen.demandKva)} kVA`] as Cell[]] : [])
  ] };

  // ---- Cable summary (feeders and incomers; final circuits are on the DB schedules)
  const cables: Table = { title: 'Cable summary', headers: ['From', 'To', 'Load (kW)', 'Current (A)', 'Cable', 'Protective device', 'Voltage drop (%)', 'Status'],
    rows: circuits.map((r) => [r.feeder.boardId, r.feeder.feedsBoardId ?? r.feeder.name, r.feeder.feedsBoardId ? '—' : fig.power(r.feeder.loadKw * r.feeder.demandFactor), fig.current(r.ib), cableSizeText(r.feeder),
      `${r.feeder.breakerRatingA} A ${breakerTypeOf(r.feeder)}`, fig.pct(r.vdTotalPct), C(worst([r.protectionStatus, r.ampacityStatus, r.vdStatus, r.icuStatus]))]) };

  // ---- Compliance summary: the governing (least margin) item of each check
  const compliance: ComplianceRow[] = [];
  for (const r of tx) compliance.push(r.installedKva
    ? { check: 'Transformer loading', item: r.board.id, calculated: `${fig.power(r.demandKva)} kVA`, requirement: `${r.installedKva} kVA`, margin: `${fig.power(r.installedKva - r.demandKva)} kVA`, status: r.adequate === false ? 'bad' : 'ok' }
    : { check: 'Transformer loading', item: r.board.id, calculated: `${fig.power(r.demandKva)} kVA`, requirement: 'Installed rating not defined', margin: '—', status: 'data' });
  if (genNeeded) compliance.push(gen.installedKva
    ? { check: 'Generator loading', item: 'Standby generator', calculated: `${fig.power(gen.demandKva)} kVA`, requirement: `${gen.installedKva} kVA`, margin: `${fig.power(gen.installedKva - gen.demandKva)} kVA`, status: gen.installedOk === false ? 'bad' : 'ok' }
    : { check: 'Generator loading', item: 'Standby generator', calculated: `${fig.power(gen.demandKva)} kVA`, requirement: 'Installed rating not defined', margin: '—', status: 'data' });
  const fault = pick(circuits, (r) => r.breakerFaultKA - r.feeder.breakerIcuKa);
  if (fault) compliance.push({ check: 'Fault level (breaking capacity)', item: fault.feeder.id, calculated: `${fig.fault(fault.breakerFaultKA)} kA`, requirement: `${fault.feeder.breakerIcuKa} kA`, margin: `${fig.fault(fault.feeder.breakerIcuKa - fault.breakerFaultKA)} kA`, status: worst(circuits.map((r) => r.icuStatus)) });
  const vd = pick(withFinals, (r) => r.vdTotalPct);
  if (vd) compliance.push({ check: 'Voltage drop', item: vd.feeder.id, calculated: `${fig.pct(vd.vdTotalPct)} %`, requirement: `${p.vdLimitPct} %`, margin: `${fig.pct(p.vdLimitPct - vd.vdTotalPct)} %`, status: worst(withFinals.map((r) => r.vdStatus)) });
  const amp = pick(withFinals, (r) => r.ib / r.ampacity);
  if (amp) compliance.push({ check: 'Cable capacity (Ib ≤ Iz)', item: amp.feeder.id, calculated: `${fig.current(amp.ib)} A`, requirement: `${fig.current(amp.ampacity)} A`, margin: `${fig.current(amp.ampacity - amp.ib)} A`, status: worst(withFinals.map((r) => r.ampacityStatus)) });
  if (withFinals.length) {
    const off = withFinals.filter((r) => r.protectionStatus !== 'ok').length;
    compliance.push({ check: 'Overload protection (Ib ≤ In ≤ Iz)', item: `${withFinals.length} circuits`, calculated: `${withFinals.length - off} of ${withFinals.length} meet it`, requirement: 'All circuits', margin: off ? `${off} circuit(s)` : '—', status: worst(withFinals.map((r) => r.protectionStatus)) });
  }
  const limited = withFinals.filter((r) => r.limits);
  if (limited.length) {
    const off = limited.filter((r) => r.limits!.status !== 'ok');
    compliance.push({ check: 'Cable / breaker limits (DEWA Appendix 5)', item: off[0]?.feeder.id ?? `${limited.length} circuits`, calculated: `${limited.length - off.length} of ${limited.length} meet it`, requirement: 'All circuits', margin: off.length ? `${off.length} circuit(s)` : '—', status: off.length ? 'bad' : 'ok' });
  }
  const rated = sums.filter((s) => s.loadingPct !== undefined);
  const busy = pick(rated, (s) => s.loadingPct!);
  if (busy) compliance.push({ check: 'Board loading', item: busy.board.id, calculated: `${fig.current(busy.currentA)} A`, requirement: `${busy.board.ratedCurrentA} A`, margin: `${fig.current(busy.board.ratedCurrentA! - busy.currentA)} A`, status: worst(rated.map((s) => s.loadingStatus!)) });
  if (rated.length < sums.length) compliance.push({ check: 'Board loading', item: sums.filter((s) => s.loadingPct === undefined).map((s) => s.board.id).join(', '), calculated: '—', requirement: 'Bus rating not defined', margin: '—', status: 'data' });
  const zs = pick(earth, (e) => e.zsOhm / e.maxZsOhm);
  if (zs) compliance.push({ check: 'Earth fault disconnection', item: zs.feeder.id, calculated: `Zs ${fig.ohm(zs.zsOhm)} Ω`, requirement: `≤ ${fig.ohm(zs.maxZsOhm)} Ω`, margin: `${fig.ohm(zs.maxZsOhm - zs.zsOhm)} Ω`, status: worst(earth.map((e) => e.status)) });
  if (sel.length) {
    const partial = sel.filter((s) => s.status !== 'ok').length;
    compliance.push({ check: 'Selectivity', item: `${sel.length} breaker pairs`, calculated: `${sel.length - partial} total, ${partial} partial / to check`, requirement: 'Total selectivity', margin: '—', status: worst(sel.map((s) => s.status)) });
  }
  for (const m of pfc.mains.filter((x) => scope.ids.has(x.boardId))) compliance.push({ check: 'Power factor', item: m.boardId, calculated: fig.pf3(m.pfAfter).toString(), requirement: `≥ ${pfc.pfTarget}`, margin: fig.pf3(m.pfAfter - pfc.pfTarget).toString(), status: m.pfAfter >= pfc.pfTarget - 1e-6 ? 'ok' : 'warn' });

  // ---- Charts (only where they add engineering value)
  const charts: Results['charts'] = [];
  const shown = sums.filter((s) => s.depth <= 1).slice(0, 14);
  if (shown.some((s) => s.connectedKw > 0)) charts.push({ title: 'Connected load vs maximum demand', caption: 'Per board, kW. The gap is the diversity applied by the demand factors.',
    svg: barChart(shown.map((s) => ({ label: s.board.id, bars: [s.connectedKw, s.demandKw] })), ['Connected load', 'Maximum demand'], 'kW') });
  const txi = tx.filter((r) => r.installedKva);
  if (txi.length) charts.push({ title: 'Transformer capacity vs demand', caption: `Demand against the installed rating (tick) and the ${set.transformerMaxLoadingPct} % design loading limit (dashed).`,
    svg: barChart(txi.map((r) => ({ label: r.board.id, bars: [r.demandKva], cap: r.installedKva!, limit: (r.installedKva! * set.transformerMaxLoadingPct) / 100 })), ['Maximum demand'], 'kVA') });
  if (rated.length) charts.push({ title: 'Board loading', caption: 'Demand current ÷ bus rating. Boards without a rating are not shown.',
    svg: barChart(rated.map((s) => ({ label: s.board.id, bars: [s.loadingPct!], limit: 100 })), ['Loading'], '%') });

  return { equipment, load, cables, compliance, charts };
}

// ---- Charts: horizontal bars, print-ready inline SVG ----------------------------------------------

const INK = PRINT.ink, MUTED = PRINT.ink2, GRID = '#ddd';
const SERIES = ['#bbb', '#000']; // grey → black (connected → demand): reads the same on a mono printer

function barChart(rows: { label: string; bars: number[]; cap?: number; limit?: number }[], series: string[], unit: string): string {
  const W = 760, left = 90, right = 70, bh = 9, gap = 2, rowH = series.length * (bh + gap) + 12, top = series.length > 1 ? 26 : 8;
  const H = top + rows.length * rowH + 22;
  const max = Math.max(1, ...rows.flatMap((r) => [...r.bars, r.cap ?? 0, r.limit ?? 0])) * 1.05;
  const x = (v: number) => left + (Math.max(0, v) / max) * (W - left - right);
  const ticks = Array.from({ length: 5 }, (_, i) => (max / 1.05) * (i / 4));
  const color = (i: number) => (series.length > 1 ? SERIES[i] : SERIES[1]);
  const legend = series.length > 1 ? series.map((s, i) => `<rect x="${left + i * 150}" y="4" width="10" height="10" rx="2" fill="${color(i)}"/><text x="${left + i * 150 + 15}" y="13" font-size="10" fill="${INK}">${esc(s)}</text>`).join('') : '';
  const grid = ticks.map((t) => `<line x1="${x(t)}" x2="${x(t)}" y1="${top}" y2="${H - 18}" stroke="${GRID}"/><text x="${x(t)}" y="${H - 6}" font-size="9" fill="${MUTED}" text-anchor="middle">${fig.fixed(t, 0)}${unit === '%' ? ' %' : ''}</text>`).join('');
  const body = rows.map((r, i) => {
    const y0 = top + i * rowH + 4;
    const bars = r.bars.map((v, k) => {
      const y = y0 + k * (bh + gap), w = Math.max(1, x(v) - left);
      return `<path d="M${left},${y} h${Math.max(0, w - 4)} a4,4 0 0 1 4,4 v${bh - 8} a4,4 0 0 1 -4,4 h${-Math.max(0, w - 4)} z" fill="${color(k)}"/>`
        + (k === r.bars.length - 1 ? `<text x="${x(v) + 4}" y="${y + bh - 1}" font-size="9" fill="${INK}">${fig.fixed(v, 0)} ${unit}</text>` : '');
    }).join('');
    const yMid = y0 + (r.bars.length * (bh + gap)) / 2;
    const cap = r.cap !== undefined ? `<line x1="${x(r.cap)}" x2="${x(r.cap)}" y1="${y0 - 3}" y2="${y0 + r.bars.length * (bh + gap) + 1}" stroke="${INK}" stroke-width="2"/>` : '';
    const lim = r.limit !== undefined ? `<line x1="${x(r.limit)}" x2="${x(r.limit)}" y1="${y0 - 3}" y2="${y0 + r.bars.length * (bh + gap) + 1}" stroke="${MUTED}" stroke-width="1.2" stroke-dasharray="3 2"/>` : '';
    return `<text x="${left - 6}" y="${yMid + 3}" font-size="10" fill="${INK}" text-anchor="end">${esc(r.label)}</text>${bars}${cap}${lim}`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px" role="img" font-family="${PRINT.font}">${legend}${grid}${body}</svg>`;
}

// ---- HTML ------------------------------------------------------------------------

const cell = (c: Cell) => (typeof c === 'object' && 's' in c ? `<td class="${c.s}">${statusSpan(esc(c.v))}</td>` : `<td>${esc(c)}</td>`);
const table = (t: Table) => `${t.title ? `<h3>${esc(t.title)}</h3>` : ''}${t.rows.length ? `<table><thead><tr>${t.headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.rows.map((r) => `<tr>${r.map(cell).join('')}</tr>`).join('')}</tbody></table>` : '<p class="caption">Nothing in scope.</p>'}`;

/** "Results summary" and "Compliance summary" sections, each {title, html}; numbered by the report. */
export function resultsSections(r: Results, figureStart = 1): { title: string; html: string }[] {
  const counts = (Object.keys(REPORT_STATUS_TEXT) as ReportStatus[]).map((s) => [s, r.compliance.filter((c) => c.status === s).length] as const).filter(([, k]) => k);
  const overall: ReportStatus = r.compliance.some((c) => c.status === 'bad') ? 'bad' : r.compliance.some((c) => c.status === 'warn' || c.status === 'data') ? 'warn' : r.compliance.length ? 'ok' : 'nc';
  const results = `
  ${r.equipment.map(table).join('')}
  ${table(r.load)}
  ${r.charts.map((c, i) => `<figure class="chart">${c.svg}<figcaption class="caption">Figure ${figureStart + i} — ${esc(c.title)}. ${esc(c.caption)}</figcaption></figure>`).join('')}
  ${table(r.cables)}
  <p class="caption">Final circuits are on the DB load schedules.</p>`;
  const compliance = `
  <p class="overall">Overall design status: <b class="${overall}">${REPORT_STATUS_TEXT[overall]}</b> <span>(${counts.map(([s, k]) => `${k} ${REPORT_STATUS_TEXT[s]}`).join(' · ') || 'no checks'})</span></p>
  <table><thead><tr><th>Design check</th><th>Governing item</th><th>Calculated</th><th>Requirement / selected</th><th>Margin</th><th>Status</th></tr></thead><tbody>
  ${r.compliance.map((c) => `<tr><td>${esc(c.check)}</td><td>${esc(c.item)}</td><td>${esc(c.calculated)}</td><td>${esc(c.requirement)}</td><td>${esc(c.margin)}</td><td class="${c.status}">${statusSpan(REPORT_STATUS_TEXT[c.status])}</td></tr>`).join('')}
  </tbody></table>
  <p class="caption">Each row shows the item with the least margin; the status is the worst over all items of that check. PASS / WARNING / FAIL are the app's calculated checks against the project limits; NOT CHECKED: nothing installed or selected to check against; DATA REQUIRED: a rating or input is missing. Engineering review and approval are separate.</p>`;
  return [{ title: 'Results summary', html: results }, { title: 'Compliance summary', html: compliance }];
}
