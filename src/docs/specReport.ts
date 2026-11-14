import { revisionStamp } from '../model/revisions';
import { lineText, slotRuns, specFields, specSetup, specView, SPEC_PARTIES, type SpecDoc, type SpecLine, type SpecPage, type SpecView } from '../model/specDoc';
import type { Project } from '../types';
import { cssImage, cssStr } from './printDoc';
import { esc } from './report';
import type { PdfPage } from '../util/files';

/** The specification as a printable document (black-and-white) on the paper, margins, header, footer, logo and
 * watermark of its page setup: a title block with the document information, the list of sections, then every
 * included section with its numbered clauses. Values from the project are printed as plain
 * text; a value the project does not have prints as DATA REQUIRED in bold, so it cannot be missed. */

const CSS = `
  body { font: 10.5pt/1.5 Arial, sans-serif; color: #000; margin: 0; }
  header { border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 10px; }
  h1 { font-size: 18pt; margin: 0 0 2px; } h2 { font-size: 13pt; margin: 18px 0 6px; break-after: avoid; } h3 { font-size: 10.5pt; margin: 10px 0 2px; break-after: avoid; }
  .meta { font-size: 9pt; }
  ol.contents { list-style: none; padding: 0; margin: 6px 0 0; } ol.contents li { display: grid; grid-template-columns: 28px 1fr; }
  .cl { display: grid; grid-template-columns: 46px 1fr; gap: 4px; margin: 3px 0; break-inside: avoid; }
  .cl.h { font-weight: 700; margin-top: 10px; break-after: avoid; } .cl.n { font-style: italic; }
  .req { font-weight: 700; text-decoration: underline; }
  .missing { border: 1px solid #000; padding: 6px 8px; margin: 10px 0; font-size: 9pt; }
  section { break-before: page; } section.first { break-before: auto; }
  table.info { border-collapse: collapse; margin: 8px 0 4px; font-size: 9.5pt; } table.info td { padding: 2px 14px 2px 0; vertical-align: top; } table.info td:first-child { font-weight: 700; }
  .wm { position: fixed; top: 0; bottom: 0; left: 0; right: 0; display: flex; align-items: center; justify-content: center; z-index: -1; }
  .wm span { transform: rotate(-40deg); font-size: 84pt; font-weight: 700; letter-spacing: .08em; white-space: nowrap; opacity: 0.1; }`;

/** The @page rule: paper, margins, and the three header and three footer boxes (text, page numbers or the logo). */
function pageCss(doc: SpecDoc, project: Project, s: SpecPage): string {
  const logo = cssImage(s.logo);
  const box = (where: 'top' | 'bottom', i: number, text: string) => {
    const side = ['left', 'center', 'right'][i], edge = where === 'top' ? 'header' : 'footer';
    const line = where === 'top' ? 'vertical-align: bottom; padding-bottom: 2mm; border-bottom: 0.4pt solid #000;' : 'vertical-align: top; padding-top: 2mm; border-top: 0.4pt solid #000;';
    if (logo && s.logoPlace === `${edge}-${side}`) return `@${where}-${side} { content: ""; width: 45mm; background: url("${logo}") no-repeat ${side} ${where === 'top' ? 'bottom 2mm' : 'top 2mm'} / auto 9mm; ${line} }`;
    const content = slotRuns(text, doc, project).map((r) => ('text' in r ? cssStr(r.text) : `counter(${r.page})`)).join(' ') || '""';
    return `@${where}-${side} { content: ${content}; font: 8pt Arial, sans-serif; color: #000; ${line} }`;
  };
  const m = s.marginsMm;
  return `@page { size: ${s.paper} ${s.landscape ? 'landscape' : 'portrait'}; margin: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm;
  ${s.header.map((x, i) => box('top', i, x)).join('\n  ')}
  ${s.footer.map((x, i) => box('bottom', i, x)).join('\n  ')}
}`;
}
/** How the PDF is printed: the paper of the page setup, the document's own header, footer and page numbers. */
export function specPdfPage(project: Project, doc: SpecDoc): PdfPage {
  const s = specSetup(doc, project);
  return { pageSize: s.paper === 'A3' ? (s.landscape ? 'A3' : 'A3 portrait') : 'A4', landscape: s.landscape, cssPages: true, selfNumbered: true };
}
/** The document information that has a value: number, status, the parties and the engineer's own details. */
export function specInfoRows(doc: SpecDoc, project: Project): [string, string][] {
  const keys = new Set(['doc.number', 'doc.status', ...SPEC_PARTIES.map((x) => `party.${x.key}`)]);
  return specFields(project, doc).filter((f) => f.value !== undefined && (keys.has(f.key) || f.key.startsWith('detail.'))).map((f) => [f.label, f.value!]);
}

const lineHtml = (l: SpecLine) => l.runs.map((r) => ('text' in r ? esc(r.text) : r.value !== undefined ? esc(r.value) : `<span class="req">DATA REQUIRED: ${esc(r.label)}</span>`)).join('');
/** Fields with no value, each once, with the clauses that use it. */
export function missingList(v: SpecView): { label: string; clauses: string[] }[] {
  const by = new Map<string, string[]>();
  for (const m of v.missing) by.set(m.label, [...(by.get(m.label) ?? []), m.clauseNo || `section ${m.sectionNo}`]);
  return [...by].map(([label, clauses]) => ({ label, clauses }));
}

export function buildSpecHtml(project: Project, doc: SpecDoc): string {
  const v = specView(doc, project), missing = missingList(v), setup = specSetup(doc, project);
  const info = specInfoRows(doc, project);
  const head = `<header><h1>${esc(doc.title)}</h1><div class="meta">${esc(project.name)} · ${esc(revisionStamp(project))}</div></header>${info.length ? `<table class="info">${info.map(([k, x]) => `<tr><td>${esc(k)}</td><td>${esc(x)}</td></tr>`).join('')}</table>` : ''}`;
  const mark = setup.watermark ? `<div class="wm"><span>${esc(setup.watermark)}</span></div>` : '';
  const contents = `<h2>Contents</h2><ol class="contents">${v.blocks.map((b) => `<li><span>${esc(b.no)}</span><span>${esc(b.title)}</span></li>`).join('')}</ol>`;
  const warn = missing.length ? `<div class="missing"><b>DATA REQUIRED</b> — the project has no value for: ${missing.map((m) => `${esc(m.label)} (${esc(m.clauses.join(', '))})`).join('; ')}.</div>` : '';
  const sections = v.blocks.map((b) => `<section><h2>${esc(b.no)} ${esc(b.title)}</h2>${b.lines.map((l) => `<div class="cl ${l.kind === 'heading' ? 'h' : l.kind === 'note' ? 'n' : ''}"><span>${esc(l.no)}</span><span>${lineHtml(l)}</span></div>`).join('')}</section>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(project.name)} — ${esc(doc.title)}</title><style>${pageCss(doc, project, setup)}${CSS}</style></head><body>${mark}<section class="first">${head}${contents}${warn}</section>${sections}</body></html>`;
}

/** The specification as plain text lines (number, tab, text), for a quick copy or a check. */
export const specPlainText = (project: Project, doc: SpecDoc): string =>
  specView(doc, project).blocks.map((b) => [`${b.no}\t${b.title}`, ...b.lines.map((l) => `${l.no}\t${lineText(l)}`)].join('\n')).join('\n\n');
