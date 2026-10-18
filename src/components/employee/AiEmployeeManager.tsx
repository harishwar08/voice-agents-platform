"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import type { AiEmployee, Business, KnowledgeDocument } from "@/lib/database.types";
import { CaptureFieldsEditor } from "./CaptureFieldsEditor";
import { VoiceRecorder } from "../rag/VoiceRecorder";
import { DocumentUploader } from "../rag/DocumentUploader";

interface AiEmployeeManagerProps {
  initialEmployees: AiEmployee[];
  business: Business | null;
}

export function AiEmployeeManager({
  initialEmployees,
  business,
}: AiEmployeeManagerProps) {
  const confirm = useConfirm();
  const [employees, setEmployees] = useState<AiEmployee[]>(initialEmployees);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(
    initialEmployees[0]?.id || ""
  );
  const [activeTab, setActiveTab] = useState<"speak" | "upload" | "capture">("speak");

  // Business Name state synced with VoiceRecorder and database
  const [businessName, setBusinessName] = useState<string>(business?.name || "");

  // Knowledge documents for the selected employee
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [totalChunks, setTotalChunks] = useState(0);
  const [loadingKnowledge, setLoadingKnowledge] = useState(false);

  const selectedEmployee = employees.find((e) => e.id === selectedEmployeeId) || employees[0];

  // Fetch documents whenever selected employee changes
  useEffect(() => {
    if (!selectedEmployee?.id) return;
    loadKnowledge(selectedEmployee.id);
  }, [selectedEmployee?.id]);

  async function loadKnowledge(empId: string) {
    setLoadingKnowledge(true);
    try {
      const res = await fetch(`/api/rag/documents?aiEmployeeId=${empId}`);
      if (res.ok) {
        const data = await res.json();
        const docs = data.documents || [];
        setDocuments(docs);
        setTotalChunks(data.totalChunks || 0);

        // If documents exist and we just ingested, suggest moving to calling
        if (docs.length > 0 && activeTab === "speak") {
          // Keep on tab, user can navigate
        }
      }
    } catch (err) {
      console.error("Failed to load knowledge:", err);
    } finally {
      setLoadingKnowledge(false);
    }
  }

  async function handleDeleteDocument(docId: string) {
    const confirmed = await confirm({
      title: "Delete this document?",
      message: "It is removed from the knowledge base, and the agent stops using it from the next call.",
      confirmLabel: "Delete document",
      tone: "danger",
    });
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/rag/documents?id=${docId}`, { method: "DELETE" });
      if (res.ok && selectedEmployee) {
        await loadKnowledge(selectedEmployee.id);
      }
    } catch (err) {
      console.error("Failed to delete document:", err);
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Selector */}
      {selectedEmployee ? (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-6 shadow-xs">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white font-display text-2xl font-bold shadow-md">
              {selectedEmployee.name.charAt(0)}
            </div>

            <div>
              <div className="flex items-center gap-3">
                <h2 className="font-display text-xl font-bold text-ink">
                  {selectedEmployee.name}
                </h2>
                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                  ● Active Employee
                </span>
                {businessName ? (
                  <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold text-emerald-900">
                    🏢 {businessName}
                  </span>
                ) : null}
                {documents.length > 0 ? (
                  <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
                    📚 {documents.length} Business Facts Stored
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                    ⚠️ Needs Spoken Business Details
                  </span>
                )}
              </div>
              <p className="text-xs text-muted mt-1">
                {selectedEmployee.description || "Voice Calling AI Employee"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {employees.length > 1 && (
              <select
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                className="rounded-xl border border-border bg-background px-3.5 py-2 text-xs font-semibold text-ink shadow-xs outline-hidden focus:border-accent"
              >
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({emp.status})
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      ) : null}

      {/* Main Flow */}
      {selectedEmployee ? (
        <div className="space-y-6">
          {/* Workflow Tabs: Speak, Documents, What to Find Out. Voice and behaviour are set in the voice provider's console. */}
          <div className="flex flex-wrap items-center gap-2 border-b border-border pb-1">
            <button
              type="button"
              onClick={() => setActiveTab("speak")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "speak"
                  ? "bg-accent text-white shadow-xs"
                  : "bg-surface text-muted hover:bg-background hover:text-ink border border-border"
              }`}
            >
              <span>🎙️</span>
              <span>1. Explain by Speaking</span>
              {documents.some((d) => d.source_type === "voice_transcript") && (
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("upload")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "upload"
                  ? "bg-accent text-white shadow-xs"
                  : "bg-surface text-muted hover:bg-background hover:text-ink border border-border"
              }`}
            >
              <span>📄</span>
              <span>2. Upload Documents</span>
              {documents.some((d) => d.source_type === "document_upload") && (
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("capture")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "capture"
                  ? "bg-accent text-white shadow-xs"
                  : "bg-surface text-muted hover:bg-background hover:text-ink border border-border"
              }`}
            >
              <span>📝</span>
              <span>3. What to Find Out</span>
              {selectedEmployee.capture_fields?.length ? (
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              ) : null}
            </button>

            <Link
              href={`/dashboard/agents/${selectedEmployee.id}`}
              className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-xs font-semibold text-muted transition-all hover:bg-background hover:text-ink"
            >
              <span>🔊</span>
              <span>Agent training ↗</span>
            </Link>
          </div>

          {/* Tab 1: Explain by Speaking */}
          {activeTab === "speak" && (
            <VoiceRecorder
              aiEmployeeId={selectedEmployee.id}
              employeeName={selectedEmployee.name}
              initialBusinessName={businessName}
              onIngestSuccess={() => loadKnowledge(selectedEmployee.id)}
              onBusinessUpdated={(updatedName) => setBusinessName(updatedName)}
            />
          )}

          {/* Tab 2: Upload Documents */}
          {activeTab === "upload" && (
            <DocumentUploader
              aiEmployeeId={selectedEmployee.id}
              employeeName={selectedEmployee.name}
              onUploadSuccess={() => loadKnowledge(selectedEmployee.id)}
              documents={documents}
              totalChunks={totalChunks}
              onDeleteDocument={handleDeleteDocument}
            />
          )}

          {/* Tab 3: What to Find Out */}
          {activeTab === "capture" && (
            <CaptureFieldsEditor
              key={selectedEmployee.id}
              aiEmployeeId={selectedEmployee.id}
              employeeName={selectedEmployee.name}
              initialFields={selectedEmployee.capture_fields ?? []}
              onSaved={(fields) =>
                setEmployees((list) =>
                  list.map((e) => (e.id === selectedEmployee.id ? { ...e, capture_fields: fields } : e))
                )
              }
            />
          )}
        </div>
      ) : (
        /* Staff create the AI employee when they add the client, so there is nothing to make here. */
        <div className="mx-auto max-w-xl space-y-2 rounded-3xl border border-border bg-surface p-8 text-center shadow-sm">
          <h3 className="font-display text-xl font-bold text-ink">Your AI employee is being set up</h3>
          <p className="text-sm text-muted">
            Our team is creating and training your agent. Once it is ready, you can add what it should know here.
          </p>
        </div>
      )}
    </div>
  );
}
