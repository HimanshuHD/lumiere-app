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
  if (record.name === 'StorageUnknownError' && record.originalError && record.originalError !== error) return toServiceError(record.originalError);
  const statuses = [record.status, record.statusCode].map(Number);
  if (record.name === 'AbortError') return new ServiceError('cancelled', 'The operation was cancelled.', error);
  if (record.code === '42501' || statuses.includes(401) || statuses.includes(403) || record.code === 'PGRST301') return new ServiceError('permission', message, error);
  if ((record.name === 'TypeError' && /failed to fetch|fetch failed|network|load failed/i.test(message)) || record.name === 'AuthRetryableFetchError' || statuses.some(status => status >= 500 || status === 408 || status === 429)) return new ServiceError('network', message, error);
  return new ServiceError('unexpected', message, error);
}

/** UI-facing commands settle as data, including SDK/network exceptions. */
export async function attempt<T>(operation: () => Promise<T>): Promise<ServiceResult<T>> {
  try { return { ok: true, value: await operation() }; }
  catch (error) { return { ok: false, error: toServiceError(error) }; }
}
/** Controllers may lift a result into their existing single error/presentation path. */
export function requireValue<T>(result: ServiceResult<T>): T {
  if (!result.ok) throw result.error;
  return result.value;
}
