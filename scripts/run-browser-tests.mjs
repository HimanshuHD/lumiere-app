import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const suites = ['architecture', 'async-lifecycle', 'navigation', 'accessibility', 'page-transitions'];
for (const suite of suites) {
  const directory = resolve('test-results/browser', suite);
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
  const result = spawnSync(process.execPath, [`tests/browser/${suite}.mjs`], {
    stdio: 'inherit', env: { ...process.env, BROWSER_ARTIFACTS: directory }, timeout: 240_000,
  });
  if (result.error || result.status !== 0) {
    console.error(`Browser suite ${suite} failed; diagnostics: ${directory}`, result.error?.message || '');
    process.exitCode = 1;
    break;
  }
  rmSync(directory, { recursive: true, force: true });
}
