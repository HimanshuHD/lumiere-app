import { fraction } from './position.ts';
/** Window scroll coordinates, with the sticky application/reader toolbar excluded. */
export function textScrollRange(contentTop: number, contentHeight: number, viewportHeight: number, documentHeight: number, toolbarHeight: number) {
  const maximum = Math.max(0, documentHeight - viewportHeight);
  const start = Math.min(maximum, Math.max(0, contentTop - toolbarHeight));
  const end = Math.min(maximum, Math.max(start, contentTop + contentHeight - viewportHeight));
  return { start, length: end - start };
}
export function textScrollProgress(scrollY: number, range: {start: number; length: number}) {
  return range.length > 0 ? fraction((scrollY - range.start) / range.length) : 0;
}
