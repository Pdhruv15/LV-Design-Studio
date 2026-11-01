import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleProject } from '../data/sampleProject';
import { evaluateProject, izText } from '../calc/electrical';
import { failReasons } from '../calc/quickFix';
import { PFC_CALC_DEFAULT } from '../calc/pfcCalc';
import { systemSummary } from '../calc/summary';
import { buildTxSummary } from '../docs/txSummary';
import { m, m2 } from '../model/cadMeasure';
import { whenText } from '../model/projectStore';
import { issueRevision } from '../model/revisions';
import type { Project } from '../types';
import { fmtFixed } from '../util/format';
import BoqTable from './BoqTable';
import ProjectDashboard from './docs/ProjectDashboard';
import RevisionsView from './docs/RevisionsView';
import TxRowEditDialog from './docs/TxRowEditDialog';
import PanelTree from './PanelTree';
import ResultsTable from './ResultsTable';
import PfcCalculator from './studies/PfcCalculator';
import SystemSummaryCards from './SystemSummaryCards';
import WhatsNewDialog from './WhatsNewDialog';

const noop = () => {};
/** The sample with its loads ×40, so thousands show. */
const big: Project = { ...sampleProject, feeders: sampleProject.feeders.map((f) => ({ ...f, loadKw: f.loadKw * 40 })) };
const results = evaluateProject(big);
const render = (el: React.ReactElement) => renderToStaticMarkup(el);

describe('screens use the same number formats as the reports', () => {
  it('a results table writes current with the comma and 1 decimal', () => {
    const r = results.find((x) => x.ib > 1000)!;
    expect(render(<ResultsTable results={results} vdLimitPct={big.vdLimitPct} selected={null} onSelect={noop} />)).toContain(`<td class="num">${fmtFixed(r.ib, 1)}</td>`);
  });

  it('the system summary writes power with 2 decimals; its dial stays whole, as it has little room', () => {
    const s = systemSummary(big);
    const html = render(<SystemSummaryCards project={big} selectedBoardId={null} onSelectBoard={noop} />);
    expect(html).toContain(`<dd>${fmtFixed(s.connectedKw, 2)} kW</dd>`);
    expect(html).toContain(`<dd>${fmtFixed(s.currentA, 1)} A</dd>`);
    expect(html).toContain(`${fmtFixed(s.demandKva, 0)} of ${fmtFixed(s.transformerKva, 0)} kVA`);
    expect(html).toContain(`${(s.transformerLoadingPct ?? 0).toFixed(0)}%</text>`);
  });

  it('the cost table writes money with the comma and 2 decimals', () => {
    const html = render(<BoqTable results={results} projectName="x" project={big} />);
    const total = /Grand total \(AED\)<\/td><td[^>]*>([^<]+)</.exec(html)![1];
    expect(total).toMatch(/^\d{1,3}(,\d{3})+\.\d{2}$/);
  });

  it('the panel tree keeps its short loading figure, with the comma', () => {
    const html = render(<PanelTree project={big} results={results} activeId={big.boards[0].id} view="design" onPick={noop} onOpen={noop} menu={new Proxy({}, { get: () => noop }) as never} />);
    expect(html).toMatch(/\d,\d{3}%<\/span>/);
    expect(html).not.toMatch(/tree-load[^>]*>[\d,]+\.\d%/);
  });

  it('a large tile keeps whole numbers where the long form would be cut off', () => {
    const dash = render(<ProjectDashboard project={big} stale={[]} onGo={noop} onRun={noop} onStatus={noop} />);
    expect(dash).toMatch(/Maximum demand<\/span><span class="dash-value">[\d,]+ kW<\/span>/);
    const pfc = render(<PfcCalculator project={{ ...big, pfcCalc: PFC_CALC_DEFAULT }} onChange={noop} onStatus={noop} />);
    expect(pfc).toMatch(/Current<\/span><span class="dash-value">[\d,]+ → [\d,]+ A<\/span>/);
    expect(pfc).toMatch(/Load<\/span><span class="dash-value">[\d,]+\.\d{2} kW<\/span>/);
  });

  it('a box you type in keeps a plain number; the figure beside it follows the rule', () => {
    const row = { ...buildTxSummary(big).groups[0].rows[0], manual: true, phases: { R: 1234.5, Y: 0, B: 0 }, tclKw: 1234.5, mdlKw: 987.6 };
    const html = render(<TxRowEditDialog row={row} substation="SS-1" onSave={noop} onDelete={noop} onClose={noop} />);
    expect(html).toContain('value="1234.50"');
    expect(html).toContain('<output>1,234.50</output>');
    expect(html).toContain('<output>987.60</output>');
  });

  it('text from the calculations follows the same rule', () => {
    expect(izText(1234.56)).toBe('1,234.6');
    expect(izText(Infinity)).toBe('—');
    const failing = results.find((x) => x.icuStatus === 'bad' || x.ib > x.feeder.breakerRatingA)!;
    expect(failReasons(big, failing).join(' ')).toMatch(/Ib [\d,]+\.\d A|fault [\d,]+\.\d{2} kA/);
    expect(m(1234.5)).toBe('1,234.50 m');
    expect(m2(1234.5)).toBe('1,234.50 m²');
  });
});

describe('screens write dates and times the same on every computer', () => {
  it('a revision date on a page', () => {
    const p = issueRevision(sampleProject, { description: 'First', date: '2026-10-05', by: 'QA' });
    expect(render(<RevisionsView project={p} onChange={noop} onStatus={noop} />)).toContain('<td>5 Oct 2026</td>');
  });

  it("What's new", () => {
    const html = render(<WhatsNewDialog releases={[{ version: '9.999', date: '2026-09-05', items: [] }]} onAction={noop} onClose={noop} />);
    expect(html).toContain('5 Sep 2026');
  });

  it('an older project in the list', () => {
    expect(whenText(new Date(2026, 8, 5, 9).getTime(), new Date(2026, 10, 1, 9).getTime())).toBe('5 Sep 2026');
  });
});
