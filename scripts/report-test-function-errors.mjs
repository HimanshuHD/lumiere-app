import { readFileSync, existsSync } from 'node:fs';
const path = '/tmp/lumiere-test-functions.log';
if (existsSync(path)) {
  const lines = readFileSync(path, 'utf8').split('\n').filter(line => /error|not found|failed|boot/i.test(line));
  const sanitized = lines.slice(-30).join('\n').replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[JWT redacted]').replace(/sb_(?:secret|publishable)_[\w-]+/g, '[key redacted]');
  console.error(sanitized || 'No function error lines captured.');
}
