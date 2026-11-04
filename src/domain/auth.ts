/** Browser features need identity and display metadata, not an SDK session or tokens. */
export interface AuthUser {
  id: string;
  email?: string;
  user_metadata: Record<string, unknown>;
  app_metadata: Record<string, unknown>;
}
export interface AuthSession { user: AuthUser }
