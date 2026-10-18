import { requireDashboardAccess } from "@/lib/auth/session";
import { getOwnerWorkspace } from "@/lib/data/workspace";
import { AiEmployeeManager } from "@/components/employee/AiEmployeeManager";

export default async function AiEmployeePage() {
  const session = await requireDashboardAccess();
  // The owner's business, or the one staff are viewing.
  const workspace = await getOwnerWorkspace(session.userId);
  const business = workspace.primaryBusiness;
  const employees = [...workspace.aiEmployees].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <div className="space-y-6">
      <div className="border-b border-border pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="font-display text-2xl font-bold text-ink">AI Employee Hub</h1>
            <p className="mt-1 text-xs text-muted">
              Teach your AI employee about your business: explain it by speaking, upload documents, and choose what it should find out on calls.
            </p>
          </div>
          {business && (
            <div className="flex items-center gap-2 rounded-xl bg-surface px-3 py-1.5 border border-border text-xs">
              <span className="text-muted">Business:</span>
              <strong className="text-ink font-semibold">{business.name}</strong>
            </div>
          )}
        </div>
      </div>

      <AiEmployeeManager
        initialEmployees={employees}
        business={business}
      />
    </div>
  );
}
