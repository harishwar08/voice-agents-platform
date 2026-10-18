import { NextResponse } from "next/server";

import { canManageBusiness, getAccessScope, primaryBusinessId } from "@/lib/auth/access";
import { getSessionContext } from "@/lib/auth/session";
import {
  exchangeCodeForUserToken,
  getMetaConfig,
  listPages,
  subscribePageToLeads,
} from "@/lib/meta/graph";
import { metaRedirectUri, META_STATE_COOKIE, settingsUrl } from "@/lib/meta/oauth";
import { createAdminClient } from "@/lib/supabase/admin";

function finish(request: Request, params: Record<string, string>) {
  const response = NextResponse.redirect(settingsUrl(request, params));
  response.cookies.delete({ name: META_STATE_COOKIE, path: "/api/integrations/meta" });
  return response;
}

export async function GET(request: Request) {
  const config = getMetaConfig();
  if (!config) return finish(request, { meta: "not_configured" });

  const url = new URL(request.url);
  const cookieState = request.headers
    .get("cookie")
    ?.split(/;\s*/)
    .find((c) => c.startsWith(`${META_STATE_COOKIE}=`))
    ?.slice(META_STATE_COOKIE.length + 1);

  if (url.searchParams.get("error")) return finish(request, { meta: "cancelled" });
  if (!cookieState || url.searchParams.get("state") !== cookieState) {
    return finish(request, { meta: "error", reason: "The sign-in expired. Please try again." });
  }

  const code = url.searchParams.get("code");
  const session = await getSessionContext();
  const supabase = createAdminClient();
  if (!code || !session || !supabase) return finish(request, { meta: "error", reason: "Please sign in and try again." });

  const businessId = primaryBusinessId(await getAccessScope(supabase, session));
  if (!businessId || !(await canManageBusiness(supabase, session, businessId))) {
    return finish(request, { meta: "not_owner" });
  }

  try {
    const userToken = await exchangeCodeForUserToken(config, code, metaRedirectUri(request));
    const pages = await listPages(config, userToken);
    if (!pages.length) return finish(request, { meta: "no_pages" });

    // A Page already linked to another business stays there; leads must route to one place.
    const { data: taken } = await supabase
      .from("meta_page_connections")
      .select("page_id, business_id")
      .in("page_id", pages.map((p) => p.id));
    const takenElsewhere = new Set(
      (taken ?? []).filter((t) => t.business_id !== businessId).map((t) => t.page_id)
    );

    let connected = 0;
    const skipped: string[] = [];
    for (const page of pages) {
      if (takenElsewhere.has(page.id)) {
        skipped.push(page.name);
        continue;
      }
      await subscribePageToLeads(config, page);
      await supabase.from("meta_page_connections").upsert(
        {
          business_id: businessId,
          page_id: page.id,
          page_name: page.name,
          page_access_token: page.access_token,
          connected_by: session.userId,
          last_error: null,
        },
        { onConflict: "page_id" }
      );
      connected += 1;
    }

    return finish(request, {
      meta: "connected",
      pages: String(connected),
      ...(skipped.length ? { skipped: skipped.join(", ").slice(0, 200) } : {}),
    });
  } catch (err) {
    console.error("[Meta connect] Failed:", err);
    return finish(request, { meta: "error", reason: (err as Error).message.slice(0, 200) });
  }
}
