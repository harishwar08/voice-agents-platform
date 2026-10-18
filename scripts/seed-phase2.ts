/**
 * Phase 2 seed: demo users, business, membership, and AI employee.
 *
 * Requires .env.local with Supabase URL + service role key.
 * Run after applying migrations: npm run db:seed
 */

import { createClient } from "@supabase/supabase-js";

import type { Database } from "../src/lib/database.types";

type SeedUser = {
  email: string;
  password: string;
  fullName: string;
  platformRole: "business_owner" | "trainer" | "admin";
};

const users: SeedUser[] = [
  {
    email: "ravi@srimobile.in",
    password: "OwnerPass123",
    fullName: "Ravi Kumar",
    platformRole: "business_owner",
  },
  {
    email: "trainer@platform.in",
    password: "TrainerPass123",
    fullName: "AI Trainer",
    platformRole: "trainer",
  },
  {
    email: "admin@platform.in",
    password: "AdminPass123",
    fullName: "Platform Admin",
    platformRole: "admin",
  },
];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
    process.exit(1);
  }

  const admin = createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const userIds: Record<string, string> = {};

  for (const user of users) {
    const { data: existing } = await admin.auth.admin.listUsers();
    const found = existing.users.find((entry) => entry.email === user.email);

    if (found) {
      userIds[user.email] = found.id;
      await admin.auth.admin.updateUserById(found.id, {
        password: user.password,
        user_metadata: { full_name: user.fullName },
        app_metadata: { platform_role: user.platformRole },
      });
      await admin
        .from("profiles")
        .update({
          full_name: user.fullName,
          platform_role: user.platformRole,
        })
        .eq("id", found.id);
      console.log(`Updated user: ${user.email}`);
      continue;
    }

    const { data, error } = await admin.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: { full_name: user.fullName },
      // app_metadata, not user_metadata: the new-user trigger only trusts what the service role sets.
      app_metadata: { platform_role: user.platformRole },
    });

    if (error || !data.user) {
      console.error(`Failed to create ${user.email}:`, error?.message);
      process.exit(1);
    }

    userIds[user.email] = data.user.id;
    console.log(`Created user: ${user.email}`);
  }

  const ownerId = userIds["ravi@srimobile.in"];

  const { data: existingBusiness } = await admin
    .from("businesses")
    .select("id")
    .eq("name", "Sri Mobile")
    .maybeSingle();

  let businessId = existingBusiness?.id;

  if (!businessId) {
    const { data: business, error } = await admin
      .from("businesses")
      .insert({
        name: "Sri Mobile",
        industry: "mobile_retail",
        phone: "+919876543210",
        email: "hello@srimobile.in",
        timezone: "Asia/Kolkata",
        status: "active",
      })
      .select("id")
      .single();

    if (error || !business) {
      console.error("Failed to create business:", error?.message);
      process.exit(1);
    }

    businessId = business.id;
    console.log("Created business: Sri Mobile");
  }

  const { data: existingMember } = await admin
    .from("business_members")
    .select("id")
    .eq("business_id", businessId)
    .eq("user_id", ownerId)
    .maybeSingle();

  if (!existingMember) {
    const { error } = await admin.from("business_members").insert({
      business_id: businessId,
      user_id: ownerId,
      role: "owner",
    });

    if (error) {
      console.error("Failed to create business membership:", error.message);
      process.exit(1);
    }
    console.log("Linked Ravi as business owner");
  }

  const { data: existingEmployee } = await admin
    .from("ai_employees")
    .select("id")
    .eq("business_id", businessId)
    .eq("name", "Priya")
    .maybeSingle();

  if (!existingEmployee) {
    const { error } = await admin.from("ai_employees").insert({
      business_id: businessId,
      name: "Priya",
      description: "Inbound sales and support AI employee for Sri Mobile",
      status: "live",
    });

    if (error) {
      console.error("Failed to create AI employee:", error.message);
      process.exit(1);
    }
    console.log("Created AI employee: Priya");
  }

  console.log("\nPhase 2 seed complete.");
  console.log("Demo logins:");
  for (const user of users) {
    console.log(`  ${user.email} / ${user.password} (${user.platformRole})`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
