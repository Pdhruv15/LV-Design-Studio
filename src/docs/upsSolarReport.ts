import { sizeUps, type UpsSystem } from '../calc/ups';
import type { PvResult, PvSystem } from '../calc/solar';
import { acConnection } from '../calc/solar';
import { pvConnection } from '../model/pvFeeder';
import { revisionStamp } from '../model/revisions';
import type { Project } from '../types';
import { esc } from './report';
import { fig, fmtUpTo } from '../util/format';

/** Printable UPS / battery and solar PV sizing sheets (A4 portrait). */

const n = (v: number, d = 1) => (Number.isFinite(v) ? v.toLocaleString('en-US', { maximumFractionDigits: d }) : '—');
const CSS = `
  @page { size: A4 portrait; margin: 14mm; }
  body { font: 10.5px/1.45 Arial, sans-serif; color: #000; margin: 0; }
  header { display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 4px; margin-bottom: 8px; }
  h1 { font-size: 16px; margin: 0; } h2 { font-size: 12px; margin: 14px 0 5px; color: #000; border-bottom: 1px solid #000; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 6px; } th, td { border: 1px solid #000; padding: 3px 6px; text-align: left; }
  th { background: #f2f2f2; width: 42%; font-weight: 600; } td b { font-size: 11.5px; }
  .ok { color: #000; } .bad { color: #000; font-weight: 700; }
  .note { color: #444; font-size: 9px; } .page { break-after: page; } .page:last-child { break-after: auto; }`;
const head = (project: Project, title: string) => `<header><div><h1>${esc(title)}</h1><div>${esc(project.name)}</div></div><div>${esc(revisionStamp(project))}</div></header>`;
const rows = (r: [string, string][]) => `<table>${r.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`).join('')}</table>`;

export function buildUpsReportHtml(project: Project, systems: UpsSystem[]): string {
  const pages = systems.map((s) => {
    const r = sizeUps(project, s);
    const loads = s.boardId ? '' : `<h2>Loads</h2><table><tr><th style="width:auto">Load</th><th>Qty</th><th>W each</th><th>VA each</th><th>PF</th></tr>${s.loads.map((l) => `<tr><td>${esc(l.name)}</td><td>${l.qty}</td><td>${fmtUpTo(l.w)}</td><td>${fmtUpTo(l.va)}</td><td>${fig.ratio(l.pf ?? 0.9)}</td></tr>`).join('')}</table>`;
    return `<section class="page">${head(project, `UPS & battery sizing — ${s.name}`)}
      <h2>Load</h2>${rows([
        ['Load from', s.boardId ? `Board ${esc(s.boardId)} (its maximum demand)` : 'List of loads (below)'],
        ['Load', `<b>${fig.power(r.loadKva)} kVA · ${fig.power(r.loadKw)} kW</b>`],
        ['Growth / design loading', `${s.growthPct} % / ${s.maxLoadingPct} %`],
        ['Design requirement', `${fig.power(r.designKva)} kVA · ${fig.power(r.designKw)} kW`]
      ])}${loads}
      <h2>UPS</h2>${rows([
        ['Selected UPS', r.upsKva ? `<b>${r.upsKva} kVA / ${fig.plain(r.upsKw!, 1)} kW</b> (output PF ${fig.ratio(s.outputPf)})` : '<span class="bad">Above the largest standard size — parallel modules</span>'],
        ['Loading today', r.loadingPct !== undefined ? `<b>${fig.loading(r.loadingPct)} %</b> — governed by ${r.loadingBy} (${fig.loading(r.loadingKvaPct!)} % of ${r.upsKva} kVA · ${fig.loading(r.loadingKwPct!)} % of ${fig.plain(r.upsKw!)} kW)` : '—'],
        ['Inverter efficiency', `${n(s.inverterEff * 100)} %`]
      ])}
      ${s.surge ? `<h2>Inverter starting-load check</h2>${rows([
        ['Model / overload source', esc(s.surge.source)],
        ['Total starting demand before growth', `${n(s.surge.totalKw ?? NaN)} kW / ${n(s.surge.totalKva ?? NaN)} kVA for ${n(s.surge.durationSeconds ?? NaN)} s (includes running loads)`],
        ['Starting demand with growth', `${fig.power(r.surge.kw ?? NaN)} kW / ${fig.power(r.surge.kva ?? NaN)} kVA`],
        ['Entered peak duty', `${n(s.surge.ratedKw ?? NaN)} kW / ${n(s.surge.ratedKva ?? NaN)} kVA for ${n(s.surge.ratedSeconds ?? NaN)} s`],
        ['Result', `<b class="${r.surge.status === 'pass' ? 'ok' : r.surge.status === 'fail' ? 'bad' : ''}">${esc(r.surge.status)}</b> — ${esc(r.surge.issue)}`]
      ])}<p class="note">Use the same overload duty and conditions for the selected inverter model. Continuous UPS selection is unchanged. Battery/BMS transient current and voltage dip are not verified by this check.</p>` : ''}
      <h2>Battery</h2>${rows([
        ['Type', s.chem === 'vrla' ? `VRLA lead-acid, end voltage ${s.endCellV ?? 1.75} V/cell` : 'Lithium-ion (LFP)'],
        ['Backup time', `${s.autonomyMin} min`],
        ['DC power from the battery', `${fig.power(r.dcKw)} kW = load kW with growth ÷ ${s.inverterEff}`],
        ...(r.busMismatch
          ? [['DC bus (requested)', `${s.dcVoltage} V`], ['Battery string (actual)', `<b class="bad">${r.blocksPerString} × ${s.blockV} V = ${fig.volts(r.stringV)} V ≠ ${s.dcVoltage} V — configuration not valid; figures below are for the ${fig.volts(r.stringV)} V string, UPS compatibility not verified</b>`]] as [string, string][]
          : [['DC bus', `${s.dcVoltage} V = ${r.blocksPerString} × ${s.blockV} V`]] as [string, string][]),
        ['Calculation basis', esc(r.batteryBasis)],
        ...(s.powerTable ? [['Manufacturer data', `${esc(s.powerTable.model)} · ${esc(s.powerTable.source)} · ${s.powerTable.temperatureC} °C · ${s.powerTable.endCellV} V/cell`], ['Table duty', `${r.tableWattsPerBlock ?? '—'} W/block at ${r.tableMinutes ?? '—'} min (conservative next row)`]] as [string, string][] : []),
        ['Capacity at this rate', `${n(r.rate * 100, 0)} % of C10 (${s.rateCapacityPct ? 'user override' : 'typical'})`],
        ['Factors', `ageing ${s.ageing} · temperature ${s.tempFactor} · design margin ${s.designMargin}`],
        [s.powerTable ? 'Generic Ah estimate (not used for selection)' : 'Required capacity (C10)', `${n(r.requiredAh)} Ah = P × t ÷ ${fig.volts(r.stringV)} V (string) ÷ rate × factors`],
        ['Battery data issue', esc(r.batteryIssue ?? 'None')],
        ...(s.chem === 'li-ion' ? [['SOC window / usable energy', `${s.startSocPct ?? 100} % to ${s.minSocPct ?? 0} % · ${fig.energy(r.usableEnergyKwh)} kWh nominal within SOC window`], ['BMS continuous discharge', `${fig.current(r.stringCurrentA)} A/string · ${r.bmsOk === undefined ? 'Not checked' : r.bmsOk ? 'Within entered current limit' : 'Failed'}`]] as [string, string][] : []),
        ['Selected battery', r.busMismatch && r.blockAh ? `<span class="bad">Not valid (DC bus mismatch)</span> — candidate ${r.strings > 1 ? `${r.strings} strings × ` : ''}${r.blocksPerString} × ${s.blockV} V ${r.blockAh} Ah, ${fig.energy(r.energyKwh)} kWh at ${fig.volts(r.stringV)} V` : r.blockAh ? `<b>${r.strings > 1 ? `${r.strings} strings × ` : ''}${r.blocksPerString} × ${s.blockV} V ${r.blockAh} Ah</b> — ${r.totalBlocks} ${s.chem === 'vrla' ? 'blocks' : 'modules'}, ${fig.energy(r.energyKwh)} kWh` : '<span class="bad">No block size fits</span>'],
        ['Backup with this battery', r.runtimeMin !== undefined ? `<span class="${!r.busMismatch && !r.batteryIssue && r.runtimeMin >= s.autonomyMin ? 'ok' : 'bad'}">${n(r.runtimeMin, 0)} min</span>` : '—'],
        ['Maximum DC current / battery-bus DC breaker', `${fig.current(r.dcCurrentMaxA)} A (end of discharge, all strings) / ${r.dcBreakerNoFit ? `<b class="bad">No suitable DC breaker in the list — ${fig.current(r.dcBreakerRequiredA)} A needed (1.25 × I), largest listed ${r.dcBreakerMaxA} A</b>` : r.dcBreakerA ? `${r.dcBreakerA} A (≥ 1.25 × I; confirm DC voltage, poles and breaking capacity)` : '—'}`]
      ])}
      ${s.chargerCurrentA !== undefined ? `<h2>Recharge estimate</h2>${rows([
        ['Charger / concurrent DC load', `${n(s.chargerCurrentA)} A / ${n(s.rechargeLoadA ?? 0)} A; net ${fig.current(r.rechargeNetA ?? 0)} A`],
        ['SOC / efficiency / absorption allowance', `${s.rechargeFromSocPct ?? 20} % → ${s.rechargeToSocPct ?? 100} % / ${s.chargeEfficiencyPct ?? 95} % / ${s.absorptionHours ?? 0} h`],
        ['Bulk + absorption estimate', r.rechargeIssue ? esc(r.rechargeIssue) : r.rechargeHours !== undefined ? `${n(r.rechargeHours)} h` : '—']
      ])}` : ''}
      ${r.notes.length ? `<p>${esc(r.notes.join(' · '))}</p>` : ''}
      <p class="note">Generic Ah sizing is a preliminary estimate. Entered constant-power tables apply only to the stated battery model, end voltage and reference temperature; runtime is bounded by the supplied rows. Confirm battery and UPS compatibility, temperature correction and charge limits with the manufacturer.</p>
    </section>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(project.name)} — UPS sizing</title><style>${CSS}</style></head><body>${pages}</body></html>`;
}

export function buildPvReportHtml(project: Project, s: PvSystem, r: PvResult): string {
  const board = s.boardId ?? project.boards.find((b) => !b.upstreamId)?.id ?? project.boards[0]?.id;
  const conn = board && r.inverters ? pvConnection(project, s, r, board) : undefined;
  const ok = (b: boolean) => `<span class="${b ? 'ok' : 'bad'}">${b ? 'OK' : 'Fail'}</span>`;
  const mppt = (b: boolean) => (r.vmpBasis === 'estimated' ? `<span class="${b ? 'warn' : 'bad'}">${b ? 'OK (estimated)' : 'Fail (estimated)'}</span>` : ok(b));
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(project.name)} — Solar PV sizing</title><style>${CSS}</style></head><body>
  <section class="page">${head(project, 'Solar PV sizing — panels and inverters')}
  <h2>Array</h2>${rows([
    ['Sized by', s.mode === 'kwp' ? `Target ${s.targetKwp} kWp` : s.mode === 'area' ? `Roof area ${s.roofAreaM2} m² (${s.roofUsePct} % usable)` : `Daily energy ${s.dailyKwh} kWh`],
    ['Panel', `${esc(s.panel.name)} — ${s.panel.pmaxW} W, Voc ${s.panel.vocV} V, Vmp ${s.panel.vmpV} V, Isc ${s.panel.iscA} A, ${s.panel.lengthM} × ${s.panel.widthM} m`],
    ['Array', `<b>${r.panels} panels = ${fig.power(r.kwp)} kWp</b> in ${r.strings} strings of ${r.perString}`],
    ['Panel area / roof needed', `${fig.size(r.arrayAreaM2)} m² / ≈ ${fig.size(r.roofNeededM2)} m²`]
  ])}
  <h2>Inverters</h2>${rows([
    ['Inverter', `${esc(s.inverter.name)} — ${s.inverter.acKw} kW, ${s.inverter.phases}-phase, max DC ${s.inverter.maxDcV} V, MPPT ${s.inverter.mpptMinV}–${s.inverter.mpptMaxV} V, ${s.inverter.mppts} MPPTs × ${s.inverter.maxInputA} A`],
    ['Selected', `<b>${r.inverters} × ${s.inverter.acKw} kW = ${fig.plain(r.inverters * s.inverter.acKw, 1)} kW AC</b>, DC/AC ${r.dcAcRatio.toFixed(2)}`],
    ['AC connection', `${fig.current(r.acCurrentA)} A → ${r.acBreakerNoFit ? `<b class="bad">No suitable breaker in the available list — ${fig.current(r.acBreakerRequiredA)} A needed (1.25 × I), largest available ${r.acBreakerMaxA} A</b>` : r.acBreakerA ? `${r.acBreakerA} A breaker` : 'no breaker (no generation)'} (${acConnection(s, project.voltageV).text}${s.inverter.phases === 1 ? `${s.acPhase ? `, phase ${s.acPhase}` : ', phase not set'}${r.inverters > 1 ? `; ${r.inverters} inverters counted together` : ''}` : ''})`],
    ...(conn ? [['SLD connection', conn.ok ? esc(conn.text) : `<b class="bad">${esc(conn.text)}</b>`] as [string, string]] : []),
  ])}
  <h2>String design (IEC 62548)</h2>${rows([
    ['Site temperatures', `min ${s.tMinC} °C, max ${s.tMaxC} °C → max cell ${n(r.tCellMaxC, 0)} °C (NOCT ${s.panel.noctC} °C)`],
    ['Temperature coefficients', `Voc ${s.panel.betaVocPct} %/°C (maximum DC voltage) · Vmp ${r.vmpCoeffPct} %/°C (MPPT window)${r.vmpBasis === 'estimated' ? ' — <b class="warn">ESTIMATED: no datasheet Vmp coefficient; typical crystalline-silicon value, MPPT checks not verified</b>' : ' (datasheet)'} · Pmax ${s.panel.gammaPmaxPct} %/°C (yield). Linear approximation V(T) = V<sub>STC</sub> × (1 + coefficient × (T − 25 °C)).`],
    [`String Voc at ${s.tMinC} °C`, `${r.perString} × ${n(r.vocColdV, 2)} = ${fig.volts(r.perString * r.vocColdV)} V ≤ ${s.inverter.maxDcV} V ${ok(r.perString * r.vocColdV <= s.inverter.maxDcV)}`],
    [`String Vmp at ${n(r.tCellMaxC, 0)} °C`, `${r.perString} × ${n(r.vmpHotV, 2)} = ${fig.volts(r.perString * r.vmpHotV)} V ≥ ${s.inverter.mpptMinV} V ${mppt(r.perString * r.vmpHotV >= s.inverter.mpptMinV)}`],
    [`String Vmp at ${s.tMinC} °C`, `${r.perString} × ${n(r.vmpColdV, 2)} = ${fig.volts(r.perString * r.vmpColdV)} V ≤ ${s.inverter.mpptMaxV} V ${mppt(r.perString * r.vmpColdV <= s.inverter.mpptMaxV)}`],
    ['MPPT current', `${r.stringsPerMppt} × 1.25 × ${s.panel.iscA} A = ${fig.current(r.mpptCurrentA)} A ≤ ${s.inverter.maxInputA} A ${ok(r.mpptCurrentA <= s.inverter.maxInputA)}`],
    ['Panels per string that fit', `${r.minPerString} – ${r.maxPerString}`]
  ])}
  <h2>Energy</h2>${rows([
    ['Peak sun hours', `${s.peakSunHours} kWh/m²/day`],
    ['Losses', `temperature ${n(r.tempLossPct)} % · soiling ${s.soilingPct} % · mismatch ${s.mismatchPct} % · DC cable ${s.dcCablePct} % · AC cable ${s.acCablePct} % · inverter ${n(100 - s.inverter.efficiencyPct)} %`],
    ['Performance ratio', `${n(r.prPct)} %`],
    ['Yield', `<b>${fig.energy(r.dailyKwh)} kWh/day · ${fig.energy(r.annualKwh)} kWh/year</b> (${n(r.specificYield, 0)} kWh/kWp)`],
    ['Savings', r.savings !== undefined ? `${fig.fixed(r.savings, 2)} per year at ${s.tariff} per kWh` : '—'],
    ['CO₂ avoided', `${n(r.co2Tonnes)} t/year at ${s.gridKgPerKwh} kg/kWh`]
  ])}
  ${r.notes.length ? `<p>${esc(r.notes.join(' · '))}</p>` : ''}
  <p class="note">Yield = kWp × peak sun hours × performance ratio (first estimate; confirm with a simulation such as PVsyst for the final design). Panel and inverter values from the datasheets entered.</p>
  </section></body></html>`;
}
