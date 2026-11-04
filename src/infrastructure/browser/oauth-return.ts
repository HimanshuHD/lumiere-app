import { normalizeBase, safeReturnPath } from '../../domain/navigation.ts';
type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const key = (base: string) => 'lumiere:oauth-return:' + normalizeBase(base);
const maxAge = 10 * 60 * 1000;
export function rememberOAuthReturn(storage: StoragePort, pathname: string, base: string, now = Date.now()) {
  const path = safeReturnPath(pathname, base);
  if (!path) throw new Error('Please start sign-in from an application page.');
  storage.setItem(key(base), JSON.stringify({path, createdAt: now}));
}
export function clearOAuthReturn(storage: StoragePort, base: string) {
  try { storage.removeItem(key(base)); } catch { /* Storage may be unavailable. */ }
}
export function consumeOAuthReturn(storage: StoragePort, base: string, now = Date.now()): string | null {
  try {
    const value = storage.getItem(key(base)); storage.removeItem(key(base));
    if (!value) return null;
    const record = JSON.parse(value);
    if (!record || typeof record.createdAt !== 'number' || now < record.createdAt || now - record.createdAt > maxAge) return null;
    return safeReturnPath(record.path, base);
  } catch { return null; }
}
