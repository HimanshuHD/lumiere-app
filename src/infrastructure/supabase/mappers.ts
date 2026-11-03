import { parsePosition } from '../../domain/reading-position.ts';
import { ServiceError } from '../../domain/errors.ts';
import type { Document, DocumentOrigin, DocumentVisibility } from '../../domain/documents.ts';
import type { DocumentSummary, BookmarkSummary } from '../../domain/document-summary.ts';
import type { ProgressRow, SaveResult } from '../../domain/progress.ts';
export function record(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ServiceError('validation', 'The server returned an invalid record.');
  return input as Record<string, unknown>;
}
export function text(row: Record<string, unknown>, key: string): string {
  if (typeof row[key] !== 'string') throw new ServiceError('validation', `The server returned invalid ${key}.`);
  return row[key];
}
function nullableText(row: Record<string, unknown>, key: string): string | null {
  return row[key] == null ? null : text(row, key);
}
function number(row: Record<string, unknown>, key: string, fallback?: number): number {
  const value = row[key] == null ? fallback : row[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new ServiceError('validation', `The server returned invalid ${key}.`);
  return value;
}
export function mapSummary(input: unknown): DocumentSummary {
  const row = record(input);
  const origin = text(row, 'origin');
  const visibility = text(row, 'visibility');
  if (!['user_upload','catalog_import','legacy_unowned','demo'].includes(origin) || !['private','shared'].includes(visibility)
    || typeof row.is_featured !== 'boolean') throw new ServiceError('validation', 'The server returned invalid document metadata.');
  const chapterCount = number(row, 'chapter_count', 0);
  if (!Number.isSafeInteger(chapterCount) || chapterCount < 0) throw new ServiceError('validation', 'The server returned an invalid chapter count.');
  return {
    id: text(row,'id'), title: text(row,'title'), author: text(row,'author'), category: text(row,'category'),
    summary: text(row,'summary'), reading_time: number(row,'reading_time'), cover_url: nullableText(row,'cover_url'),
    origin: origin as DocumentOrigin, visibility: visibility as DocumentVisibility, is_featured: row.is_featured,
    created_at: nullableText(row,'created_at') ?? '', chapter_count: chapterCount,
    uploaded_by: nullableText(row,'uploaded_by'), page_count: row.page_count == null ? null : number(row,'page_count'),
    file_url: nullableText(row,'file_url'), file_storage_path: nullableText(row,'file_storage_path'),
    cover_storage_path: nullableText(row,'cover_storage_path'), file_format: nullableText(row,'file_format'),
    file_name: nullableText(row,'file_name'), source_url: nullableText(row,'source_url'), source_identity: nullableText(row,'source_identity'),
  };
}
export function mapDocument(input: unknown): Document {
  const row = record(input);
  if (!Array.isArray(row.chapters)) throw new ServiceError('validation', 'The document content is invalid.');
  const chapters = row.chapters.map(chapter => { const value = record(chapter); return { title: text(value,'title'), content: text(value,'content') }; });
  return { ...mapSummary({ ...row, chapter_count: row.chapter_count ?? chapters.length }), chapters };
}
export function mapReference(input: unknown): BookmarkSummary {
  const row = record(input);
  return { id: text(row,'id'), user_id: text(row,'user_id'), document_id: text(row,'document_id'),
    created_at: nullableText(row,'created_at') ?? '', ...(row.document == null ? {} : {document: mapSummary(row.document)}) };
}
export function mapProgress(input: unknown): ProgressRow {
  const row = record(input);
  if ((row.position != null && !parsePosition(row.position)) || !Number.isSafeInteger(number(row,'revision',0)) || number(row,'revision',0) < 0 || !Number.isSafeInteger(number(row,'chapter_index',0)) || number(row,'chapter_index',0) < 0 || number(row,'scroll_percent',0) < 0 || number(row,'scroll_percent',0) > 1) throw new ServiceError('validation', 'The server returned an invalid reading position.');
  return { id: text(row,'id'), user_id: text(row,'user_id'), document_id: text(row,'document_id'),
    chapter_index: number(row,'chapter_index',0), scroll_percent: number(row,'scroll_percent',0),
    epub_cfi: nullableText(row,'epub_cfi'), position: row.position, revision: number(row,'revision',0),
    mutation_id: nullableText(row,'mutation_id'), updated_at: nullableText(row,'updated_at') ?? '' };
}
export function mapSaveResult(input: unknown): SaveResult {
  const row = record(input);
  if (typeof row.accepted !== 'boolean' || !('row' in row) || (row.accepted && row.row == null)) throw new ServiceError('validation', 'The server did not confirm the reading position.');
  return { accepted: row.accepted, row: row.row == null ? null : mapProgress(row.row) };
}
export function mapProfile(input: unknown): { full_name: string | null; avatar_url: string | null } | null {
  if (input == null) return null;
  const row = record(input);
  return { full_name: nullableText(row,'full_name'), avatar_url: nullableText(row,'avatar_url') };
}
