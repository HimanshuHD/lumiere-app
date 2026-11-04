import { existsSync } from 'node:fs';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  console.error('Browser tests require development dependencies. Run npm ci --include=dev from the repository root, then npm run setup:browser.');
  process.exit(1);
}
const executable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || chromium.executablePath();
if (!existsSync(executable)) {
  console.error(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? 'PLAYWRIGHT_CHROMIUM_EXECUTABLE does not point to an existing browser. Correct it or unset it and run npm run setup:browser.'
    : 'Chromium is missing. Run npm run setup:browser, then npm run test:browser.');
  process.exit(1);
}
