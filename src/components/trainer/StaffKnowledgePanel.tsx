"use client";

import { useEffect, useState } from "react";

import { DocumentUploader } from "@/components/rag/DocumentUploader";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import type { KnowledgeDocument } from "@/lib/database.types";

type Props = { aiEmployeeId: string; employeeName: string };
type Knowledge = { documents: KnowledgeDocument[]; totalChunks: number };

async function fetchKnowledge(aiEmployeeId: string): Promise<Knowledge> {
  const res = await fetch(`/api/rag/documents?aiEmployeeId=${aiEmployeeId}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Could not load the knowledge base.");
  return { documents: data.documents ?? [], totalChunks: data.totalChunks ?? 0 };
}

/**
 * A client's knowledge base as staff see it: the same upload, view, edit and
 * delete the client has on their own dashboard, so either side can fix a fact.
 */
export function StaffKnowledgePanel({ aiEmployeeId, employeeName }: Props) {
  const confirm = useConfirm();
  const [knowledge, setKnowledge] = useState<Knowledge | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchKnowledge(aiEmployeeId).then(
      (k) => !cancelled && setKnowledge(k),
      (err: Error) => !cancelled && setError(err.message)
    );
    return () => {
      cancelled = true;
    };
  }, [aiEmployeeId]);

  async function reload() {
    setError("");
    try {
      setKnowledge(await fetchKnowledge(aiEmployeeId));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove(docId: string) {
    const confirmed = await confirm({
      title: "Delete this item?",
      message: "It is removed from the client's knowledge base, and their agent stops using it from the next call.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!confirmed) return;
    const res = await fetch(`/api/rag/documents?id=${docId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not delete it.");
      return;
    }
    reload();
  }

  return (
    <div className="space-y-3">
      {error ? <p className="text-sm text-warn">{error}</p> : null}
      {!knowledge && !error ? <p className="text-sm text-muted">Loading the knowledge base…</p> : null}
      {knowledge && !knowledge.documents.length ? (
        <p className="text-sm text-muted">Nothing in this client&apos;s knowledge base yet. Upload the first document below.</p>
      ) : null}
      <DocumentUploader
        aiEmployeeId={aiEmployeeId}
        employeeName={employeeName}
        onUploadSuccess={reload}
        documents={knowledge?.documents ?? []}
        totalChunks={knowledge?.totalChunks ?? 0}
        onDeleteDocument={remove}
      />
    </div>
  );
}
