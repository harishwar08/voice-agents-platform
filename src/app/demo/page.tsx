import { notFound, redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

/** Shortcut to the first business's real form, so demos need no UUID to hand. */
export default async function DemoRedirectPage() {
  const supabase = createAdminClient();

  const { data: business } = supabase
    ? await supabase
        .from("businesses")
        .select("id")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle()
    : { data: null };

  if (!business) notFound();

  redirect(`/f/${business.id}`);
}
