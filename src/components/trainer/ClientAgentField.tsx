"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AgentPicker, agentLabel, takenFrom } from "@/components/trainer/AgentPicker";
import type { AgentOption } from "@/lib/clients/agent-choices";

type Props = { employeeId: string; employeeName: string; cartesiaAgentId: string | null; agents: AgentOption[] };

/**
 * Which Cartesia agent a client's calls use, picked from the account's agents and
 * changeable in place. Saving also connects the agent's call results to the platform.
 */
export function ClientAgentField({ employeeId, employeeName, cartesiaAgentId, agents }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");

  const current = agents.find((a) => a.id === cartesiaAgentId);

  function start() {
    setValue(cartesiaAgentId ?? "");
    setError("");
    setEditing(true);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/trainer/clients", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId,
          cartesiaAgentId: value || null,
          // Choosing an agent another client uses means taking it over; the picker warned about it.
          moveAgent: Boolean(takenFrom(agents, value, cartesiaAgentId)),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not save the agent.");
      setWarning(data.agentWarning ? `Linked, but its call results could not be connected: ${data.agentWarning}` : "");
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div className="space-y-0.5">
        <p className="text-foreground">
          {employeeName}
          <span className="text-muted"> · </span>
          {cartesiaAgentId ? (
            <span className="text-muted" title={cartesiaAgentId}>
              {current ? agentLabel(current) : <span className="font-mono">{cartesiaAgentId}</span>}
            </span>
          ) : (
            <span className="text-warn">no voice agent</span>
          )}{" "}
          <button type="button" onClick={start} className="font-semibold text-accent hover:underline">
            {cartesiaAgentId ? "Change" : "Choose agent"}
          </button>
        </p>
        {warning ? <p className="text-xs text-warn">{warning}</p> : null}
      </div>
    );
  }

  const unchanged = value === (cartesiaAgentId ?? "");

  return (
    <form onSubmit={save} className="ml-auto w-96 max-w-full space-y-2 pb-1">
      <AgentPicker
        name={`voice-agent-${employeeId}`}
        agents={agents}
        value={value}
        onChange={setValue}
        currentAgentId={cartesiaAgentId}
        ariaLabel={`Voice agent for ${employeeName}`}
      />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setEditing(false)} className="px-2 py-1.5 text-sm text-muted hover:text-ink">
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || unchanged}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Saving…" : takenFrom(agents, value, cartesiaAgentId) ? "Move agent here" : "Save"}
        </button>
      </div>
      {error ? <p className="text-right text-sm text-warn">{error}</p> : null}
    </form>
  );
}
