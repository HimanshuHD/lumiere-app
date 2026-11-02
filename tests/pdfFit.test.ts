import assert from 'node:assert/strict';
import { it } from 'node:test';
import { fitPdfPageWidth } from '../src/features/reader/pdf/pdf-fit.ts';

it('fits portrait, landscape and unusually wide pages using actual width', () => {
  assert.equal(fitPdfPageWidth(300, 600), 0.5);
  assert.equal(fitPdfPageWidth(300, 1200), 0.25);
  assert.equal(fitPdfPageWidth(200, 4000), 0.05);
  assert.equal(fitPdfPageWidth(1000, 500), 2);
});
it('recalculates for container and mixed-page size changes', () => {
  assert.equal(fitPdfPageWidth(600, 1200), 0.5);
  assert.equal(fitPdfPageWidth(300, 1200), 0.25);
  assert.equal(fitPdfPageWidth(300, 600), 0.5);
});
it('rejects unavailable or invalid dimensions', () => {
  for (const value of [0, -1, NaN, Infinity]) {
    assert.throws(() => fitPdfPageWidth(value, 600));
    assert.throws(() => fitPdfPageWidth(300, value));
  }
});
