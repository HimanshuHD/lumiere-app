import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";

export async function pilotAdmissionStatus(client: SupabaseClient): Promise<403 | 503 | null> {
  const { data, error } = await client.rpc("pilot_access_allowed");
  // PostgREST rejects unapproved sessions before invoking the RPC.
  if (error) return error.code === "42501" || error.code === "PGRST301" ? 403 : 503;
  return data === true ? null : 403;
}

export function pilotAdmissionMessage(status: 403 | 503): string {
  return status === 403
    ? "This account is not approved for the Lumiere pilot."
    : "Pilot access could not be verified. Please try again.";
}
