import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { textToChapters } from "../_shared/document_text.ts";
import { validateUserUpload } from "../_shared/user_upload_validation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Apikey, Content-Type, X-Client-Info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && value === value.toLowerCase()
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isBoundedText(value: unknown, maximumLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximumLength;
}

class RequestBodyTooLargeError extends Error {}

async function readJsonBody(request: Request, maximumBytes: number): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("The document metadata request is empty.");

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maximumBytes) {
      await reader.cancel();
      throw new RequestBodyTooLargeError();
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

function isDocumentRequest(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  return isUuid(value.id)
    && isBoundedText(value.title, 500)
    && isBoundedText(value.author, 500)
    && isBoundedText(value.category, 100)
    && isBoundedText(value.summary, 10_000)
    && typeof value.reading_time === "number"
    && Number.isSafeInteger(value.reading_time)
    && Number(value.reading_time) > 0
    && (
      value.page_count === null
      || typeof value.page_count === "number"
        && Number.isSafeInteger(value.page_count)
        && Number(value.page_count) >= 0
    )
    && (value.visibility === "private" || value.visibility === "shared")
    && isBoundedText(value.file_name, 255)
    && !/[\\/]/.test(String(value.file_name))
    && typeof value.file_storage_path === "string"
    && (value.cover_storage_path === null || typeof value.cover_storage_path === "string");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (request.method !== "POST") return respond({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("[finalize-user-document-upload] Missing Supabase environment variables.");
    return respond({ error: "The upload service is not configured." }, 503);
  }

  const accessToken = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return respond({ error: "Sign in to upload a document." }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser(accessToken);
  if (authError || !authData.user) {
    return respond({ error: "Your sign-in session is invalid or expired." }, 401);
  }

  const contentLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(contentLength) && contentLength > 256 * 1024) {
    return respond({ error: "The document metadata request is too large." }, 413);
  }

  let requestBody: unknown;
  try {
    requestBody = await readJsonBody(request, 256 * 1024);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return respond({ error: "The document metadata request is too large." }, 413);
    }
    return respond({ error: "Send valid document metadata as JSON." }, 400);
  }
  if (!isRecord(requestBody) || !isDocumentRequest(requestBody.document)) {
    return respond({ error: "The document metadata is incomplete or invalid." }, 400);
  }

  const document = requestBody.document;
  const userId = authData.user.id;
  const documentPath = document.file_storage_path as string;
  const coverPath = document.cover_storage_path as string | null;
  const documentFileName = documentPath.slice(`${userId}/`.length);
  const validDocumentPath = documentPath.startsWith(`${userId}/`)
    && new RegExp(`^${document.id}\\.(pdf|txt|epub)$`, "i").test(documentFileName);
  const validCoverPath = coverPath === null || (
    coverPath.startsWith(`${userId}/`)
    && new RegExp(`^${document.id}-cover\\.(jpg|jpeg|png|webp|gif)$`, "i")
      .test(coverPath.slice(`${userId}/`.length))
  );
  if (
    !validDocumentPath
    || !validCoverPath
  ) {
    return respond({ error: "The document storage paths do not belong to this upload operation." }, 403);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: documentBlob, error: documentDownloadError } = await adminClient.storage
    .from("documents")
    .download(documentPath);
  if (documentDownloadError || !documentBlob) {
    console.error("[finalize-user-document-upload] Could not load uploaded document", documentDownloadError);
    return respond({ error: "The uploaded document could not be found for validation." }, 400);
  }

  const documentFile = new File([documentBlob], documentPath.split("/").at(-1) ?? "document");
  let validatedDocument;
  try {
    validatedDocument = await validateUserUpload(userId, documentPath, documentFile);
  } catch (error) {
    return respond({
      error: error instanceof Error ? error.message : "The uploaded document failed validation.",
    }, 400);
  }
  if (validatedDocument.kind !== "document") {
    return respond({ error: "The uploaded document path is invalid." }, 400);
  }
  if (String(document.file_name).split(".").pop()?.toLowerCase() !== validatedDocument.format) {
    return respond({ error: "The original filename extension does not match the validated document." }, 400);
  }

  let coverContentType: string | null = null;
  if (coverPath) {
    const { data: coverBlob, error: coverDownloadError } = await adminClient.storage
      .from("documents")
      .download(coverPath);
    if (coverDownloadError || !coverBlob) {
      console.error("[finalize-user-document-upload] Could not load uploaded cover", coverDownloadError);
      return respond({ error: "The uploaded cover could not be found for validation." }, 400);
    }

    const coverFile = new File([coverBlob], coverPath.split("/").at(-1) ?? "cover");
    try {
      const validatedCover = await validateUserUpload(userId, coverPath, coverFile);
      if (validatedCover.kind !== "cover") {
        return respond({ error: "The uploaded cover path is invalid." }, 400);
      }
      coverContentType = validatedCover.contentType;
    } catch (error) {
      return respond({
        error: error instanceof Error ? error.message : "The uploaded cover failed validation.",
      }, 400);
    }

    if (coverBlob.type !== coverContentType) {
      const { error: coverMetadataError } = await adminClient.storage
        .from("documents")
        .updateMetadata(coverPath, { contentType: coverContentType });
      if (coverMetadataError) {
        console.error("[finalize-user-document-upload] Could not normalize cover metadata", coverMetadataError);
        return respond({ error: "The validated cover could not be finalized." }, 500);
      }
    }
  }

  if (documentBlob.type !== validatedDocument.contentType) {
    const { error: documentMetadataError } = await adminClient.storage
      .from("documents")
      .updateMetadata(documentPath, { contentType: validatedDocument.contentType });
    if (documentMetadataError) {
      console.error("[finalize-user-document-upload] Could not normalize document metadata", documentMetadataError);
      return respond({ error: "The validated document could not be finalized." }, 500);
    }
  }

  const chapters = validatedDocument.format === "txt"
    ? textToChapters(await documentFile.text())
    : [{
      title: String(document.title),
      content: `This document is available in its original format (${validatedDocument.format.toUpperCase()}). Use the download link below to access the full content.`,
    }];
  const row = {
    id: document.id,
    title: String(document.title).trim(),
    author: String(document.author).trim(),
    category: String(document.category),
    summary: String(document.summary).trim(),
    reading_time: Number(document.reading_time),
    chapters,
    is_featured: false,
    page_count: document.page_count,
    visibility: document.visibility,
    file_format: validatedDocument.format,
    file_name: String(document.file_name),
    file_storage_path: documentPath,
    cover_storage_path: coverPath,
    cover_url: null,
    origin: "user_upload",
    uploaded_by: userId,
    source_identity: null,
  };
  const { error: insertError } = await adminClient
    .from("documents")
    .insert(row);
  if (insertError) {
    console.error("[finalize-user-document-upload] Could not save validated document", insertError);
    return respond({ error: "The validated document could not be saved." }, 500);
  }

  return respond({ id: String(document.id) }, 201);
});

