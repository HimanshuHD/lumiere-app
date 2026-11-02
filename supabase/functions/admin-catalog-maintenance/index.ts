import { createClient } from "npm:@supabase/supabase-js@2";
import { shouldDeferCatalogImportCleanup } from "../_shared/catalog_import_recovery.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Apikey, Content-Type, X-Client-Info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(body: Record<string, unknown>, status = 200): Response {
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
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

interface RecoveryRow {
  user_id: string;
  operation_id: string;
  storage_path: string;
  failure_stage: "catalog-delete" | "catalog-import";
  status: "cleanup_pending" | "reconciliation_pending";
  attempts: number;
}

async function processPendingCleanup(
  adminClient: ReturnType<typeof createClient>,
): Promise<{ completed: number; pending: number }> {
  const { data: rows, error: listError } = await adminClient
    .from("document_lifecycle_recovery")
    .select("user_id, operation_id, storage_path, failure_stage, status, attempts")
    .in("failure_stage", ["catalog-delete", "catalog-import"])
    .in("status", ["cleanup_pending", "reconciliation_pending"])
    .order("created_at", { ascending: true });

  if (listError) throw new Error(`Could not load catalog cleanup records: ${listError.message}`);

  let completed = 0;
  let pending = 0;
  for (const row of (rows ?? []) as RecoveryRow[]) {
    const [fileReference, coverReference] = await Promise.all([
      adminClient.from("documents").select("id").eq("file_storage_path", row.storage_path).limit(1),
      adminClient.from("documents").select("id").eq("cover_storage_path", row.storage_path).limit(1),
    ]);
    if (fileReference.error || coverReference.error) {
      const error = fileReference.error ?? coverReference.error;
      console.error("[admin-catalog-maintenance] Could not reconcile cleanup reference", error);
      const { error: updateError } = await adminClient
        .from("document_lifecycle_recovery")
        .update({
          last_error: error.message,
          attempts: row.attempts + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", row.user_id)
        .eq("operation_id", row.operation_id)
        .eq("storage_path", row.storage_path)
        .eq("failure_stage", row.failure_stage)
        .eq("status", row.status);
      if (updateError) {
        console.error("[admin-catalog-maintenance] Could not record reconciliation failure", updateError);
      }
      pending += 1;
      continue;
    }

    const isReferenced = (fileReference.data?.length ?? 0) > 0
      || (coverReference.data?.length ?? 0) > 0;
    if (
      !isReferenced
      && shouldDeferCatalogImportCleanup(row.status, row.attempts)
    ) {
      const { error: deferError } = await adminClient
        .from("document_lifecycle_recovery")
        .update({
          last_error: "No document references this path yet; delayed cleanup is required to resolve the in-flight import safely.",
          attempts: row.attempts + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", row.user_id)
        .eq("operation_id", row.operation_id)
        .eq("storage_path", row.storage_path)
        .eq("failure_stage", row.failure_stage)
        .eq("status", row.status);
      if (deferError) {
        console.error("[admin-catalog-maintenance] Could not defer uncertain import cleanup", deferError);
      }
      pending += 1;
      continue;
    }

    const removeError = isReferenced
      ? null
      : (await adminClient.storage.from("documents").remove([row.storage_path])).error;

    const { error: updateError } = await adminClient
      .from("document_lifecycle_recovery")
      .update(removeError
        ? {
          last_error: removeError.message,
          attempts: row.attempts + 1,
          updated_at: new Date().toISOString(),
        }
        : {
          status: "completed",
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", row.user_id)
      .eq("operation_id", row.operation_id)
      .eq("storage_path", row.storage_path)
        .eq("failure_stage", row.failure_stage)
        .eq("status", row.status);

    if (updateError) {
      console.error("[admin-catalog-maintenance] Could not update cleanup record", updateError);
      pending += 1;
    } else if (removeError) {
      console.error("[admin-catalog-maintenance] Storage cleanup failed", removeError);
      pending += 1;
    } else {
      completed += 1;
    }
  }

  return { completed, pending };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (request.method !== "POST") return respond({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("[admin-catalog-maintenance] Missing Supabase environment variables.");
    return respond({ error: "The catalog maintenance service is not configured." }, 503);
  }

  const accessToken = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return respond({ error: "Sign in with a catalog administrator account." }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser(accessToken);
  if (authError || !authData.user) {
    return respond({ error: "Your sign-in session is invalid or expired." }, 401);
  }
  if (authData.user.app_metadata?.role !== "admin") {
    return respond({ error: "Catalog administrator access is required." }, 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return respond({ error: "Send a valid catalog maintenance request." }, 400);
  }
  if (!isRecord(body) || typeof body.action !== "string") {
    return respond({ error: "Choose a valid catalog maintenance operation." }, 400);
  }
  if (
    !["delete", "retry_cleanup", "pending_cleanup"].includes(body.action)
    || (body.action === "delete" && !isUuid(body.documentId))
  ) {
    return respond({ error: "The catalog maintenance request is incomplete." }, 400);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (body.action === "pending_cleanup") {
    const { count, error } = await adminClient
      .from("document_lifecycle_recovery")
      .select("storage_path", { count: "exact", head: true })
      .in("failure_stage", ["catalog-delete", "catalog-import"])
      .in("status", ["cleanup_pending", "reconciliation_pending"]);
    if (error) {
      console.error("[admin-catalog-maintenance] Could not count cleanup records", error);
      return respond({ error: "Could not load pending catalog cleanup." }, 500);
    }
    return respond({ pending: count ?? 0 });
  }

  let impact: Record<string, unknown> | null = null;
  if (body.action === "delete") {
    const { data, error } = await userClient.rpc("delete_canonical_catalog_document", {
      p_document_id: body.documentId,
    });
    if (error) {
      const status = error.code === "42501" ? 403 : error.code === "P0002" ? 404 : 500;
      if (status === 500) console.error("[admin-catalog-maintenance] Catalog deletion RPC failed", error);
      return respond({ error: error.message }, status);
    }
    if (!isRecord(data)) {
      console.error("[admin-catalog-maintenance] Catalog deletion RPC returned an invalid result.");
      return respond({ error: "The server did not confirm catalog deletion." }, 500);
    }
    impact = data;
  }

  try {
    const cleanup = await processPendingCleanup(adminClient);
    return respond({ deleted: body.action === "delete", impact, cleanup });
  } catch (error) {
    console.error("[admin-catalog-maintenance] Catalog storage cleanup failed", error);
    return respond({
      deleted: body.action === "delete",
      impact,
      cleanup: { completed: 0, pending: 1 },
      error: "The catalog record was deleted, but storage cleanup could not be completed. Retry cleanup.",
    }, 202);
  }
});
