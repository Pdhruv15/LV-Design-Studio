import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pkg from '../../package.json';

const siteUrl = 'https://pdhruv15.github.io/LV-Design-Suit/';
const index = readFileSync('index.html', 'utf8');
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
    expect(pkg.repository.url).toBe('git+https://github.com/Pdhruv15/LV-Design-Suit.git');
  });

  it('publishes a sitemap that robots.txt advertises', () => {
    expect(robots).toContain(`${siteUrl}sitemap.xml`);
    expect(sitemap).toContain(`<loc>${siteUrl}</loc>`);
    expect(sitemap).toContain(`<loc>${siteUrl}architecture/</loc>`);
  });
});
