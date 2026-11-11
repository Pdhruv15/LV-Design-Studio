// Builds 00-index.md, 99-integration-map.md and navigator.html from <source>/data/*.json and the module .md files.
// The source folder is the full review (with gaps), kept outside the repository.
// Usage:
//   node build-arch.mjs <source>                       full version, written into <source>
//   node build-arch.mjs <source> --public <out dir>    public version (modules and working links only, no gaps)
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
const pubAt = process.argv.indexOf('--public');
const PUBLIC = pubAt > 0;
const outDir = PUBLIC ? process.argv[pubAt + 1] : dir;
if (!dir || (PUBLIC && !outDir)) { console.error('usage: node build-arch.mjs <source> [--public <out dir>]'); process.exit(1); }
const dataDir = path.join(dir, 'data');

// Public version: any line, sentence or link note that talks about a problem is left out.
const RISK = /\b\d\d-G\d+\b|\bG\d{1,2}\b|\bgaps?\b|\bbugs?\b|unverified|\bmissing\b|not linked|\bbroken\b|\bnever\b|\bwrong\b|\bignor(e|es|ed|ing)\b|\bnot (used|saved|read|checked|shown|updated|applied|covered|handled|tested|stored|refreshed|flagged|included|counted|sized|kept|synced)\b|does not|do not|doesn't|don't|cannot|can't|\bis not\b|\bare not\b|isn't|aren't|no longer|\blost\b|placeholder|hard-?coded|\bTODO\b|FIXME|stale|out[ -]of[ -]date|unsafe|understat|overstat|too (high|low|small|large)|disagree|silently|orphan|duplicat|twice|three (places|times|different)|four (places|different)|inconsistent|mismatch|\bfails?\b|\brisk|danger|bypass|loophole|§ ?[789]|\bdead\b|unused|without (a |any )?(check|warning)|only on this computer|crash|freeze/i;
const safeText = (s) => String(s ?? '').split(/(?<=[.;!?])\s+/).filter((x) => !RISK.test(x)).join(' ');
// Splits markdown into units (heading, table row, list item with its continuation lines, paragraph, code block)
// and leaves out every unit that names a problem, so no half sentence is left behind.
const RISK_CAPS = /\bNOT\b/;
const RISK_HEAD = /focus questions|kept only|although|a copy of|different code|payload check|\bnot (calculated|modell?ed|considered|supported|implemented|exposed|available|in any|in the report)\b|\bno (report|screen|UI|check|test|tool|validation)s?\b|\bnot at all\b/i;
const risky = (s) => RISK.test(s) || RISK_HEAD.test(s) || RISK_CAPS.test(s);
function publicMd(md) {
  // First pass: drop whole sub-sections (### or a bold-only line) whose heading names a problem,
  // and whole tables whose header row does.
  const pre = [];
  const src = md.split(/^## 7\./m)[0].split('\n');
  const level = (l) => (/^## /.test(l) ? 2 : /^### /.test(l) ? 3 : /^\*\*[^*].*\*\*:?\s*$/.test(l) ? 4 : 0);
  for (let i = 0; i < src.length; i++) {
    const lv = level(src[i]);
    if (lv >= 3 && risky(src[i])) { let j = i + 1; while (j < src.length && !(level(src[j]) && level(src[j]) <= lv)) j++; i = j - 1; continue; }
    if (/^\s*\|/.test(src[i]) && /^\s*\|?\s*:?-{2,}/.test(src[i + 1] ?? '') && risky(src[i])) { let j = i + 2; while (j < src.length && /^\s*\|/.test(src[j])) j++; i = j - 1; continue; }
    if (/^\s*\|?\s*:?-{2,}[-|: ]*$/.test(src[i]) && !/^\s*\|/.test(src[i - 1] ?? '')) { let j = i + 1; while (j < src.length && /^\s*\|/.test(src[j])) j++; i = j - 1; continue; }
    pre.push(src[i]);
  }
  const lines = pre;
  const isItem = (l) => /^\s*([-*+]|\d+[.)])\s+/.test(l);
  const isRow = (l) => /^\s*\|/.test(l);
  const isHead = (l) => /^#{1,6}\s/.test(l);
  const out = [];
  for (let i = 0; i < lines.length;) {
    const l = lines[i];
    let unit = [l], j = i + 1;
    if (/^```/.test(l)) { while (j < lines.length && !/^```/.test(lines[j])) unit.push(lines[j++]); if (j < lines.length) unit.push(lines[j++]); out.push(...unit); i = j; continue; }
    if (!l.trim() || isHead(l) || isRow(l)) { /* single line */ }
    else if (isItem(l)) { while (j < lines.length && lines[j].trim() && !isItem(lines[j]) && !isRow(lines[j]) && !isHead(lines[j]) && /^\s{2,}/.test(lines[j])) unit.push(lines[j++]); }
    else { while (j < lines.length && lines[j].trim() && !isItem(lines[j]) && !isRow(lines[j]) && !isHead(lines[j]) && !/^```/.test(lines[j])) unit.push(lines[j++]); }
    const text = unit.join(' ');
    // A kept paragraph that only introduces a list ("It:") loses its list when every item was dropped; that is fine.
    // Keep a table header row even if it reads like a problem only when its table survived the first pass.
    const header = isRow(l) && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] ?? '');
    if (isHead(l) || header || !risky(text)) out.push(...unit);
    i = j;
  }
  // Drop table headers whose rows were all removed.
  const res = [];
  for (let i = 0; i < out.length; i++) {
    if (/^\s*\|/.test(out[i]) && /^\s*\|?\s*:?-{2,}/.test(out[i + 1] ?? '') && !/^\s*\|/.test(out[i + 2] ?? '')) { i++; continue; }
    res.push(out[i]);
  }
  return res.join('\n').replace(/\n{3,}/g, '\n\n').replace('· [Integration map](99-integration-map.md)', '· [Integration map](99-integration-map.md)') +
    '\n\n---\n\n*Public summary: describes what the module does and how it connects. The engineering review of open issues is kept separately.*\n';
}
const GROUPS = [
  ['Core platform', ['01-app-shell', '02-project-storage', '03-parameters-rules', '32-component-database', '34-electron-desktop', '31-headless-cli-mcp']],
  ['Design inputs', ['04-building-load-assessment', '05-space-planning', '06-network-sld-editor', '07-load-schedule-panels']],
  ['Studies', ['08-voltage-drop', '09-earthing', '10-protection-coordination', '11-breaker-cable-selection', '12-transformer-generator', '13-power-factor-correction', '14-busbar', '15-ups-solar', '16-load-flow-engines', '33-quick-calcs-existing']],
  ['Equipment & containment', ['17-enclosure-form4', '18-lighting-emergency', '19-cable-tray-containment', '20-equipment-boq-pricing', '29-elv']],
  ['CAD & drawings', ['21-cad-core', '22-cad-electrical', '23-cad-sheets-plot-titleblock', '24-drawings-sld-sheets']],
  ['Documents & workflow', ['25-reports-exports', '26-revisions-changes', '27-review-submissions-authority', '28-dashboard-readiness', '30-exchange-inbox']]
];
const SHORT = {"01-app-shell": "App shell & navigation", "02-project-storage": "Project data & storage", "03-parameters-rules": "Parameters & design rules", "04-building-load-assessment": "Building & load assessment", "05-space-planning": "Space planning & substation", "06-network-sld-editor": "Network / SLD editor & core calc", "07-load-schedule-panels": "Load schedule & panels", "08-voltage-drop": "Voltage drop", "09-earthing": "Earthing & earth fault loop", "10-protection-coordination": "Protection coordination", "11-breaker-cable-selection": "Breaker & cable selection", "12-transformer-generator": "Transformer & generator", "13-power-factor-correction": "Power factor correction", "14-busbar": "Busbar & busway", "15-ups-solar": "UPS & solar PV", "16-load-flow-engines": "Load flow engines", "17-enclosure-form4": "Enclosure & Form 4", "18-lighting-emergency": "Lighting & emergency lighting", "19-cable-tray-containment": "Cable schedule, tray & containment", "20-equipment-boq-pricing": "Equipment, BOQ & pricing", "21-cad-core": "Design CAD core", "22-cad-electrical": "CAD electrical (devices on plans)", "23-cad-sheets-plot-titleblock": "CAD sheets, plot & title block", "24-drawings-sld-sheets": "Drawings, SLD sheets & register", "25-reports-exports": "Reports & exports", "26-revisions-changes": "Revisions & changes", "27-review-submissions-authority": "Review, submissions & authority rules", "28-dashboard-readiness": "Dashboard & readiness", "29-elv": "ELV systems", "30-exchange-inbox": "Data exchange & inbox", "31-headless-cli-mcp": "Headless CLI & MCP", "32-component-database": "Component database & library", "33-quick-calcs-existing": "Quick calcs & existing checks", "34-electron-desktop": "Desktop wrapper (Electron)"};
const groupOf = {};
GROUPS.forEach(([g, ids]) => ids.forEach((id) => (groupOf[id] = g)));
const order = GROUPS.flatMap(([, ids]) => ids);

const mods = [];
const problems = [];
for (const id of order) {
  const jf = path.join(dataDir, `${id}.json`);
  const mf = path.join(dir, `${id}.md`);
  if (!fs.existsSync(jf)) { problems.push(`missing ${id}.json`); continue; }
  let j;
  try { j = JSON.parse(fs.readFileSync(jf, 'utf8')); } catch (e) { problems.push(`bad JSON ${id}: ${e.message}`); continue; }
  j.id = id;
  j.group = groupOf[id];
  j.full = j.name;
  j.name = SHORT[id] ?? j.name;
  j.md = fs.existsSync(mf) ? fs.readFileSync(mf, 'utf8') : `# ${id}\n\n(markdown file missing)`;
  if (!fs.existsSync(mf)) problems.push(`missing ${id}.md`);
  j.links = (j.links ?? []).filter((l) => {
    if (!order.includes(l.to)) { problems.push(`${id}: link to unknown module ${l.to}`); return false; }
    return l.to !== id;
  });
  j.gaps = j.gaps ?? [];
  if (PUBLIC) {
    j.md = publicMd(j.md);
    j.summary = safeText(j.summary);
    if (!j.summary.trim()) {
      // Every summary sentence named a problem: use the start of "1. What it does" instead.
      const first = (j.md.split(/^## 1\.[^\n]*\n/m)[1] ?? '').split(/\n\s*\n/).find((p) => p.trim() && !/^\s*[|#-]/.test(p)) ?? '';
      j.summary = safeText(first.replace(/\s+/g, ' ')).split(/(?<=[.!?:])\s+/).filter((x) => !/:\s*$/.test(x)).slice(0, 2).join(' ');
    }
    j.links = j.links.filter((l) => l.status === 'working').map((l) => ({ ...l, what: RISK.test(l.what ?? '') ? 'data link' : l.what, ref: RISK.test(l.ref ?? '') ? '' : l.ref }));
    j.gaps = [];
  }
  mods.push(j);
}
const byId = Object.fromEntries(mods.map((m) => [m.id, m]));
const sevRank = { high: 0, medium: 1, low: 2 };
const allGaps = mods.flatMap((m) => m.gaps.map((g) => ({ ...g, module: m.id, moduleName: m.name })))
  .sort((a, b) => (sevRank[a.severity] ?? 3) - (sevRank[b.severity] ?? 3) || order.indexOf(a.module) - order.indexOf(b.module));

// Edges: one per unordered pair, keeping whether any working and any broken/missing link was reported (by either side).
const edges = new Map();
for (const m of mods) for (const l of m.links) {
  const [a, b] = l.dir === 'in' ? [l.to, m.id] : [m.id, l.to];
  const key = [a, b].sort().join('|');
  const e = edges.get(key) ?? { a, b, working: [], broken: [] };
  (l.status === 'working' ? e.working : e.broken).push({ from: m.id, status: l.status, what: l.what, ref: l.ref, dir: l.dir });
  edges.set(key, e);
}
const edgeList = [...edges.values()];

const count = (gs, k, v) => gs.filter((g) => g[k] === v).length;
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const loc = (g) => `\`${g.file ?? '?'}${g.line ? `:${g.line}` : ''}\`${g.func ? ` — \`${g.func}\`` : ''}`;
const today = new Date().toISOString().slice(0, 10);
const cross = PUBLIC ? '' : fs.readFileSync(path.join(dir, '_build', 'cross-cutting.md'), 'utf8');
const [top10, themes] = PUBLIC ? ['', ''] : cross.split(/(?=## Problems that cross several modules)/);
const commit = process.env.ARCH_COMMIT ? ` (commit \`${process.env.ARCH_COMMIT}\`)` : '';
const write = (f, text) => fs.writeFileSync(path.join(outDir, f), text);

// ---------- 00-index.md ----------
let idx = `# LV Design Studio — architecture index\n\n`;
if (PUBLIC) {
  idx += `How LV Design Studio is built: every feature (module), what it does, its main files, and how the modules pass data to each other. Written from the code on \`main\`${commit}, ${today}.\n\n`;
  idx += `- [Integration map (diagram of working links)](99-integration-map.md)\n- [Interactive navigator](navigator.html) — also on the web: https://pdhruv15.github.io/LV-Design-Suit/architecture/\n\n`;
  idx += `**Totals:** ${mods.length} modules · ${edgeList.length} links between modules.\n\n`;
  for (const [g, ids] of GROUPS) {
    idx += `## ${g}\n\n| # | Module | What it does | Main files |\n|---|---|---|---|\n`;
    for (const id of ids) {
      const m = byId[id];
      const files = (m.files ?? []).slice(0, 4).map((f) => `\`${f.path}\``).join(', ') + ((m.files ?? []).length > 4 ? ` +${m.files.length - 4} more` : '');
      idx += `| ${id.slice(0, 2)} | [${esc(m.name)}](${id}.md) | ${esc(m.summary)} | ${files} |\n`;
    }
    idx += '\n';
  }
  idx += `Rebuild: \`node docs/architecture/_build/build-arch.mjs <review folder> --public docs/architecture\` (the review folder holds the full module data).\n`;
} else {
idx += `Analysis of the code on \`main\`${commit}, written ${today}. Read-only: no application code was changed. Private review copy — do not commit. Rebuild with \`node _build/build-arch.mjs .\` here, and the public version with \`node _build/build-arch.mjs . --public <repo>/docs/architecture\`.\n\n`;
idx += `- [Integration map (diagram + every gap)](99-integration-map.md)\n- [Interactive navigator (open in a browser, works offline)](navigator.html)\n\n`;
idx += `**Totals:** ${mods.length} modules · ${allGaps.length} gaps (${count(allGaps, 'severity', 'high')} high, ${count(allGaps, 'severity', 'medium')} medium, ${count(allGaps, 'severity', 'low')} low) · `;
idx += `${edgeList.filter((e) => e.working.length).length} working links · ${edgeList.filter((e) => e.broken.length).length} broken or missing links.\n\n`;
idx += top10.replace('## Top 10 gaps to fix first', '## Top 10 gaps to fix first') + '\n';
idx += `How to read the gap counts: **high** = can give a wrong design value or lose data; **medium** = wrong or missing output, or a broken link between modules; **low** = tidy-up or missing test.\n\n`;
for (const [g, ids] of GROUPS) {
  idx += `## ${g}\n\n| # | Module | What it does | Main files | Gaps (high / med / low) |\n|---|---|---|---|---|\n`;
  for (const id of ids) {
    const m = byId[id];
    if (!m) { idx += `| ${id.slice(0, 2)} | ${id} | *(not analysed)* | | |\n`; continue; }
    const files = (m.files ?? []).slice(0, 4).map((f) => `\`${f.path}\``).join(', ') + ((m.files ?? []).length > 4 ? ` +${m.files.length - 4} more` : '');
    idx += `| ${id.slice(0, 2)} | [${esc(m.name)}](${id}.md) | ${esc(m.summary)} | ${files} | ${count(m.gaps, 'severity', 'high')} / ${count(m.gaps, 'severity', 'medium')} / ${count(m.gaps, 'severity', 'low')} |\n`;
  }
  idx += '\n';
}
}
write('00-index.md', idx);

// ---------- 99-integration-map.md ----------
const nid = (id) => `M${id.slice(0, 2)}`;
let mm = '```mermaid\nflowchart LR\n';
GROUPS.forEach(([g, ids], gi) => {
  mm += `  subgraph G${gi}["${g}"]\n`;
  for (const id of ids) if (byId[id]) mm += `    ${nid(id)}["${id.slice(0, 2)} ${byId[id].name.replace(/"/g, "'")}"]\n`;
  mm += '  end\n';
});
const styles = [];
let li = 0;
for (const e of edgeList) {
  if (e.broken.length) { mm += `  ${nid(e.a)} -.-> ${nid(e.b)}\n`; styles.push(`  linkStyle ${li++} stroke:#d03030,stroke-width:1.5px,stroke-dasharray:5 4`); }
  else { mm += `  ${nid(e.a)} --> ${nid(e.b)}\n`; styles.push(`  linkStyle ${li++} stroke:#2e8b57,stroke-width:1.5px`); }
}
mm += styles.join('\n') + '\n```\n';
let im = '';
if (PUBLIC) {
  im = `# Integration map\n\n[← Index](00-index.md) · [Interactive navigator](navigator.html)\n\n`;
  im += `Each box is a module. A line means one module passes data to another; arrows point the way the data flows (from the module that produces it to the module that uses it).\n\n## Diagram\n\n` + mm + '\n';
  im += `## Links between modules\n\n| From | To | What passes | Where (file — function) |\n|---|---|---|---|\n`;
  for (const e of edgeList) for (const l of e.working) im += `| ${byId[e.a].name} | ${byId[e.b].name} | ${esc(l.what)} | ${l.ref ? `\`${esc(l.ref)}\`` : ''} |\n`;
} else {
im = `# Integration map\n\n[← Index](00-index.md) · [Interactive navigator](navigator.html)\n\n`;
im += `Each box is a module. **Solid green line** = a working link found in code. **Dashed red line** = a link that should exist but is missing, or exists but is broken. `;
im += `Arrows point the way the data flows (from the module that produces it to the module that uses it). Lines are built from the "Linked to" and "NOT linked" sections of each module file. Where a pair of modules has both a working and a broken link, this diagram shows only the dashed red line (the navigator shows both).\n\n`;
im += top10 + '\n' + themes + '\n## Diagram\n\n' + mm + '\n';
im += `## Broken or missing links\n\n| From | To | Status | What | Where (file — function) | Reported by |\n|---|---|---|---|---|---|\n`;
for (const e of edgeList) for (const l of e.broken) im += `| ${e.a} | ${e.b} | ${l.status} | ${esc(l.what)} | \`${esc(l.ref)}\` | ${l.from} |\n`;
im += `\n## Every gap in the app (${allGaps.length})\n\nSorted by severity, then module. Kind: bug / incomplete / missing. Action: fix (small change) / rewrite (redesign that part) / add (new piece).\n\n`;
im += `| Gap | Module | Severity | Kind | Action | Gap | Where (file — function) | Verified |\n|---|---|---|---|---|---|---|---|\n`;
for (const g of allGaps) im += `| ${g.id} | [${g.module}](${g.module}.md) | ${g.severity} | ${g.kind} | ${g.action} | **${esc(g.title)}** — ${esc(g.detail)} | ${loc(g)} | ${g.verified === false ? 'unverified' : 'yes'} |\n`;
}
write('99-integration-map.md', im);
if (PUBLIC) for (const m of mods) write(`${m.id}.md`, m.md);

// ---------- navigator.html ----------
const payload = { public: PUBLIC, generated: today, groups: GROUPS, modules: mods.map(({ id, name, full, group, summary, files, links, gaps, md }) => ({ id, name, full: PUBLIC ? name : full, group, summary, files, links, gaps, md })), edges: edgeList, extra: {} };
for (const f of ['00-index.md', '99-integration-map.md']) payload.extra[f] = fs.readFileSync(path.join(outDir, f), 'utf8');
const json = JSON.stringify(payload).replace(/</g, '\\u003c');
let tpl = fs.readFileSync(new URL('./navigator.tpl.html', import.meta.url), 'utf8');
tpl = PUBLIC ? tpl.replace(/<!--priv-->[\s\S]*?<!--\/priv-->/g, '') : tpl.replace(/<!--\/?priv-->/g, '');
if (PUBLIC) tpl = tpl.replace('<title>LV Design Studio — architecture navigator</title>', '<title>LV Design Studio — how it is built</title>');
write('navigator.html', tpl.replace('__DATA__', () => json));

console.log(`${PUBLIC ? 'public' : 'full'}: modules ${mods.length}, gaps ${allGaps.length}, edges ${edgeList.length}`);
if (problems.length) console.log('problems:\n  ' + problems.join('\n  '));
