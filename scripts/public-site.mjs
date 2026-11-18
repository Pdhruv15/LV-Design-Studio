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

const STYLE = `
    :root{color-scheme:light;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#151515;background:#fff;font-synthesis:none}
    *{box-sizing:border-box}body{margin:0;line-height:1.55}a{color:inherit;text-underline-offset:4px}a:focus-visible{outline:3px solid #151515;outline-offset:3px}.shell{width:min(1120px,calc(100% - 40px));margin:0 auto}
    .site-header{border-bottom:1px solid #ddddda}.header-inner{min-height:72px;display:flex;align-items:center;justify-content:space-between;gap:24px}.brand{display:inline-flex;align-items:center;gap:12px;font-weight:750;text-decoration:none}.brand img{width:36px;height:36px}.nav{display:flex;flex-wrap:wrap;gap:18px;font-size:.94rem}
    .hero{padding:80px 0 68px;border-bottom:1px solid #ddddda}.eyebrow{margin:0 0 16px;color:#555550;font-size:.85rem;font-weight:750;letter-spacing:.09em;text-transform:uppercase}h1{max-width:900px;margin:0;font-size:clamp(2.6rem,7vw,5.4rem);line-height:.98;letter-spacing:-.055em}.lede{max-width:780px;margin:28px 0 0;color:#4b4b47;font-size:clamp(1.08rem,2vw,1.34rem)}
    .actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:32px}.button{display:inline-flex;min-height:46px;align-items:center;justify-content:center;padding:10px 18px;border:1px solid #151515;border-radius:4px;font-weight:700;text-decoration:none}.button-primary{color:#fff;background:#151515}.button-secondary{background:#fff}.facts{display:flex;flex-wrap:wrap;gap:10px 24px;margin:28px 0 0;padding:0;color:#555550;list-style:none;font-size:.93rem}.facts li::before{content:"✓";margin-right:8px;color:#151515;font-weight:800}
    .section{padding:68px 0;border-bottom:1px solid #ddddda}.section-heading{display:grid;grid-template-columns:minmax(180px,.6fr) minmax(0,1.4fr);gap:32px;align-items:start;margin-bottom:36px}h2{margin:0;font-size:clamp(1.65rem,3vw,2.35rem);letter-spacing:-.025em}.section-intro{max-width:700px;margin:0;color:#555550;font-size:1.08rem}.cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));border-top:1px solid #ddddda;border-left:1px solid #ddddda}.card{padding:28px;border-right:1px solid #ddddda;border-bottom:1px solid #ddddda;background:#fafaf8}.card h3{margin:0 0 10px;font-size:1.08rem}.card p{margin:0;color:#555550}
    .product-video{display:block;width:100%;height:auto;border:1px solid #ddddda;background:#0f2a44}
    .gallery{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:28px}.shot{margin:0;border:1px solid #ddddda;background:#fafaf8}.shot img{display:block;width:100%;height:auto;border-bottom:1px solid #ddddda}.shot figcaption{padding:18px}.shot strong{display:block;margin-bottom:5px}.shot span{color:#555550}.two-column{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:48px}.two-column h2{margin-bottom:18px}.two-column p{margin:0 0 16px;color:#4b4b47}
    .warning{border:2px solid #151515;padding:24px;background:#fafaf8}.warning h2{font-size:1.35rem}.warning ul{margin-bottom:0;padding-left:22px}.downloads{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;margin-top:30px}.download{border:1px solid #b8b8b3;padding:24px}.download h3{margin-top:0}.meta{color:#555550}.checksum{display:block;overflow-wrap:anywhere;padding:10px;background:#f0f0ed;font-size:.78rem}.stable{margin-top:32px;padding:22px;border-left:4px solid #777;background:#fafaf8}
    .site-footer{padding:36px 0 50px}.footer-inner{display:flex;justify-content:space-between;gap:24px;color:#555550;font-size:.9rem}.footer-links{display:flex;flex-wrap:wrap;gap:16px}@media(max-width:720px){.shell{width:min(100% - 28px,1120px)}.header-inner{align-items:flex-start;flex-direction:column;padding:16px 0}.hero{padding:54px 0}.section{padding:52px 0}.section-heading,.cards,.gallery,.two-column,.downloads{grid-template-columns:1fr}.section-heading{gap:16px}.footer-inner{flex-direction:column}}`;

function page(title, description, current, body) {
  const canonical = `${SITE}/${current === 'About' ? 'about/' : 'download/'}`;
  const nav = [['Browser app', '../'], ['About', '../about/'], ['Beta downloads', '../download/'], ['Architecture', '../architecture/']];
  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; media-src 'self'; script-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" />
<meta name="description" content="${esc(description)}" /><meta name="robots" content="index, follow" /><link rel="canonical" href="${canonical}" /><link rel="icon" href="../icon.svg" />
<meta property="og:type" content="website" /><meta property="og:site_name" content="LV Design Studio" /><meta property="og:title" content="${esc(title)}" /><meta property="og:description" content="${esc(description)}" /><meta property="og:url" content="${canonical}" /><meta property="og:image" content="${SITE}/icon-512.png" /><title>${esc(title)}</title><style>${STYLE}</style></head>
<body><header class="site-header"><div class="shell header-inner"><a class="brand" href="../"><img src="../icon.svg" alt="" width="36" height="36" /><span>LV Design Studio</span></a><nav class="nav" aria-label="Primary navigation">${nav.map(([label, href]) => `<a href="${href}"${label === current ? ' aria-current="page"' : ''}>${label}</a>`).join('')}<a href="${REPOSITORY}">Source code</a></nav></div></header>${body}<footer class="site-footer"><div class="shell footer-inner"><span>LV Design Studio</span><div class="footer-links"><a href="${REPOSITORY}/blob/main/LICENSE-MIT">MIT License</a><a href="${REPOSITORY}/blob/main/LICENSE-APACHE">Apache-2.0 License</a><a href="${REPOSITORY}/blob/main/docs/privacy.md">Privacy</a></div></div></footer></body></html>\n`;
}

export function renderAbout(product) {
  validateProduct(product);
  const facts = product.facts.map((fact) => `<li>${esc(fact)}</li>`).join('');
  const capabilities = product.capabilities.map((item) => `<article class="card"><h3>${esc(item.title)}</h3><p>${esc(item.description)}</p></article>`).join('');
  const screenshots = product.screenshots.map((shot) => `<figure class="shot"><img src="../screenshots/${esc(shot.file)}" alt="${esc(shot.title)}" loading="lazy" /><figcaption><strong>${esc(shot.title)}</strong><span>${esc(shot.description)}</span></figcaption></figure>`).join('');
  const body = `<main><section class="hero"><div class="shell"><p class="eyebrow">Open source · Offline first · Engineer controlled</p><h1>${esc(product.tagline)}</h1><p class="lede">${esc(product.summary)}</p><div class="actions"><a class="button button-primary" href="../download/">Download a beta</a><a class="button button-secondary" href="../">Open the browser app</a></div><ul class="facts">${facts}</ul></div></section>
<section class="section"><div class="shell"><div class="section-heading"><h2>LV design in 30 seconds</h2><p class="section-intro">See how the single-line diagram, load schedules, electrical studies and engineering deliverables come together in one offline-first workspace.</p></div><video class="product-video" controls preload="metadata" playsinline aria-label="30-second introduction to LV Design Studio"><source src="../media/${INTRO_VIDEO_NAME}" type="video/mp4" />Your browser does not support embedded video.</video></div></section>
<section class="section"><div class="shell"><div class="section-heading"><h2>One project model</h2><p class="section-intro">Design information is shared across calculations, drawings and deliverables, reducing repeated entry while keeping the engineer responsible for every decision.</p></div><div class="cards">${capabilities}</div></div></section>
<section class="section"><div class="shell"><div class="section-heading"><h2>See the workspace</h2><p class="section-intro">These are the committed screenshots used by the project README. Replacing a reviewed screenshot updates both presentations on the next deployment.</p></div><div class="gallery">${screenshots}</div></div></section>
<section class="section"><div class="shell two-column"><article><h2>Private by design</h2><p>The desktop application stores projects as local JSON files. The browser app keeps projects in that browser profile. No account, telemetry or hosted project database is required.</p><p>Back up project files regularly; clearing browser data removes browser-stored projects.</p></article><article><h2>Engineering responsibility</h2><p>${esc(product.engineeringStatus)}</p><a href="${REPOSITORY}/blob/main/docs/engineering/calculation-methods.md">Review calculation methods and limits</a></article></div></section></main>`;
  return page(`${product.name} — Offline low-voltage electrical design`, product.summary, 'About', body);
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
  return page('Download LV Design Studio Beta', 'Download unsigned LV Design Studio beta installers for Windows x64 and Apple-silicon macOS.', 'Beta downloads', body);
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
