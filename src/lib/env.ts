/**
 * Public environment helpers for Phase 1.
 * Missing Supabase vars are allowed so the base UI stays runnable.
 */

export function getPublicSupabaseUrl(): string | undefined {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  return value && !value.includes("your-project") ? value : undefined;
}

export function getPublicSupabaseAnonKey(): string | undefined {
  const value = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  return value && value !== "your-anon-key" ? value : undefined;
}

export function getServiceRoleKey(): string | undefined {
  const value = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return value && value !== "your-service-role-key" ? value : undefined;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(getPublicSupabaseUrl() && getPublicSupabaseAnonKey());
}

export function isSupabaseFullyConfigured(): boolean {
  return isSupabaseConfigured() && Boolean(getServiceRoleKey());
}
