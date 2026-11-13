import { revisionStamp } from '../model/revisions';
import { lineText, specView, type SpecDoc, type SpecLine, type SpecView } from '../model/specDoc';
import type { Project } from '../types';
import { esc } from './report';

/** The specification as a printable document (A4 portrait, black-and-white): a title block, the list of
 * sections, then every included section with its numbered clauses. Values from the project are printed as plain
 * text; a value the project does not have prints as DATA REQUIRED in bold, so it cannot be missed. */

const CSS = `
  @page { size: A4 portrait; margin: 18mm 16mm; }
  body { font: 10.5pt/1.5 Arial, sans-serif; color: #000; margin: 0; }
  header { border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 10px; }
  h1 { font-size: 18pt; margin: 0 0 2px; } h2 { font-size: 13pt; margin: 18px 0 6px; break-after: avoid; } h3 { font-size: 10.5pt; margin: 10px 0 2px; break-after: avoid; }
  .meta { font-size: 9pt; }
  ol.contents { list-style: none; padding: 0; margin: 6px 0 0; } ol.contents li { display: grid; grid-template-columns: 28px 1fr; }
  .cl { display: grid; grid-template-columns: 46px 1fr; gap: 4px; margin: 3px 0; break-inside: avoid; }
  .cl.h { font-weight: 700; margin-top: 10px; break-after: avoid; } .cl.n { font-style: italic; }
  .req { font-weight: 700; text-decoration: underline; }
  .missing { border: 1px solid #000; padding: 6px 8px; margin: 10px 0; font-size: 9pt; }
  section { break-before: page; } section.first { break-before: auto; }`;

const lineHtml = (l: SpecLine) => l.runs.map((r) => ('text' in r ? esc(r.text) : r.value !== undefined ? esc(r.value) : `<span class="req">DATA REQUIRED: ${esc(r.label)}</span>`)).join('');
/** Fields with no value, each once, with the clauses that use it. */
export function missingList(v: SpecView): { label: string; clauses: string[] }[] {
  const by = new Map<string, string[]>();
  for (const m of v.missing) by.set(m.label, [...(by.get(m.label) ?? []), m.clauseNo || `section ${m.sectionNo}`]);
  return [...by].map(([label, clauses]) => ({ label, clauses }));
}

export function buildSpecHtml(project: Project, doc: SpecDoc): string {
  const v = specView(doc, project), missing = missingList(v);
  const head = `<header><h1>${esc(doc.title)}</h1><div class="meta">${esc(project.name)} · ${esc(revisionStamp(project))}</div></header>`;
  const contents = `<h2>Contents</h2><ol class="contents">${v.blocks.map((b) => `<li><span>${esc(b.no)}</span><span>${esc(b.title)}</span></li>`).join('')}</ol>`;
  const warn = missing.length ? `<div class="missing"><b>DATA REQUIRED</b> — the project has no value for: ${missing.map((m) => `${esc(m.label)} (${esc(m.clauses.join(', '))})`).join('; ')}.</div>` : '';
  const sections = v.blocks.map((b) => `<section><h2>${esc(b.no)} ${esc(b.title)}</h2>${b.lines.map((l) => `<div class="cl ${l.kind === 'heading' ? 'h' : l.kind === 'note' ? 'n' : ''}"><span>${esc(l.no)}</span><span>${lineHtml(l)}</span></div>`).join('')}</section>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(project.name)} — ${esc(doc.title)}</title><style>${CSS}</style></head><body><section class="first">${head}${contents}${warn}</section>${sections}</body></html>`;
}

/** The specification as plain text lines (number, tab, text), for a quick copy or a check. */
export const specPlainText = (project: Project, doc: SpecDoc): string =>
  specView(doc, project).blocks.map((b) => [`${b.no}\t${b.title}`, ...b.lines.map((l) => `${l.no}\t${lineText(l)}`)].join('\n')).join('\n\n');
