import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pkg from '../../package.json';
// @ts-expect-error — plain ESM site generator without type declarations
import { readProduct, renderAbout, renderDownload } from '../../scripts/public-site.mjs';

const siteUrl = 'https://pdhruv15.github.io/LV-Design-Studio/';
const index = readFileSync('index.html', 'utf8');
const about = renderAbout(readProduct());
const download = renderDownload(readProduct());
const robots = readFileSync('public/robots.txt', 'utf8');
const sitemap = readFileSync('public/sitemap.xml', 'utf8');

describe('public site discovery metadata', () => {
  it('describes the product without claiming certification or authority approval', () => {
    expect(index).toContain('name="description"');
    expect(index).toContain('property="og:description"');
    expect(index).not.toMatch(/\b(certified|approved|compliant)\b/i);
    expect(index).not.toMatch(/\bDEWA\b/);
  });

  it('uses the published site as its canonical and social URL', () => {
    expect(index).toContain(`rel="canonical" href="${siteUrl}"`);
    expect(index).toContain(`property="og:url" content="${siteUrl}"`);
    expect(pkg.homepage).toBe(siteUrl);
    expect(pkg.repository.url).toBe('git+https://github.com/Pdhruv15/LV-Design-Studio.git');
  });

  it('publishes a sitemap that robots.txt advertises', () => {
    expect(robots).toContain(`${siteUrl}sitemap.xml`);
    expect(sitemap).toContain(`<loc>${siteUrl}</loc>`);
    expect(sitemap).toContain(`<loc>${siteUrl}about/</loc>`);
    expect(sitemap).toContain(`<loc>${siteUrl}download/</loc>`);
    expect(sitemap).toContain(`<loc>${siteUrl}architecture/</loc>`);
  });

  it('generates distinct, conservative product and download pages', () => {
    expect(about).toContain(`rel="canonical" href="${siteUrl}about/"`);
    expect(about.replace(/<\/?em>/g, '')).toContain('Low-voltage electrical design in one workspace.');
    const aboutMetadata = about.slice(0, about.indexOf('</head>'));
    expect(aboutMetadata).not.toMatch(/\b(certified|approved|compliant)\b/i);
    expect(aboutMetadata).not.toMatch(/\bDEWA\b/);
    expect(download).toContain(`rel="canonical" href="${siteUrl}download/"`);
    expect(download).toContain('Unsigned active-development build');
    expect(about).toContain("script-src 'none'");
    expect(download).toContain("script-src 'none'");
  });
});
