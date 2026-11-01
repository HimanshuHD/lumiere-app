export function getSignedUrlRefreshDelay(refreshAt: number, now = Date.now()): number {
  return Math.max(0, refreshAt - now);
}
