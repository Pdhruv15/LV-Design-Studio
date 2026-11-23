// Writes docs/samples/start-levels/*.lvds again from src/model/startSamples.ts.
// Run: npm run samples:start-levels   (it runs the sample test with WRITE_START_SAMPLES=1; same on macOS, Linux and Windows)
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const vitest = join(root, 'node_modules', 'vitest', 'vitest.mjs');
const r = spawnSync(process.execPath, [vitest, 'run', 'src/model/startSamples.test.ts', '--reporter=dot'], { cwd: root, stdio: 'inherit', env: { ...process.env, WRITE_START_SAMPLES: '1' } });
process.exit(r.status ?? 1);
