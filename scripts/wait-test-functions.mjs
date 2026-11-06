import { spawnSync } from 'node:child_process';
const status = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['supabase', 'status', '--workdir', '.test-stack', '-o', 'json'], { encoding: 'utf8', shell: process.platform === 'win32' });
if (status.status !== 0) throw new Error('Start the disposable test stack first.');
const config = JSON.parse(status.stdout);
if (config.API_URL !== 'http://127.0.0.1:55321') throw new Error('Unexpected test backend.');
const deadline = Date.now() + 90_000;
while (true) {
  const response = await fetch('http://127.0.0.1:55321/functions/v1/finalize-user-document-upload', { method: 'POST', headers: { Authorization: `Bearer ${config.ANON_KEY}`, apikey: config.ANON_KEY }, signal: AbortSignal.timeout(3000) }).catch(() => null);
  const body = await response?.json().catch(() => null);
  // A generic gateway 401 does not prove the function worker booted successfully.
  if (response?.status === 401 && body?.error === 'Your sign-in session is invalid or expired.') break;
  if (Date.now() > deadline) throw new Error('Local upload function did not become ready. Check the local function runtime.');
  await new Promise(resolve => setTimeout(resolve, 500));
}
console.log('Local upload function is ready.');
