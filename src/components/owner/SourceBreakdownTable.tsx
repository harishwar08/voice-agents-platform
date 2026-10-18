import type { SourceBreakdownRow } from "@/lib/data/leads";

export function SourceBreakdownTable({ rows }: { rows: SourceBreakdownRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[40rem] text-sm">
        <thead className="bg-background text-left text-xs uppercase tracking-[0.1em] text-muted">
          <tr>
            <th className="px-4 py-2.5 font-semibold">Source</th>
            <th className="px-4 py-2.5 font-semibold">Campaign</th>
            <th className="px-4 py-2.5 text-right font-semibold">Leads</th>
            <th className="px-4 py-2.5 text-right font-semibold">Picked up</th>
            <th className="px-4 py-2.5 text-right font-semibold">Interested</th>
            <th className="px-4 py-2.5 text-right font-semibold">Not interested</th>
            <th className="px-4 py-2.5 text-right font-semibold">Appointments</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-surface">
          {rows.map((row) => (
            <tr key={`${row.source}-${row.campaign ?? ""}`}>
              <td className="px-4 py-2.5 font-medium text-ink">{row.source}</td>
              <td className="px-4 py-2.5 text-foreground">
                {row.campaign ?? <span className="text-muted">—</span>}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">{row.leads}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                {row.pickedUp}
                <span className="ml-1.5 text-xs text-muted">
                  {Math.round((row.pickedUp / row.leads) * 100)}%
                </span>
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">{row.interested}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{row.notInterested}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{row.visits}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
