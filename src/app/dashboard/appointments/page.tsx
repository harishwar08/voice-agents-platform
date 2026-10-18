import { LeadCallCard } from "@/components/owner/LeadCallCard";
import { AppSectionPage } from "@/components/shell/AppSectionPage";
import { requireDashboardAccess } from "@/lib/auth/session";
import { getVisitRequests, latestAttempt } from "@/lib/data/leads";
import { getOwnerWorkspace } from "@/lib/data/workspace";
import { ownerPages } from "@/lib/pages";

export default async function AppointmentsPage() {
  const session = await requireDashboardAccess();
  const workspace = await getOwnerWorkspace(session.userId);
  const visits = workspace.primaryBusiness
    ? await getVisitRequests(workspace.primaryBusiness.id)
    : [];

  return (
    <AppSectionPage meta={ownerPages.appointments} showEmpty={visits.length === 0}>
      {visits.length > 0 ? (
        <div className="mt-6 space-y-4">
          {visits.map((lead) => (
            <LeadCallCard key={lead.id} lead={lead} attempt={latestAttempt(lead)} />
          ))}
        </div>
      ) : null}
    </AppSectionPage>
  );
}
