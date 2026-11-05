import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// A separate project/config prevents test resets from targeting the developer's stack.
const root = resolve(import.meta.dirname, '..');
const target = resolve(root, '.test-stack');
mkdirSync(resolve(target, 'supabase'), { recursive: true });
let config = readFileSync(resolve(root, 'supabase/config.toml'), 'utf8');
config = config.replace(/^project_id = .*/m, 'project_id = "lumiere-quality-test"');
config = config.replace(/\[auth.external.google\][\s\S]*?(?=\n\[)/, '[auth.external.google]\nenabled = false\nclient_id = ""\nsecret = ""\n');
// Synthetic credentials only; production OAuth is not part of the routine suite.
writeFileSync(resolve(target, 'supabase/config.toml'), config);
for (const directory of ['migrations', 'functions']) {
  cpSync(resolve(root, 'supabase', directory), resolve(target, 'supabase', directory), { recursive: true });
}
cpSync(resolve(root, 'src'), resolve(target, 'src'), { recursive: true });
cpSync(resolve(root, 'supabase/tests'), resolve(target, 'supabase/tests'), { recursive: true });
console.log('Prepared disposable lumiere-quality-test stack in .test-stack. No developer config changed.');
