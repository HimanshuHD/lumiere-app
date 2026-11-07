import { useSyncExternalStore } from 'react';
import { normalizeBase, parseRoute, routePath, type AppRoute } from '@/domain/navigation';
import { beginPageTransition } from '@/shared/transitions';

export const appBase = normalizeBase(import.meta.env.BASE_URL);
const changed = 'lumiere:navigation';
function subscribe(listener: () => void) {
  window.addEventListener('popstate', listener); window.addEventListener(changed, listener);
  return () => { window.removeEventListener('popstate', listener); window.removeEventListener(changed, listener); };
}
const snapshot = () => window.location.pathname;
export function useAppRoute() {
  const pathname = useSyncExternalStore(subscribe, snapshot);
  return parseRoute(pathname, appBase);
}
export function navigate(route: Exclude<AppRoute, {kind: 'not-found'}>, options: {replace?: boolean; transition?: boolean} = {}) {
  const path = routePath(route, appBase);
  if (window.location.pathname !== path || window.location.search || window.location.hash) {
    if (options.transition !== false) beginPageTransition();
    window.history[options.replace ? 'replaceState' : 'pushState'](null, '', path);
    window.dispatchEvent(new Event(changed));
  }
}
