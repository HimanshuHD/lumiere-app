/** CSS pixels determine fit; device pixel ratio only affects bitmap sharpness. */
export function fitPdfPageWidth(availableWidth: number, pageWidth: number): number {
  if (!Number.isFinite(availableWidth) || availableWidth <= 0
    || !Number.isFinite(pageWidth) || pageWidth <= 0) {
    throw new Error('The PDF page or viewer width is unavailable.');
  }
  return availableWidth / pageWidth;
}
