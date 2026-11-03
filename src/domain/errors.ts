export type ErrorCategory = 'cancelled' | 'validation' | 'permission' | 'network' | 'unexpected';
export class ServiceError extends Error {
  readonly category: ErrorCategory;
  readonly originalCause?: unknown;
  constructor(category: ErrorCategory, message: string, originalCause?: unknown) {
    super(message); this.name = 'ServiceError'; this.category = category; this.originalCause = originalCause;
  }
}
export type ServiceResult<T> = { ok: true; value: T } | { ok: false; error: ServiceError };
export function toServiceError(error: unknown): ServiceError {
  if (error instanceof ServiceError) return error;
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const message = typeof record.message === 'string' ? record.message : 'The operation failed. Please retry.';
  if (record.name === 'AbortError') return new ServiceError('cancelled', 'The operation was cancelled.', error);
  if (record.code === '42501' || record.status === 401 || record.status === 403 || record.code === 'PGRST301') return new ServiceError('permission', message, error);
  if ((record.name === 'TypeError' && /failed to fetch|fetch failed|network/i.test(message)) || (typeof record.status === 'number' && record.status >= 500)) return new ServiceError('network', message, error);
  return new ServiceError('unexpected', message, error);
}
