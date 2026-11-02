export type CatalogImportRecoveryStatus = "cleanup_pending" | "reconciliation_pending";

export function shouldDeferCatalogImportCleanup(
  status: CatalogImportRecoveryStatus,
  attempts: number,
): boolean {
  return status === "reconciliation_pending" && attempts === 0;
}

export interface CatalogImportRecoveryDependencies<T> {
  findCanonical(): Promise<T | null>;
  getFileStoragePath(document: T): string | null;
  removeUploadedFile(): Promise<void>;
  recordRecovery(status: CatalogImportRecoveryStatus, error: string): Promise<void>;
}

export type CatalogImportRecoveryResult<T> =
  | { kind: "reused"; document: T }
  | { kind: "cleaned" }
  | { kind: "pending"; error: string };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function reconcileCatalogImportFailure<T>(
  uploadedPath: string,
  dependencies: CatalogImportRecoveryDependencies<T>,
): Promise<CatalogImportRecoveryResult<T>> {
  let canonical: T | null;
  try {
    canonical = await dependencies.findCanonical();
  } catch (error) {
    const message = errorMessage(error);
    try {
      await dependencies.recordRecovery(
        "reconciliation_pending",
        `Could not determine whether the uploaded file was saved: ${message}`,
      );
    } catch (recoveryError) {
      return {
        kind: "pending",
        error: `Could not determine whether the uploaded file was saved: ${message}. Recovery tracking also failed: ${errorMessage(recoveryError)}`,
      };
    }
    return {
      kind: "pending",
      error: `Could not determine whether the uploaded file was saved: ${message}. The file was retained for safe reconciliation.`,
    };
  }

  if (canonical && dependencies.getFileStoragePath(canonical) === uploadedPath) {
    return { kind: "reused", document: canonical };
  }

  try {
    await dependencies.removeUploadedFile();
  } catch (error) {
    const message = errorMessage(error);
    try {
      await dependencies.recordRecovery("cleanup_pending", message);
    } catch (recoveryError) {
      return {
        kind: "pending",
        error: `Uploaded file cleanup failed: ${message}. Recovery tracking also failed: ${errorMessage(recoveryError)}`,
      };
    }
    return {
      kind: "pending",
      error: `Uploaded file cleanup failed: ${message}. The file was queued for retry.`,
    };
  }

  return canonical ? { kind: "reused", document: canonical } : { kind: "cleaned" };
}
