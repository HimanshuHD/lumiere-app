import { useSyncExternalStore } from 'react';
import { normalizeBase, parseBrowserRoute, browserRoutePath, type AppRoute } from '@/domain/navigation';

export const appBase = normalizeBase(import.meta.env.BASE_URL);
const hashRoutes = import.meta.env.MODE === 'pages';
const changed = 'lumiere:navigation';
function subscribe(listener: () => void) {
  window.addEventListener('hashchange', listener);
  window.addEventListener('popstate', listener); window.addEventListener(changed, listener);
  return () => { window.removeEventListener('hashchange', listener); window.removeEventListener('popstate', listener); window.removeEventListener(changed, listener); };
}
const snapshot = () => window.location.pathname + window.location.hash;
export function useAppRoute() {
  useSyncExternalStore(subscribe, snapshot);
  return parseBrowserRoute(window.location.pathname, window.location.hash, appBase, hashRoutes);
}
export function navigate(route: Exclude<AppRoute, {kind: 'not-found'}>, options: {replace?: boolean} = {}) {
  const path = browserRoutePath(route, appBase, hashRoutes);
  if (snapshot() !== path || window.location.search) {
    window.history[options.replace ? 'replaceState' : 'pushState'](null, '', path);
    window.dispatchEvent(new Event(changed));
  }
}
