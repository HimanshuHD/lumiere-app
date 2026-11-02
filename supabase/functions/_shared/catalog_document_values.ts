export function getCatalogDocumentWriteValues<T extends Record<string, unknown>>(
  operationId: string,
  values: T,
): { insert: T & { id: string }; update: T } {
  return {
    insert: { id: operationId, ...values },
    update: values,
  };
}
