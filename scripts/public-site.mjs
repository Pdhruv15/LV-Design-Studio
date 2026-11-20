#!/usr/bin/env node

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { releaseMetadata } from './beta-release.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT_FILE = join(ROOT, 'docs/public-site/product.json');
const SCREENSHOTS_DIR = join(ROOT, 'docs/screenshots');
const INTRO_VIDEO_NAME = 'lv-design-studio-product-intro-30s.mp4';
const INTRO_VIDEO_FILE = join(ROOT, 'docs/brand/video', INTRO_VIDEO_NAME);
const README_FILE = join(ROOT, 'README.md');
export const README_START = '<!-- PUBLIC-PRODUCT:START — generated from docs/public-site/product.json by scripts/public-site.mjs -->';
export const README_END = '<!-- PUBLIC-PRODUCT:END -->';
const REPOSITORY = 'https://github.com/Pdhruv15/LV-Design-Studio';
const SITE = 'https://pdhruv15.github.io/LV-Design-Studio';
// Get involved: the reviewed content names a target; the address is fixed here, so no text in the content can become a link.
const LINKEDIN_PAGE = /^https:\/\/www\.linkedin\.com\/(in|company)\/[A-Za-z0-9_%-]{3,100}\/?$/;
const INVOLVED_TARGETS = { linkedin: (involved) => involved.linkedin, issue: () => `${REPOSITORY}/issues/new`, source: () => REPOSITORY };

const esc = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const text = (value, name, max = 500) => {
  const forbiddenControl = typeof value === 'string' && [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 && ![9, 10, 13].includes(code);
  });
  if (typeof value !== 'string' || value.length < 1 || value.length > max || forbiddenControl) throw new Error(`${name} is invalid`);
  return value;
};

export function validateProduct(value, screenshotsDir = SCREENSHOTS_DIR) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.schemaVersion !== 1) throw new Error('Public product content has an invalid schema');
  text(value.name, 'name', 80);
  text(value.tagline, 'tagline', 160);
  text(value.summary, 'summary', 600);
  text(value.engineeringStatus, 'engineeringStatus', 1_000);
  if (!Array.isArray(value.facts) || value.facts.length < 1 || value.facts.length > 6) throw new Error('facts are invalid');
  value.facts.forEach((fact, index) => text(fact, `fact ${index}`, 100));
  if (!Array.isArray(value.capabilities) || value.capabilities.length < 1 || value.capabilities.length > 8) throw new Error('capabilities are invalid');
  value.capabilities.forEach((item, index) => {
    if (!item || typeof item !== 'object') throw new Error(`capability ${index} is invalid`);
    text(item.title, `capability ${index} title`, 100);
    text(item.description, `capability ${index} description`, 400);
  });
  if (!Array.isArray(value.screenshots) || value.screenshots.length < 1 || value.screenshots.length > 20) throw new Error('screenshots are invalid');
  const files = new Set();
  value.screenshots.forEach((item, index) => {
    if (!item || typeof item !== 'object' || typeof item.file !== 'string' || !/^\d{2}-[a-z0-9-]+\.png$/.test(item.file) || files.has(item.file)) throw new Error(`screenshot ${index} is invalid`);
    files.add(item.file);
    text(item.title, `screenshot ${index} title`, 120);
    text(item.description, `screenshot ${index} description`, 400);
    if (!existsSync(join(screenshotsDir, item.file))) throw new Error(`Screenshot is missing: ${item.file}`);
  });
  const involved = value.getInvolved;
  if (!involved || typeof involved !== 'object' || Array.isArray(involved)) throw new Error('getInvolved is invalid');
  text(involved.intro, 'getInvolved intro', 400);
  if (typeof involved.linkedin !== 'string' || !LINKEDIN_PAGE.test(involved.linkedin)) throw new Error('getInvolved linkedin is invalid');
  if (!Array.isArray(involved.items) || involved.items.length < 1 || involved.items.length > 6) throw new Error('getInvolved items are invalid');
  involved.items.forEach((item, index) => {
    if (!item || typeof item !== 'object' || !Object.hasOwn(INVOLVED_TARGETS, item.target)) throw new Error(`getInvolved item ${index} is invalid`);
    text(item.title, `getInvolved item ${index} title`, 100);
    text(item.description, `getInvolved item ${index} description`, 400);
    text(item.linkLabel, `getInvolved item ${index} linkLabel`, 60);
  });
  return value;
}

export function readProduct() {
  return validateProduct(JSON.parse(readFileSync(CONTENT_FILE, 'utf8')));
}

function displayVersion(version) {
  const match = /^(\d+)\.(\d+)\.\d+$/.exec(version);
  if (!match) throw new Error('package.json version is invalid');
  return `${match[1]}.${match[2].padStart(3, '0')}`;
}

export function readmeProductBlock(product, packageVersion) {
  const screenshotLines = product.screenshots.map((shot) => `**${shot.title}**: ${shot.description}\n![${shot.title}](docs/screenshots/${shot.file})`).join('\n\n');
  return `${README_START}
# ${product.name}

${product.summary}

[Try the browser app](${SITE}/)
· [About the project](${SITE}/about/)
· [Download an unsigned beta](${SITE}/download/)
· [Calculation methods and limits](docs/engineering/calculation-methods.md)
· [Privacy and project data](docs/privacy.md)

**Version ${displayVersion(packageVersion)}** (see \`package.json\`). The app is in active use and active development.

> **Engineering status.** ${product.engineeringStatus} Methods, assumptions and limits are in [docs/engineering/calculation-methods.md](docs/engineering/calculation-methods.md).

## Screenshots

The built-in demonstration project shows the same project model across the design stages, calculations, drawings and deliverables.

${screenshotLines}
${README_END}`;
}

export function checkReadme(product = readProduct()) {
  const readme = readFileSync(README_FILE, 'utf8');
  const start = readme.indexOf(README_START);
  const end = readme.indexOf(README_END);
  if (start < 0 || end < start) throw new Error('README public-product markers are missing');
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const actual = readme.slice(start, end + README_END.length);
  const expected = readmeProductBlock(product, pkg.version);
  if (actual !== expected) throw new Error('README public product content is out of sync; run npm run sync:public-site');
}

export function syncReadme(product = readProduct()) {
  const readme = readFileSync(README_FILE, 'utf8');
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const block = readmeProductBlock(product, pkg.version);
  const start = readme.indexOf(README_START);
  const end = readme.indexOf(README_END);
  const next = start >= 0 && end >= start
    ? `${readme.slice(0, start)}${block}${readme.slice(end + README_END.length)}`
    : `${block}\n\n${readme.replace(/^# LV Design Studio[\s\S]*?(?=^## Setup\s*$)/m, '')}`;
  writeFileSync(README_FILE, next, 'utf8');
}

// Graphite colours of the app (src/theme/tokens.css): dark by default, light by the visitor's setting.
// The page runs no script, so there is no switch.
const STYLE = `
    :root{color-scheme:dark;--bg:#15171A;--panel:#1D2024;--p2:#26292E;--line:#353A41;--line-strong:#4A5058;--tx:#E6E8EB;--mut:#A3ABB5;--acc:#F5B301;--on-acc:#1D2024;--warn:#f5c04a;--grid:#272a2f;--tint:rgba(245,179,1,.10);--shadow-shot:0 18px 48px rgba(0,0,0,.5);--shadow-card:0 2px 10px rgba(0,0,0,.35);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-synthesis:none}
    @media(prefers-color-scheme:light){:root{color-scheme:light;--bg:#F5F3EF;--panel:#ffffff;--p2:#EFECE5;--line:#DCD7CC;--line-strong:#C2BBAC;--tx:#272420;--mut:#5D574C;--acc:#875800;--on-acc:#ffffff;--warn:#8a5d00;--grid:#e7e4dc;--tint:rgba(135,88,0,.08);--shadow-shot:0 18px 48px rgba(20,32,53,.22);--shadow-card:0 2px 10px rgba(20,32,53,.10)}}
    *{box-sizing:border-box}html{background:var(--panel)}body{margin:0;line-height:1.55;font-size:16px;color:var(--tx);background:var(--bg)}a{color:inherit;text-underline-offset:4px}a:focus-visible{outline:3px solid var(--acc);outline-offset:3px}svg.i{width:22px;height:22px;flex:none;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.shell{width:min(1120px,calc(100% - 48px));margin:0 auto}
    .site-header{background:var(--panel);border-bottom:1px solid var(--line)}.header-inner{min-height:68px;display:flex;align-items:center;justify-content:space-between;gap:24px}.brand{display:inline-flex;align-items:center;gap:12px;font-weight:750;text-decoration:none;font-size:17px}.brand img{width:34px;height:34px;border-radius:8px}.nav{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:15px}.nav a{padding:8px 12px;border-radius:6px;text-decoration:none;color:var(--mut)}.nav a[aria-current="page"]{color:var(--tx);box-shadow:inset 0 -2px 0 var(--acc);border-radius:0}.nav a.out{margin-left:8px;border:1px solid var(--line-strong);border-radius:999px;padding:7px 14px;color:var(--tx);font-weight:650}
    .hero{position:relative;padding:76px 0 84px;border-bottom:1px solid var(--line)}.hero .paper{position:absolute;inset:0;width:100%;height:100%;color:var(--grid)}.hero .shell{position:relative}.hero-grid{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:48px;align-items:center}.chips{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 22px;padding:0;list-style:none}.chips li{padding:4px 11px;border:1px solid var(--line-strong);border-radius:999px;background:var(--panel);color:var(--mut);font-size:12.5px;font-weight:650;letter-spacing:.04em;text-transform:uppercase}h1{margin:0;font-size:54px;line-height:1.04;letter-spacing:-.035em;font-weight:750}h1 em{font-style:normal;color:var(--acc)}.lede{max-width:780px;margin:24px 0 0;color:var(--mut);font-size:19px;line-height:1.5}
    .actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:30px}.button{display:inline-flex;min-height:46px;align-items:center;justify-content:center;padding:0 20px;border:1px solid var(--line-strong);border-radius:9px;background:var(--panel);font-weight:700;font-size:15.5px;text-decoration:none}.button-primary{border-color:var(--acc);background:var(--acc);color:var(--on-acc)}.facts{display:flex;flex-wrap:wrap;gap:8px 22px;margin:28px 0 0;padding:0;list-style:none;color:var(--mut);font-size:14.5px}.facts li{display:flex;align-items:center;gap:7px}.facts svg{width:17px;height:17px;color:var(--acc);stroke-width:2.4}.stage{position:relative;padding:0 0 34px 36px}.frame{display:block;width:100%;height:auto;border:1px solid var(--line-strong);border-radius:12px;box-shadow:var(--shadow-shot)}.frame.small{position:absolute;left:0;bottom:0;width:46%}
    .section{padding:72px 0;border-bottom:1px solid var(--line)}.section.band{background:var(--panel)}.section-heading{display:grid;grid-template-columns:minmax(200px,.6fr) minmax(0,1.4fr);gap:32px;align-items:start;margin-bottom:36px}.eyebrow{margin:0 0 10px;color:var(--acc);font-size:12.5px;font-weight:750;letter-spacing:.09em;text-transform:uppercase}h2{margin:0;font-size:30px;line-height:1.15;letter-spacing:-.02em}.section-intro{max-width:700px;margin:0;color:var(--mut);font-size:17px}h3{margin:0 0 8px;font-size:17px;line-height:1.3}
    .intro{display:grid;grid-template-columns:minmax(0,.62fr) minmax(0,1fr);gap:56px;align-items:center}.intro .section-intro{margin-top:16px}.product-video{display:block;width:100%;height:auto;border:1px solid var(--line-strong);border-radius:12px;background:#0f2a44;box-shadow:var(--shadow-card)}
    .cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}.card{display:flex;flex-direction:column;padding:24px;border:1px solid var(--line);border-radius:12px;background:var(--panel);box-shadow:var(--shadow-card)}.band .card{background:var(--bg);box-shadow:none}.card p{margin:0;color:var(--mut);font-size:15px}.tile{width:42px;height:42px;margin-bottom:18px;border-radius:9px;background:var(--tint);color:var(--acc);display:grid;place-items:center}.card-link{display:inline-flex;align-items:center;gap:7px;margin-top:auto;padding-top:18px;font-weight:700;font-size:15px}.card-link svg{width:17px;height:17px}.card.lead{border-color:var(--acc)}.card.lead p{margin-bottom:18px}.card.lead .card-link{align-self:flex-start;padding:0 14px;min-height:38px;border-radius:9px;background:var(--acc);color:var(--on-acc);text-decoration:none}
    .gallery{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}.shot{margin:0;border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--panel);box-shadow:var(--shadow-card)}.shot img{display:block;width:100%;height:auto;border-bottom:1px solid var(--line)}.shot figcaption{padding:14px 16px 16px}.shot strong{display:block;margin-bottom:3px;font-size:15px}.shot span{display:block;color:var(--mut);font-size:14px;line-height:1.45}
    .two-column{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.two-column h2{margin-bottom:14px}.two-column p{color:var(--mut)}.note{padding:28px;border:1px solid var(--line);border-radius:12px;background:var(--panel)}.note h2{display:flex;align-items:center;gap:12px;font-size:22px;margin-bottom:14px}.note h2 svg{color:var(--acc)}.note p{margin:0 0 14px;color:var(--mut)}.note p:last-child{margin-bottom:0}.note.caution{border-left:4px solid var(--warn)}.note.caution h2 svg{color:var(--warn)}.note a{display:inline-flex;align-items:center;gap:7px;font-weight:700}.note a svg{width:17px;height:17px}
    .warning{border:1px solid var(--line);border-left:4px solid var(--warn);border-radius:12px;padding:24px;background:var(--panel)}.warning h2{font-size:22px}.warning ul{margin-bottom:0;padding-left:22px;color:var(--mut)}.downloads{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;margin-top:30px}.download{border:1px solid var(--line);border-radius:12px;padding:24px;background:var(--panel);box-shadow:var(--shadow-card)}.download p{color:var(--mut)}.meta{color:var(--mut)}.checksum{display:block;overflow-wrap:anywhere;padding:10px;border-radius:6px;background:var(--p2);font-size:.78rem}.stable{margin-top:32px;padding:22px;border-left:4px solid var(--line-strong);border-radius:0 12px 12px 0;background:var(--panel)}.stable p{color:var(--mut)}
    .site-footer{padding:34px 0 46px;background:var(--panel)}.footer-inner{display:flex;justify-content:space-between;align-items:center;gap:24px;color:var(--mut);font-size:14.5px}.footer-brand{display:inline-flex;align-items:center;gap:10px;color:var(--tx);font-weight:700}.footer-brand img{width:26px;height:26px;border-radius:6px}.footer-links{display:flex;flex-wrap:wrap;gap:18px}
    @media(max-width:900px){.hero-grid,.intro,.section-heading,.two-column,.downloads{grid-template-columns:1fr}.cards,.gallery{grid-template-columns:repeat(2,minmax(0,1fr))}h1{font-size:40px}.header-inner{align-items:flex-start;flex-direction:column;padding:14px 0}.hero{padding:54px 0}.section{padding:52px 0}}
    @media(max-width:560px){.cards,.gallery{grid-template-columns:1fr}.footer-inner{flex-direction:column;align-items:flex-start}}`;

// Line icons drawn inside the page: the page loads no icon file and shows no brand logo.
const ICONS = {
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  network: '<path d="M12 3v6M4 9h16M6 9v5M12 9v5M18 9v5"/><rect x="4" y="14" width="4" height="6" rx="1"/><rect x="10" y="14" width="4" height="6" rx="1"/><rect x="16" y="14" width="4" height="6" rx="1"/>',
  calculator: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8.5 7.5h7M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 16h.01M12 16h.01M15.5 16h.01"/>',
  sheet: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h7M9 16h7"/>',
  compare: '<path d="M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4"/>',
  megaphone: '<path d="M4 10v4h3l7 4V6l-7 4H4z"/><path d="M17.5 9a4.5 4.5 0 0 1 0 6"/>',
  alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
  table: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M3 14.5h18M9 5v14"/>',
  code: '<path d="M9 8l-4 4 4 4M15 8l4 4-4 4M13.5 5l-3 14"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'
};
const CARD_ICONS = ['network', 'calculator', 'sheet', 'compare', 'megaphone', 'alert', 'table', 'code'];
const icon = (name) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

function page(title, description, current, body, product) {
  const canonical = `${SITE}/${current === 'About' ? 'about/' : 'download/'}`;
  const nav = [['Browser app', '../'], ['About', '../about/'], ['Beta downloads', '../download/'], ['Architecture', '../architecture/']];
  const linkedin = esc(product.getInvolved.linkedin);
  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; media-src 'self'; script-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" />
<meta name="description" content="${esc(description)}" /><meta name="robots" content="index, follow" /><link rel="canonical" href="${canonical}" /><link rel="icon" href="../icon.svg" />
<meta property="og:type" content="website" /><meta property="og:site_name" content="LV Design Studio" /><meta property="og:title" content="${esc(title)}" /><meta property="og:description" content="${esc(description)}" /><meta property="og:url" content="${canonical}" /><meta property="og:image" content="${SITE}/icon-512.png" /><title>${esc(title)}</title><style>${STYLE}</style></head>
<body><header class="site-header"><div class="shell header-inner"><a class="brand" href="../"><img src="../icon.svg" alt="" width="34" height="34" /><span>LV Design Studio</span></a><nav class="nav" aria-label="Primary navigation">${nav.map(([label, href]) => `<a href="${href}"${label === current ? ' aria-current="page"' : ''}>${label}</a>`).join('')}<a href="${REPOSITORY}">Source code</a><a class="out" href="${linkedin}">Follow on LinkedIn</a></nav></div></header>${body}<footer class="site-footer"><div class="shell footer-inner"><span class="footer-brand"><img src="../icon.svg" alt="" width="26" height="26" />LV Design Studio</span><div class="footer-links"><a href="${REPOSITORY}/blob/main/LICENSE-MIT">MIT License</a><a href="${REPOSITORY}/blob/main/LICENSE-APACHE">Apache-2.0 License</a><a href="${REPOSITORY}/blob/main/docs/privacy.md">Privacy</a><a href="${linkedin}">LinkedIn</a></div></div></footer></body></html>\n`;
}

export function renderAbout(product) {
  validateProduct(product);
  const facts = product.facts.map((fact) => `<li>${icon('check')}${esc(fact)}</li>`).join('');
  const capabilities = product.capabilities.map((item, index) => `<article class="card"><span class="tile">${icon(CARD_ICONS[index % 4])}</span><h3>${esc(item.title)}</h3><p>${esc(item.description)}</p></article>`).join('');
  // The first screenshot leads the page, with the second in front of it; the gallery shows the rest.
  const [lead, second, ...others] = product.screenshots;
  const gallery = (second ? [second, ...others] : [lead]).map((shot) => `<figure class="shot"><img src="../screenshots/${esc(shot.file)}" alt="${esc(shot.title)}" loading="lazy" /><figcaption><strong>${esc(shot.title)}</strong><span>${esc(shot.description)}</span></figcaption></figure>`).join('');
  const stage = `<img class="frame" src="../screenshots/${esc(lead.file)}" alt="${esc(lead.title)}" />${second ? `<img class="frame small" src="../screenshots/${esc(second.file)}" alt="${esc(second.title)}" />` : ''}`;
  // The last two words of the tagline take the accent colour.
  const words = product.tagline.split(' ');
  const headline = words.length > 2 ? `${esc(words.slice(0, -2).join(' '))} <em>${esc(words.slice(-2).join(' '))}</em>` : esc(product.tagline);
  const involved = product.getInvolved;
  const ways = involved.items.map((item, index) => `<article class="card${item.target === 'linkedin' ? ' lead' : ''}"><span class="tile">${icon(CARD_ICONS[4 + (index % 4)])}</span><h3>${esc(item.title)}</h3><p>${esc(item.description)}</p><a class="card-link" href="${esc(INVOLVED_TARGETS[item.target](involved))}">${esc(item.linkLabel)}${item.target === 'linkedin' ? '' : icon('arrow')}</a></article>`).join('');
  const body = `<main><section class="hero"><svg class="paper" aria-hidden="true"><defs><pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 .5H.5V24" fill="none" stroke="currentColor"/></pattern><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset=".35" style="stop-color:var(--bg);stop-opacity:0"/><stop offset="1" style="stop-color:var(--bg);stop-opacity:1"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#grid)"/><rect width="100%" height="100%" fill="url(#fade)"/></svg><div class="shell hero-grid"><div><ul class="chips"><li>Open source</li><li>Offline first</li><li>Engineer controlled</li></ul><h1>${headline}</h1><p class="lede">${esc(product.summary)}</p><div class="actions"><a class="button button-primary" href="../download/">Download a beta</a><a class="button" href="../">Open the browser app</a></div><ul class="facts">${facts}</ul></div><div class="stage">${stage}</div></div></section>
<section class="section"><div class="shell intro"><div><p class="eyebrow">Introduction</p><h2>LV design in 30 seconds</h2><p class="section-intro">See how the single-line diagram, load schedules, electrical studies and engineering deliverables come together in one offline-first workspace.</p></div><video class="product-video" controls preload="metadata" playsinline aria-label="30-second introduction to LV Design Studio"><source src="../media/${INTRO_VIDEO_NAME}" type="video/mp4" />Your browser does not support embedded video.</video></div></section>
<section class="section"><div class="shell"><div class="section-heading"><div><p class="eyebrow">What it does</p><h2>One project model</h2></div><p class="section-intro">Design information is shared across calculations, drawings and deliverables, reducing repeated entry while keeping the engineer responsible for every decision.</p></div><div class="cards">${capabilities}</div></div></section>
<section class="section"><div class="shell"><div class="section-heading"><div><p class="eyebrow">Screens</p><h2>See the workspace</h2></div><p class="section-intro">Views of the built-in demonstration project: the same project model across the design stages, calculations, drawings and deliverables.</p></div><div class="gallery">${gallery}</div></div></section>
<section class="section"><div class="shell two-column"><article class="note"><h2>${icon('lock')}Private by design</h2><p>The desktop application stores projects as local JSON files. The browser app keeps projects in that browser profile. No account, telemetry or hosted project database is required.</p><p>Back up project files regularly; clearing browser data removes browser-stored projects.</p></article><article class="note caution"><h2>${icon('alert')}Engineering responsibility</h2><p>${esc(product.engineeringStatus)}</p><a href="${REPOSITORY}/blob/main/docs/engineering/calculation-methods.md">Review calculation methods and limits${icon('arrow')}</a></article></div></section>
<section class="section band"><div class="shell"><div class="section-heading"><div><p class="eyebrow">Community</p><h2>Get involved</h2></div><p class="section-intro">${esc(involved.intro)}</p></div><div class="cards">${ways}</div></div></section></main>`;
  return page(`${product.name} — Offline low-voltage electrical design`, product.summary, 'About', body, product);
}

const assetUrl = (tag, name) => `${REPOSITORY}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(name)}`;

export function renderDownload(product, beta) {
  validateProduct(product);
  const release = beta ? `<p class="meta">Version <strong>${esc(beta.version)}</strong> · Published ${esc(new Date(beta.publishedAt).toLocaleDateString('en-GB', { dateStyle: 'long', timeZone: 'UTC' }))} · Source <a href="${REPOSITORY}/commit/${esc(beta.sourceCommit)}"><code>${esc(beta.sourceCommit.slice(0, 12))}</code></a></p><div class="downloads">
<article class="download"><h3>Windows Beta</h3><p>Windows x64 NSIS installer.</p><a class="button button-primary" href="${assetUrl(beta.tag, beta.windows.name)}">Download Windows Beta</a><p>SHA-256</p><code class="checksum">${esc(beta.windows.sha256)}</code></article>
<article class="download"><h3>macOS Beta</h3><p>Apple-silicon (M-series) DMG.</p><a class="button button-primary" href="${assetUrl(beta.tag, beta.macos.name)}">Download macOS Beta</a><p>SHA-256</p><code class="checksum">${esc(beta.macos.sha256)}</code></article></div>` : '<p class="meta">No public beta installer has been published yet. This page will update automatically after the first approved build completes.</p>';
  const body = `<main><section class="hero"><div class="shell"><p class="eyebrow">Public testing channel</p><h1>Download LV Design Studio Beta</h1><p class="lede">Normal installer packages for testers. Installer files are hosted as GitHub Release assets and are not stored in the website repository.</p></div></section>
<section class="section"><div class="shell"><div class="warning"><h2>Unsigned active-development build</h2><ul><li>macOS Gatekeeper and Windows SmartScreen or unknown-publisher warnings are expected.</li><li>Keep operating-system protections enabled; this project does not provide bypass instructions.</li><li>Back up project files before testing.</li><li>Do not use the beta for production issue work.</li></ul></div>${release}<div class="stable"><h2>Stable releases</h2><p>There is no stable desktop release channel yet. Stable releases will be a separate, manually approved process; beta builds are not promoted automatically.</p></div></div></section>
<section class="section"><div class="shell two-column"><article><h2>Verify the installer</h2><p>Compare the downloaded file's SHA-256 value with the checksum shown above or with <code>SHA256SUMS.txt</code> in the matching GitHub prerelease.</p><p>A matching checksum detects an incomplete or changed download; it does not replace an operating-system signature.</p></article><article><h2>Update notifications</h2><p>Packaged beta apps check this site's small static manifest after startup and twice per day. Failures are quiet and never affect offline work.</p><p>When a newer beta exists, the app can open this page. It never downloads, runs, replaces or installs an update automatically.</p></article></div></section></main>`;
  return page('Download LV Design Studio Beta', 'Download unsigned LV Design Studio beta installers for Windows x64 and Apple-silicon macOS.', 'Beta downloads', body, product);
}

export function buildSite({ outDir = join(ROOT, 'dist'), releaseFile, checksumsFile } = {}) {
  const product = readProduct();
  if (!!releaseFile !== !!checksumsFile) throw new Error('Release JSON and checksums must be supplied together');
  const beta = releaseFile ? releaseMetadata(JSON.parse(readFileSync(releaseFile, 'utf8')), readFileSync(checksumsFile, 'utf8')) : undefined;
  mkdirSync(join(outDir, 'about'), { recursive: true });
  mkdirSync(join(outDir, 'download'), { recursive: true });
  mkdirSync(join(outDir, 'media'), { recursive: true });
  mkdirSync(join(outDir, 'screenshots'), { recursive: true });
  writeFileSync(join(outDir, 'about/index.html'), renderAbout(product), 'utf8');
  writeFileSync(join(outDir, 'download/index.html'), renderDownload(product, beta), 'utf8');
  copyFileSync(INTRO_VIDEO_FILE, join(outDir, 'media', INTRO_VIDEO_NAME));
  for (const shot of product.screenshots) copyFileSync(join(SCREENSHOTS_DIR, shot.file), join(outDir, 'screenshots', shot.file));
  if (beta) writeFileSync(join(outDir, 'download/beta.json'), `${JSON.stringify({ schemaVersion: 1, channel: 'beta', version: beta.version, publishedAt: beta.publishedAt, sourceCommit: beta.sourceCommit }, null, 2)}\n`, 'utf8');
  return beta;
}

function options(args) {
  const out = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!['--out', '--release', '--checksums'].includes(key) || !value) throw new Error('Invalid public-site option');
    out[key] = value;
  }
  return out;
}

function main(args) {
  const [command, ...rest] = args;
  if (command === 'check' && rest.length === 0) return checkReadme();
  if (command === 'sync-readme' && rest.length === 0) return syncReadme();
  if (command === 'build') {
    const parsed = options(rest);
    return buildSite({ outDir: parsed['--out'], releaseFile: parsed['--release'], checksumsFile: parsed['--checksums'] });
  }
  throw new Error('Usage: public-site.mjs check | sync-readme | build [--out directory] [--release release.json --checksums SHA256SUMS.txt]');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try { main(process.argv.slice(2)); } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
