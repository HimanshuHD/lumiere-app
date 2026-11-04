export const viewPaths = {
  library: '/', bookmarks: '/bookmarks', 'reading-list': '/reading-list', upload: '/upload',
  profile: '/profile', 'my-uploads': '/my-uploads', 'all-documents': '/documents', 'admin-catalog': '/admin/catalog',
} as const;
export type View = keyof typeof viewPaths;
export type AppRoute = { kind: 'view'; view: View } | { kind: 'reader'; documentId: string }
  | { kind: 'callback' } | { kind: 'not-found' };
const documentIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isDocumentId(id: string) { return documentIdPattern.test(id); }
/** Path-only bases keep links and OAuth returns on the current origin. */
export function normalizeBase(base: string): string {
  if (!base.startsWith('/') || base.startsWith('//') || /[?#\\%]/.test(base) || base.split('/').some(p => p === '.' || p === '..')) {
    throw new Error('The application base must be an absolute path such as / or /lumiere/.');
  }
  return base === '/' ? '/' : base.replace(/\/+$/, '') + '/';
}
export function routePath(route: Exclude<AppRoute, {kind: 'not-found'}>, base = '/'): string {
  const root = normalizeBase(base);
  const path = route.kind === 'view' ? viewPaths[route.view] : route.kind === 'callback' ? '/auth/callback' : `/read/${route.documentId}`;
  if (route.kind === 'reader' && !isDocumentId(route.documentId)) throw new Error('Invalid document identity.');
  return root + path.slice(1);
}
export function parseRoute(pathname: string, base = '/'): AppRoute {
  const root = normalizeBase(base);
  if (!pathname.startsWith(root) && pathname !== root.slice(0, -1)) return {kind: 'not-found'};
  const path = '/' + pathname.slice(root.length).replace(/\/+$/, '');
  if (pathname === root.slice(0, -1) || path === '/') return {kind: 'view', view: 'library'};
  if (path === '/auth/callback') return {kind: 'callback'};
  for (const [view, value] of Object.entries(viewPaths)) if (path === value) return {kind: 'view', view: view as View};
  const match = /^\/read\/([^/]+)$/.exec(path);
  return match && isDocumentId(match[1]) ? {kind: 'reader', documentId: match[1]} : {kind: 'not-found'};
}
/** Return intent is limited to known internal screens, with no query, fragment or credentials. */
export function safeReturnPath(value: unknown, base = '/'): string | null {
  if (typeof value !== 'string' || /[?#\\]/.test(value) || !value.startsWith('/') || value.startsWith('//')) return null;
  const route = parseRoute(value, base);
  return route.kind === 'view' || route.kind === 'reader' ? routePath(route, base) : null;
}
