import { ServiceError } from '../domain/errors.ts';
export const MAX_DOCUMENT_SIZE_BYTES = 50 * 1024 * 1024;
export const MAX_COVER_SIZE_BYTES = 5 * 1024 * 1024;

export type SupportedDocumentFormat = 'pdf' | 'txt' | 'epub';
export type SupportedCoverFormat = 'jpeg' | 'png' | 'webp' | 'gif';

const DOCUMENT_CONTENT_TYPES: Record<SupportedDocumentFormat, string> = {
  pdf: 'application/pdf',
  txt: 'text/plain',
  epub: 'application/epub+zip',
};

const COVER_CONTENT_TYPES: Record<SupportedCoverFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

export class DocumentValidationError extends ServiceError {
  constructor(message: string) {
    super('validation', message);
    this.name = 'DocumentValidationError';
  }
}

function hasPdfSignature(bytes: Uint8Array): boolean {
  const header = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 1024)));
  return /%PDF-[12]\.\d/.test(header);
}

function hasEpubSignature(bytes: Uint8Array): boolean {
  if (
    bytes.length < 58 ||
    bytes[0] !== 0x50 ||
    bytes[1] !== 0x4b ||
    bytes[2] !== 0x03 ||
    bytes[3] !== 0x04
  ) return false;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const mimetypeLength = 'application/epub+zip'.length;
  const fileNameLength = view.getUint16(26, true);
  const extraFieldLength = view.getUint16(28, true);
  const contentStart = 30 + fileNameLength + extraFieldLength;
  if (
    view.getUint16(8, true) !== 0 ||
    view.getUint32(18, true) !== mimetypeLength ||
    view.getUint32(22, true) !== mimetypeLength ||
    fileNameLength !== 8 ||
    extraFieldLength !== 0 ||
    contentStart + mimetypeLength > bytes.length
  ) return false;

  const fileName = new TextDecoder().decode(bytes.subarray(30, 38));
  const mimetype = new TextDecoder().decode(bytes.subarray(contentStart, contentStart + mimetypeLength));
  return fileName === 'mimetype' && mimetype === 'application/epub+zip';
}

async function validateTextFile(file: File): Promise<void> {
  if (file.size === 0) throw new DocumentValidationError('The TXT file is empty.');
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (hasPdfSignature(bytes.subarray(0, 1024)) || hasEpubSignature(bytes)) {
      throw new DocumentValidationError('The file contents are not plain text. Choose a valid TXT file.');
    }
    const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (!content.trim()) throw new DocumentValidationError('The TXT file contains no readable text.');
    if (content.includes('\0')) throw new DocumentValidationError('The TXT file appears to contain binary data.');
  } catch (error) {
    if (error instanceof DocumentValidationError) throw error;
    throw new DocumentValidationError('The TXT file is not valid UTF-8 text and could not be read.');
  }
}

export async function validateDocumentFile(file: File): Promise<SupportedDocumentFormat> {
  if (file.size === 0) throw new DocumentValidationError('The document file is empty.');
  if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
    throw new DocumentValidationError('Documents must be 50 MB or smaller.');
  }

  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension !== 'pdf' && extension !== 'txt' && extension !== 'epub') {
    throw new DocumentValidationError('Choose a PDF, TXT, or EPUB document.');
  }

  if (extension === 'txt') {
    await validateTextFile(file);
    return 'txt';
  }

  const header = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  if (extension === 'pdf' && hasPdfSignature(header)) return 'pdf';
  if (extension === 'epub' && hasEpubSignature(header)) return 'epub';
  throw new DocumentValidationError(
    `The file contents do not match the .${extension.toUpperCase()} format. Choose a valid document file.`
  );
}

function detectCoverFormat(bytes: Uint8Array): SupportedCoverFormat | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) return 'png';
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) return 'webp';
  if (bytes.length >= 6) {
    const signature = new TextDecoder().decode(bytes.subarray(0, 6));
    if (signature === 'GIF87a' || signature === 'GIF89a') return 'gif';
  }
  return null;
}

export async function validateCoverFile(file: File): Promise<SupportedCoverFormat> {
  if (file.size === 0) throw new DocumentValidationError('The cover image is empty.');
  if (file.size > MAX_COVER_SIZE_BYTES) {
    throw new DocumentValidationError('Cover images must be 5 MB or smaller.');
  }

  const extension = file.name.split('.').pop()?.toLowerCase();
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const detectedFormat = detectCoverFormat(bytes);
  if (!detectedFormat || detectedFormat !== (extension === 'jpg' ? 'jpeg' : extension)) {
    throw new DocumentValidationError('The cover contents must match a JPEG, PNG, WebP, or GIF image.');
  }
  return detectedFormat;
}

export function getDocumentContentType(format: SupportedDocumentFormat): string {
  return DOCUMENT_CONTENT_TYPES[format];
}

export function getCoverContentType(format: SupportedCoverFormat): string {
  return COVER_CONTENT_TYPES[format];
}
