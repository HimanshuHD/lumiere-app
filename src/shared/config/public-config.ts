export interface PublicConfig { supabaseUrl: string; supabaseAnonKey: string; turnstileSiteKey: string }
/** Only public browser configuration belongs here. Never accept a privileged key. */
export function parsePublicConfig(input: Record<string, unknown>): PublicConfig {
  const supabaseUrl = typeof input.VITE_SUPABASE_URL === 'string' ? input.VITE_SUPABASE_URL.trim() : '';
  const supabaseAnonKey = typeof input.VITE_SUPABASE_ANON_KEY === 'string' ? input.VITE_SUPABASE_ANON_KEY.trim() : '';
  if (!supabaseUrl || !supabaseAnonKey) throw new Error('Missing Supabase environment variables. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local, then restart the dev server.');
  let url: URL; try { url = new URL(supabaseUrl); } catch { throw new Error('VITE_SUPABASE_URL must be an HTTP(S) URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('VITE_SUPABASE_URL must be an HTTP(S) URL without credentials.');
  let role: unknown;
  try { role = JSON.parse(atob(supabaseAnonKey.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role; } catch { /* Modern publishable keys are not JWTs. */ }
  if (supabaseAnonKey.startsWith('sb_secret_') || role === 'service_role') throw new Error('Privileged Supabase keys must not be used in browser configuration.');
  return { supabaseUrl, supabaseAnonKey, turnstileSiteKey: typeof input.VITE_TURNSTILE_SITE_KEY === 'string' ? input.VITE_TURNSTILE_SITE_KEY.trim() : '' };
}
