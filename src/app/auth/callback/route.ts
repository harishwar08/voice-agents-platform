import { NextResponse } from "next/server";

import { homePathForRole, isPlatformStaff, safeReturnPath } from "@/lib/auth/roles";
import type { PlatformRole } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const RESET_PASSWORD = "/reset-password";

/** An account Google created moments ago rather than one staff set up. */
const JUST_CREATED_MS = 10 * 60 * 1000;

/**
 * Where Supabase sends people back to after Google sign-in and password reset links.
 * Accounts are made by staff, so Google signs in only someone who already has one:
 * an unknown Google address gets an empty account from Supabase, which is removed here.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");
  const toLogin = (error: string) => NextResponse.redirect(`${origin}/login?error=${error}`);

  // Google sends ?error=access_denied when the person cancels on its consent screen.
  if (searchParams.get("error")) return toLogin("google_cancelled");
  if (!code) return toLogin("link_invalid");

  const supabase = await createClient();
  if (!supabase) return toLogin("not_configured");

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return next === RESET_PASSWORD
      ? NextResponse.redirect(`${origin}/forgot-password?error=link_expired`)
      : toLogin("link_expired");
  }
  if (next === RESET_PASSWORD) return NextResponse.redirect(`${origin}${RESET_PASSWORD}`);

  const user = data.user;
  const admin = createAdminClient();
  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase.from("profiles").select("platform_role").eq("id", user.id).maybeSingle(),
    supabase.from("business_members").select("business_id").eq("user_id", user.id).limit(1),
  ]);
  const role = (profile as { platform_role: PlatformRole } | null)?.platform_role;

  if (!role || (!isPlatformStaff(role) && !memberships?.length)) {
    await supabase.auth.signOut();
    const googleOnly = (user.identities ?? []).every((identity) => identity.provider === "google");
    if (admin && googleOnly && Date.now() - new Date(user.created_at).getTime() < JUST_CREATED_MS) {
      await admin.auth.admin.deleteUser(user.id);
    }
    return toLogin("no_account");
  }

  return NextResponse.redirect(`${origin}${safeReturnPath(next, role) ?? homePathForRole(role)}`);
}
