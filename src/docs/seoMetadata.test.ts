import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pkg from '../../package.json';

const siteUrl = 'https://pdhruv15.github.io/LV-Design-Suit/';
const index = readFileSync('index.html', 'utf8');
const about = readFileSync('public/about/index.html', 'utf8');
const robots = readFileSync('public/robots.txt', 'utf8');
const sitemap = readFileSync('public/sitemap.xml', 'utf8');
const viteConfig = readFileSync('vite.config.ts', 'utf8');

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
    expect(pkg.repository.url).toBe('git+https://github.com/Pdhruv15/LV-Design-Suit.git');
  });

  it('publishes a sitemap that robots.txt advertises', () => {
    expect(robots).toContain(`${siteUrl}sitemap.xml`);
    expect(sitemap).toContain(`<loc>${siteUrl}</loc>`);
    expect(sitemap).toContain(`<loc>${siteUrl}about/</loc>`);
    expect(sitemap).toContain(`<loc>${siteUrl}architecture/</loc>`);
  });

  it('provides a distinct, conservative project page that is available offline', () => {
    expect(about).toContain(`rel="canonical" href="${siteUrl}about/"`);
    expect(about).toContain('Low-voltage electrical design in one workspace.');
    expect(about).not.toMatch(/\b(certified|approved|compliant)\b/i);
    expect(about).not.toMatch(/\bDEWA\b/);
    expect(viteConfig).toContain("'about/index.html'");
    expect(viteConfig).toContain("path.endsWith('/about/')");
  });
});
