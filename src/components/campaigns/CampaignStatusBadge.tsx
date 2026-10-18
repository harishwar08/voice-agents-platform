import type { Campaign } from "@/lib/database.types";

const STYLES: Record<Campaign["status"], string> = {
  draft: "bg-border/50 text-foreground",
  running: "bg-accent text-white",
  paused: "bg-warn/15 text-warn",
  completed: "bg-accent-soft text-accent",
};

const LABELS: Record<Campaign["status"], string> = {
  draft: "Not started",
  running: "Calling",
  paused: "Paused",
  completed: "Finished",
};

export function CampaignStatusBadge({ status }: { status: Campaign["status"] }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STYLES[status]}`}>
      {LABELS[status]}
    </span>
  );
}
