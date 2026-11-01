import { defineConfig } from 'vitest/config';

// Checks that need a real Chromium (npm run test:electron). Kept out of `npm test` — each one starts Electron, hidden.
// One file at a time, for the same reason as the PDF tests: on CI every Electron shares one virtual display.
export default defineConfig({ test: { include: ['tests/electron/**/*.electron.ts'], testTimeout: 180_000, hookTimeout: 180_000, root: '.', fileParallelism: false } });
