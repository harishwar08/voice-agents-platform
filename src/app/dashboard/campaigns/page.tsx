import Link from "next/link";

import { CampaignStatusBadge } from "@/components/campaigns/CampaignStatusBadge";
import { NewCampaignForm } from "@/components/campaigns/NewCampaignForm";
import { AppSectionPage } from "@/components/shell/AppSectionPage";
import { canManageBusiness } from "@/lib/auth/access";
import { requireDashboardAccess } from "@/lib/auth/session";
import { getCampaigns } from "@/lib/data/campaigns";
import { getOwnerWorkspace } from "@/lib/data/workspace";
import { ownerPages } from "@/lib/pages";
import { createAdminClient } from "@/lib/supabase/admin";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-IN", { dateStyle: "medium" });
}

export default async function CampaignsPage() {
  const session = await requireDashboardAccess();
  const workspace = await getOwnerWorkspace(session.userId);
  const business = workspace.primaryBusiness;
  const admin = createAdminClient();

  const [campaigns, canManage] =
    business && admin
      ? await Promise.all([getCampaigns(business.id), canManageBusiness(admin, session, business.id)])
      : [[], false];

  return (
    <AppSectionPage meta={ownerPages.campaigns} showEmpty={campaigns.length === 0}>
      {canManage ? (
        <div className="mb-8">
          <NewCampaignForm />
        </div>
      ) : null}

      {campaigns.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="bg-background text-left text-xs uppercase tracking-[0.1em] text-muted">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Campaign</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 text-right font-semibold">Progress</th>
                <th className="px-4 py-2.5 text-right font-semibold">Picked up</th>
                <th className="px-4 py-2.5 text-right font-semibold">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-surface">
              {campaigns.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/campaigns/${c.id}`} className="font-medium text-ink hover:text-accent hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <CampaignStatusBadge status={c.status} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {c.done} / {c.total}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {c.pickedUp}
                    {c.done ? <span className="ml-1.5 text-xs text-muted">{Math.round((c.pickedUp / c.done) * 100)}%</span> : null}
                  </td>
                  <td className="px-4 py-3 text-right text-muted">{formatDate(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </AppSectionPage>
  );
}
