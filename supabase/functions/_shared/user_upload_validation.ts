import {
  getCoverContentType,
  getDocumentContentType,
  validateCoverFile,
  validateDocumentFile,
} from "../../../src/services/documentValidation.ts";
import type { SupportedCoverFormat, SupportedDocumentFormat } from "../../../src/services/documentValidation.ts";

export type ValidatedUserUpload =
  | {
    kind: "document";
    format: SupportedDocumentFormat;
    contentType: string;
  }
  | {
    kind: "cover";
    format: SupportedCoverFormat;
    contentType: string;
  };

export async function validateUserUpload(
  userId: string,
  path: string,
  file: File,
): Promise<ValidatedUserUpload> {
  const [pathOwner, fileName, ...extraPathParts] = path.split("/");
  if (
    pathOwner !== userId
    || extraPathParts.length > 0
    || path.includes("\\")
    || fileName.includes("..")
  ) {
    throw new Error("The upload path must stay inside the signed-in user's storage folder.");
  }

  const coverMatch = fileName.match(
    /^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})-cover\.(jpg|jpeg|png|webp|gif)$/i,
  );
  const documentMatch = fileName.match(
    /^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(pdf|txt|epub)$/i,
  );
  if (!coverMatch && !documentMatch) {
    throw new Error("The upload path must use the expected operation ID and a supported file extension.");
  }

  if (coverMatch) {
    const format = await validateCoverFile(file);
    const pathExtension = coverMatch[2].toLowerCase();
    const expectedExtension = format === "jpeg" && pathExtension === "jpg" ? "jpg" : format;
    if (pathExtension !== expectedExtension) {
      throw new Error("The uploaded cover content does not match the storage path extension.");
    }
    return { kind: "cover", format, contentType: getCoverContentType(format) };
  }

  const format = await validateDocumentFile(file);
  if (format !== documentMatch?.[2].toLowerCase()) {
    throw new Error("The uploaded document content does not match the storage path extension.");
  }
  return { kind: "document", format, contentType: getDocumentContentType(format) };
}
