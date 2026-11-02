import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// Local-only command: never infers a hosted connection or uses application keys.
const config = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8');
const projectId = config.match(/^project_id\s*=\s*"([a-zA-Z0-9_-]+)"/m)?.[1];
if (!projectId) throw new Error('Cannot determine the local Supabase project_id.');
const result = spawnSync('docker', [
  'exec', '-i', `supabase_db_${projectId}`, 'psql',
  '--username', 'postgres', '--dbname', 'postgres', '--set', 'ON_ERROR_STOP=1',
], { input: readFileSync(new URL('../supabase/seeds/demo.sql', import.meta.url)), stdio: ['pipe', 'inherit', 'inherit'] });
if (result.error || result.status !== 0) {
  console.error('Demo seeding failed. Start Docker and local Supabase, apply pending migrations, then retry.');
  if (result.error) console.error(result.error.message);
  process.exitCode = 1;
} else {
  console.log('Eight demo stories are available. Existing content and personal references were preserved.');
}
