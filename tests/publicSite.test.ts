import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain ESM site generator without type declarations
import { buildSite, checkReadme, readProduct, renderAbout, renderDownload } from '../scripts/public-site.mjs';
// @ts-expect-error — plain ESM release helper without type declarations
import { assetNames } from '../scripts/beta-release.mjs';

const root = resolve(__dirname, '..');
const version = '2.144.0-beta.77';
const names = assetNames(version);
const beta = {
  version,
  tag: `v${version}`,
  publishedAt: '2026-11-14T08:30:00.000Z',
  sourceCommit: 'a'.repeat(40),
  windows: { name: names.windows, sha256: 'b'.repeat(64) },
  macos: { name: names.macos, sha256: 'c'.repeat(64) }
};

describe('public website source', () => {
  it('keeps the generated README section synchronized with the reviewed public content', () => {
    expect(() => checkReadme()).not.toThrow();
  });

  it('reuses every committed README screenshot without a duplicate source copy', () => {
    const product = readProduct();
    const readme = readFileSync(join(root, 'README.md'), 'utf8');
    const committed = readdirSync(join(root, 'docs/screenshots')).filter((file) => file.endsWith('.png')).sort();
    expect(product.screenshots.map((shot: { file: string }) => shot.file).sort()).toEqual(committed);
    for (const shot of product.screenshots) expect(readme).toContain(`](docs/screenshots/${shot.file})`);
    expect(existsSync(join(root, 'public/screenshots'))).toBe(false);
  });

  it('escapes reviewed text and ships no executable page script', () => {
    const product = readProduct();
    const html = renderAbout({ ...product, tagline: '<script>alert(1)</script>' });
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain("script-src 'none'");
    expect(html).toContain("media-src 'self'");
    expect(html).toContain('<video class="product-video" controls preload="metadata" playsinline');
    expect(html).toContain('../media/lv-design-studio-product-intro-30s.mp4');
    expect(html).not.toMatch(/<script\b|https:\/\/[^"']+\.js/i);
  });

  it('adds Get involved with link addresses fixed by the generator, not taken from content text', () => {
    const product = readProduct();
    const html = renderAbout(product);
    expect(html).toContain('<h2>Get involved</h2>');
    expect(html).toContain(`<a class="card-link" href="${product.getInvolved.linkedin}">Follow on LinkedIn</a>`);
    expect(html).toContain('href="https://github.com/Pdhruv15/LV-Design-Studio/issues/new">Open an issue<svg');
    expect(html).toContain('href="https://github.com/Pdhruv15/LV-Design-Studio">View the source<svg');
    const withLinkedin = (linkedin: unknown) => ({ ...product, getInvolved: { ...product.getInvolved, linkedin } });
    for (const bad of ['https://example.test/in/someone/', 'http://www.linkedin.com/in/someone/', 'https://www.linkedin.com/in/someone/?x=1', 'https://www.linkedin.com/in/a"onclick="x/', 'javascript:alert(1)', undefined]) {
      expect(() => renderAbout(withLinkedin(bad))).toThrow('getInvolved linkedin is invalid');
    }
    const item = { ...product.getInvolved.items[0], target: 'https://example.test/' };
    expect(() => renderAbout({ ...product, getInvolved: { ...product.getInvolved, items: [item] } })).toThrow('getInvolved item 0 is invalid');
    const escaped = renderAbout({ ...product, getInvolved: { ...product.getInvolved, items: [{ ...product.getInvolved.items[0], title: '<b>x</b>' }] } });
    expect(escaped).toContain('<h3>&lt;b&gt;x&lt;/b&gt;</h3>');
  });

  it('uses the Graphite colours of the app, dark by default and light by the visitor setting, on both pages', () => {
    const tokens = readFileSync(join(root, 'src/theme/tokens.css'), 'utf8');
    const dark = tokens.slice(tokens.indexOf(':root {'), tokens.indexOf(':root[data-theme="light"]'));
    const light = tokens.slice(tokens.indexOf(':root[data-theme="light"]'), tokens.indexOf(':root[data-palette="blueprint"]'));
    const token = (block: string, name: string) => new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(block)?.[1];
    for (const html of [renderAbout(readProduct()), renderDownload(readProduct(), beta)]) {
      const style = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
      const split = style.indexOf('@media(prefers-color-scheme:light)');
      expect(split).toBeGreaterThan(0);
      const lightStyle = style.slice(split, style.indexOf('}}', split));
      for (const name of ['bg', 'panel', 'line', 'tx', 'mut', 'acc', 'on-acc']) {
        expect(style.slice(0, split)).toContain(`--${name}:${token(dark, name)}`);
        expect(lightStyle).toContain(`--${name}:${token(light, name)}`);
      }
      expect(html).toContain(`<a class="out" href="${readProduct().getInvolved.linkedin}">Follow on LinkedIn</a>`);
    }
  });

  it('leads with the first screenshot and shows the others in the gallery', () => {
    const product = readProduct();
    const html = renderAbout(product);
    const [lead, second] = product.screenshots;
    expect(html).toContain(`<img class="frame" src="../screenshots/${lead.file}"`);
    expect(html).toContain(`<img class="frame small" src="../screenshots/${second.file}"`);
    expect(html.match(/<figure class="shot">/g)).toHaveLength(product.screenshots.length - 1);
  });

  it('constructs installer links from fixed repository paths, not release-provided URLs or text', () => {
    const html = renderDownload(readProduct(), { ...beta, releaseNotes: '<img src=x onerror=alert(1)>', arbitraryUrl: 'https://example.test/evil.exe' });
    expect(html).toContain(`https://github.com/Pdhruv15/LV-Design-Studio/releases/download/v${version}/${names.windows}`);
    expect(html).toContain(`https://github.com/Pdhruv15/LV-Design-Studio/releases/download/v${version}/${names.macos}`);
    expect(html).not.toContain('example.test');
    expect(html).not.toContain('onerror');
    expect(html).toContain('Do not use the beta for production issue work.');
  });

  it('builds static pages, copied screenshots and the strict updater manifest', () => {
    const work = mkdtempSync(join(tmpdir(), 'lvds-public-site-'));
    try {
      const releaseFile = join(work, 'release.json');
      const sumsFile = join(work, 'SHA256SUMS.txt');
      const out = join(work, 'site');
      writeFileSync(releaseFile, JSON.stringify({
        tagName: beta.tag,
        isPrerelease: true,
        publishedAt: beta.publishedAt,
        targetCommitish: beta.sourceCommit,
        assets: [names.windows, names.macos, names.checksums].map((name: string) => ({ name }))
      }));
      writeFileSync(sumsFile, `${beta.windows.sha256}  ${names.windows}\n${beta.macos.sha256}  ${names.macos}\n`);
      buildSite({ outDir: out, releaseFile, checksumsFile: sumsFile });
      expect(existsSync(join(out, 'about/index.html'))).toBe(true);
      expect(existsSync(join(out, 'download/index.html'))).toBe(true);
      expect(existsSync(join(out, 'media', 'lv-design-studio-product-intro-30s.mp4'))).toBe(true);
      for (const shot of readProduct().screenshots) expect(existsSync(join(out, 'screenshots', shot.file))).toBe(true);
      expect(JSON.parse(readFileSync(join(out, 'download/beta.json'), 'utf8'))).toEqual({
        schemaVersion: 1,
        channel: 'beta',
        version,
        publishedAt: beta.publishedAt,
        sourceCommit: beta.sourceCommit
      });
    } finally { rmSync(work, { recursive: true, force: true }); }
  });
});
