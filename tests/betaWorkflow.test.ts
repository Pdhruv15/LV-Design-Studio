import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const beta = readFileSync('.github/workflows/beta-release.yml', 'utf8');
const pages = readFileSync('.github/workflows/pages.yml', 'utf8');

describe('beta release workflow trust boundary', () => {
  it('requires an explicitly confirmed main dispatch whose exact source passed push CI', () => {
    expect(beta).toContain('workflow_dispatch:');
    expect(beta).toContain('confirm_release:');
    expect(beta).toContain('type: boolean');
    expect(beta).toContain('default: false');
    expect(beta).toContain("github.ref == 'refs/heads/main' && inputs.confirm_release == true");
    expect(beta).toContain('gh run list');
    expect(beta).toContain('--commit "$SOURCE_SHA"');
    expect(beta).toContain('--event push');
    expect(beta).not.toContain('workflow_run:');
    expect(beta).not.toContain('pull_request_target');
  });

  it('skips native builds when a valid beta already targets the source commit', () => {
    expect(beta).toContain('gh api "repos/$GITHUB_REPOSITORY/releases?per_page=100"');
    expect(beta).toContain('node scripts/beta-release.mjs published');
    expect(beta).toContain('should_release: ${{ steps.release.outputs.should_release }}');
    expect(beta.match(/if: needs\.prepare\.outputs\.should_release == 'true'/g)).toHaveLength(3);
  });

  it('checks out the exact tested commit and limits write permission to publishing', () => {
    expect(beta.match(/ref: \$\{\{ needs\.prepare\.outputs\.source_sha \}\}/g)).toHaveLength(3);
    expect(beta).toMatch(/permissions:\n {2}actions: read\n {2}contents: read/);
    expect(beta).toMatch(/publish:[\s\S]*?permissions:\n {6}actions: read\n {6}contents: write/);
    expect(beta.match(/persist-credentials: false/g)?.length).toBeGreaterThanOrEqual(4);
    expect(beta).not.toMatch(/secrets\.|contents: write[\s\S]*?windows:/);
  });

  it('uses native target runners, validates unpacked apps and uploads only installers', () => {
    expect(beta).toContain('runs-on: windows-latest');
    expect(beta).toContain('runs-on: macos-15');
    expect(beta).toContain('node scripts/check-package.mjs release/win-unpacked');
    expect(beta).toContain('node scripts/check-package.mjs "release/mac-arm64/LV Design Studio.app"');
    // The packaged lvds command and MCP server are run, not only listed.
    expect(beta).toContain('node scripts/check-packaged-lvds.mjs release/win-unpacked');
    expect(beta).toContain('node scripts/check-packaged-lvds.mjs "release/mac-arm64/LV Design Studio.app"');
    expect(beta).toContain('--config.mac.identity=null');
    expect(beta).toContain("CSC_IDENTITY_AUTO_DISCOVERY: 'false'");
    expect(beta).toContain("Get-AuthenticodeSignature $installer");
    expect(beta).toContain('codesign --verify --deep --strict');
    expect(beta.match(/npm version .*--ignore-scripts/g)).toHaveLength(2);
    expect(beta).not.toMatch(/path: release\/?\s*$/m);
  });

  it('uses only official GitHub actions and the GitHub CLI for release publication', () => {
    const actions = [...beta.matchAll(/^\s*- uses:\s*(\S+)/gm)].map((match) => match[1]);
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.every((action) => action.startsWith('actions/'))).toBe(true);
    expect(beta).toContain('gh release create');
    expect(beta).not.toMatch(/softprops|release-action|curl .*upload/i);
  });
});

describe('Pages beta synchronization', () => {
  it('rebuilds after beta publication and resolves beta metadata at build time', () => {
    expect(pages).toContain('workflows: [Beta release]');
    expect(pages).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(pages).toContain('github.event.workflow_run.head_repository.full_name == github.repository');
    expect(pages).toContain('node scripts/beta-release.mjs select');
    expect(pages).toContain('node scripts/public-site.mjs build');
    expect(pages).toContain('gh release download');
    expect(pages).toContain('cancel-in-progress: false');
  });

  it('keeps release access read-only and Pages deployment narrowly permissioned', () => {
    expect(pages).toMatch(/permissions:\n {2}contents: read\n {2}pages: write\n {2}id-token: write/);
    expect(pages).toContain('persist-credentials: false');
    expect(pages).not.toMatch(/secrets\.|contents: write/);
  });

  it('deploys in a job after the upload and looks for the artifact again instead of failing at once', () => {
    // GitHub can list a just-uploaded artifact seconds late ("No artifacts named github-pages").
    expect(pages).toMatch(/\n {2}build:\n/);
    expect(pages).toMatch(/\n {2}deploy:\n {4}needs: build\n/);
    const at = pages.indexOf('\n  deploy:');
    const deployJob = pages.slice(at);
    expect(deployJob).not.toContain('upload-pages-artifact');
    expect(deployJob.match(/uses: actions\/deploy-pages@v4/g)).toHaveLength(3);
    expect(deployJob.match(/continue-on-error: true/g)).toHaveLength(2);
    expect(deployJob).toContain("if: steps.deployment.outcome == 'failure' && steps.retry.outcome == 'failure'");
    expect(pages.slice(0, at)).not.toContain('deploy-pages');
  });
});
