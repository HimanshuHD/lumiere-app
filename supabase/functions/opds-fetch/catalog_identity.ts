export type CatalogDocumentFormat = 'epub' | 'pdf';

export function getCatalogSourceIdentity(
  bookId: string,
  downloadUrl: URL,
  format: CatalogDocumentFormat,
): string {
  const gutenbergBookId = bookId.match(/\/ebooks\/([0-9]+)(?:$|[?#])/i)?.[1] ||
    downloadUrl.pathname.match(/\/(?:ebooks|cache\/epub)\/([0-9]+)/i)?.[1];
  const editionPath = downloadUrl.pathname.toLowerCase();
  return gutenbergBookId
    ? `project-gutenberg:${gutenbergBookId}:${format}:${editionPath}`
    : `${downloadUrl.origin.toLowerCase()}${editionPath}:${format}`;
}
