// Synthetic Pages routing contract fixture. No application data or Supabase integration.
export const BASE = '/lumiere-app/';
const ID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const views = new Set(['/', '/bookmarks', '/reading-list', '/upload', '/profile', '/my-uploads', '/documents', '/admin/catalog']);
const KEY = 'lumiere:pages-proof:return:v1';
const AGE = 600000;
export const fixtureId = '12345678-1234-1234-1234-123456789abc';

export function safeRoute(input) {
  if (typeof input !== 'string' || !input.startsWith('/') || input.startsWith('//') || /[?#\\%]/.test(input)) return null;
  if (views.has(input)) return input;
  const match = /^\/read\/([^/]+)$/.exec(input);
  return match && ID.test(match[1]) ? input : null;
}
export function rememberReturn(storage, path, state, now = Date.now()) {
  const valid = safeRoute(path);
  if (!valid || !state) return false;
  try { storage.setItem(KEY, JSON.stringify({path: valid, state, at: now})); return true; } catch { return false; }
}
export function consumeReturn(storage, state, now = Date.now()) {
  try {
    const raw = storage.getItem(KEY);
    storage.removeItem(KEY);
    if (!raw) return null;
    const record = JSON.parse(raw);
    return state && record.state === state && typeof record.at === 'number' && record.at <= now && now - record.at <= AGE ? safeRoute(record.path) : null;
  } catch { return null; }
}
export function tabStorage() {
  try { return window.sessionStorage; } catch { return null; }
}
export function decodeHash(hash) {
  if (!hash || hash === '#') return '/';
  if (!hash.startsWith('#/')) return null;
  return safeRoute(hash.slice(1));
}
export function routeHash(route) { return '#' + (safeRoute(route) || '/'); }

if (typeof document !== 'undefined' && document.querySelector('[data-pages-proof-app]')) {
  const output = document.getElementById('route');
  const historyOutput = document.getElementById('history');
  const render = () => {
    const route = decodeHash(window.location.hash);
    output.textContent = route === null ? 'Unknown or invalid route — no document data loaded' : 'Current route: ' + route;
    historyOutput.textContent = window.location.href;
  };
  window.addEventListener('hashchange', render);
  window.addEventListener('popstate', render);
  document.querySelectorAll('[data-route]').forEach(link => {
    link.setAttribute('href', routeHash(link.getAttribute('data-route')));
  });
  document.getElementById('start-oauth').addEventListener('click', () => {
    const path = decodeHash(window.location.hash);
    const status = document.getElementById('oauth-state');
    const state = crypto.randomUUID();
    if (!path || !rememberReturn(tabStorage(), path, state)) { status.textContent = 'Return storage unavailable or route rejected'; return; }
    window.location.href = './auth/callback/?result=success&state=' + encodeURIComponent(state);
  });
  document.getElementById('start-oauth-error').addEventListener('click', () => {
    try { window.sessionStorage.removeItem(KEY); } catch { /* unavailable */ }
    window.location.href = './auth/callback/?error=access_denied';
  });
  render();
}
