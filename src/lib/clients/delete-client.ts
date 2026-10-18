import type { SupabaseClient } from "@supabase/supabase-js";

import { isPlatformStaff } from "@/lib/auth/roles";
import type { Database, PlatformRole } from "@/lib/database.types";

type AdminClient = SupabaseClient<Database>;

export type ClientLogin = { id: string; email: string; deleted: boolean };

type Member = { business_id: string; user_id: string };
type Profile = { id: string; email: string | null; platform_role: PlatformRole };

/**
 * The logins that go when a client is deleted: everyone with access to it, except
 * staff and anyone who still has another client to sign in to.
 */
export function clientLogins(businessId: string, members: Member[], profiles: Profile[]): ClientLogin[] {
  const profileOf = new Map(profiles.map((p) => [p.id, p]));
  return members
    .filter((m) => m.business_id === businessId)
    .map((m) => {
      const profile = profileOf.get(m.user_id);
      const staff = profile ? isPlatformStaff(profile.platform_role) : false;
      const elsewhere = members.some((other) => other.user_id === m.user_id && other.business_id !== businessId);
      return { id: m.user_id, email: profile?.email ?? "—", deleted: !staff && !elsewhere };
    });
}

/**
 * Deletes a client and everything it owns. Every client table is tied to the business
 * with ON DELETE CASCADE, so removing the business row takes its AI employee, leads,
 * calls, campaigns, credits, knowledge and delivery settings with it. Its logins go
 * afterwards, so a failure there never leaves a half-deleted business behind.
 */
export async function deleteClient(supabase: AdminClient, businessId: string) {
  // This client's logins, then every client each of them belongs to.
  const { data: own, error: ownError } = await supabase.from("business_members").select("user_id").eq("business_id", businessId);
  if (ownError) return { error: "Could not look up the client's logins. Nothing was removed." } as const;
  const userIds = [...new Set((own ?? []).map((m) => m.user_id))];

  const [members, profiles] = userIds.length
    ? await Promise.all([
        supabase.from("business_members").select("business_id, user_id").in("user_id", userIds),
        supabase.from("profiles").select("id, email, platform_role").in("id", userIds),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  // Without these, a login that also belongs to another client could be deleted.
  if (members.error || profiles.error) return { error: "Could not look up the client's logins. Nothing was removed." } as const;
  const logins = clientLogins(businessId, members.data ?? [], profiles.data ?? []);

  const { error } = await supabase.from("businesses").delete().eq("id", businessId);
  if (error) return { error: "Could not delete the client. Nothing was removed." } as const;

  const failedLogins: string[] = [];
  for (const login of logins.filter((l) => l.deleted)) {
    const { error: userError } = await supabase.auth.admin.deleteUser(login.id);
    if (userError) failedLogins.push(login.email);
  }

  return {
    deletedLogins: logins.filter((l) => l.deleted && !failedLogins.includes(l.email)).map((l) => l.email),
    keptLogins: logins.filter((l) => !l.deleted).map((l) => l.email),
    failedLogins,
  } as const;
}
