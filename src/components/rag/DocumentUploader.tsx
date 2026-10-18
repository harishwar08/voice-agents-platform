"use client";

import { useState, useRef } from "react";

import { KnowledgeDocumentView } from "./KnowledgeDocumentView";
import { KnowledgeMeter } from "./KnowledgeMeter";

interface DocumentUploaderProps {
  aiEmployeeId: string;
  employeeName: string;
  onUploadSuccess: () => void;
  onProceedToCall?: () => void;
  documents?: any[];
  totalChunks?: number;
  onDeleteDocument?: (docId: string) => void;
}

export function DocumentUploader({
  aiEmployeeId,
  employeeName,
  onUploadSuccess,
  onProceedToCall,
  documents = [],
  totalChunks = 0,
  onDeleteDocument,
}: DocumentUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [docTitle, setDocTitle] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);
  // Whether the open document shows its dashboard in edit mode.
  const [openEditing, setOpenEditing] = useState(false);
  // The plain-text editor, the fallback reached from the dashboard editor.
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftText, setDraftText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  function startEditing(doc: { id: string; name: string; raw_text: string }) {
    setEditingDocId(doc.id);
    setExpandedDocId(null);
    setDraftName(doc.name);
    setDraftText(doc.raw_text);
    setEditError("");
  }

  // The server re-chunks changed text, so the next call already uses the edit.
  async function saveEdit() {
    if (!editingDocId) return;
    setSavingEdit(true);
    setEditError("");
    try {
      const res = await fetch("/api/rag/documents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingDocId, name: draftName, text: draftText }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not save the change.");
      setEditingDocId(null);
      setStatusMessage({ text: `✓ Saved "${data.document?.name ?? draftName}". Calls use the new version from now on.`, isError: false });
      onUploadSuccess();
    } catch (err) {
      setEditError((err as Error).message);
    } finally {
      setSavingEdit(false);
    }
  }

  function handleFileSelected(selectedFile: File) {
    setFile(selectedFile);
    if (!docTitle) {
      // Remove extension for title
      const nameWithoutExt = selectedFile.name.replace(/\.[^/.]+$/, "");
      setDocTitle(nameWithoutExt);
    }
    setStatusMessage(null);
  }

  async function handleUpload() {
    if (!file) {
      setStatusMessage({ text: "Please select a file to upload", isError: true });
      return;
    }

    setIsUploading(true);
    setStatusMessage(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("aiEmployeeId", aiEmployeeId);
    if (docTitle) formData.append("title", docTitle);

    try {
      const res = await fetch("/api/rag/upload-document", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to upload and index document");
      }

      setStatusMessage({
        text: `✓ Success! "${data.name}" processed into ${data.chunksCount} chunks and stored in Supabase database for ${employeeName}!`,
        isError: false,
      });

      setFile(null);
      setDocTitle("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      onUploadSuccess();
    } catch (err: any) {
      setStatusMessage({ text: err.message || "Failed to upload document", isError: true });
    } finally {
      setIsUploading(false);
    }
  }

  // Pre-configured sample document generator for quick 1-click testing
  function handleLoadSampleDoc(sampleType: "prices" | "faqs") {
    let content = "";
    let sampleName = "";

    if (sampleType === "prices") {
      sampleName = "Product_Pricing_Catalogue.txt";
      content = `BUSINESS PRODUCT CATALOG & PRICING
1. Standard Plan / Package A - ₹4,999. Includes basic features and email support.
2. Premium Plan / Package B - ₹12,999. Includes full features, 24/7 dedicated support, and setup assistance.
3. Enterprise Custom Package - Contact our team for customized quotes and bulk rates.

DISCOUNTS & PAYMENT TERMS:
- 10% instant discount on annual commitments.
- Flexible payment methods supported: UPI, Credit/Debit Cards, Net Banking, and Bank Transfer.
- Transparent pricing with no hidden charges.`;
    } else {
      sampleName = "Company_Policies_and_Support.txt";
      content = `COMPANY POLICIES & CUSTOMER SERVICE
Working Hours: Monday to Saturday 9:00 AM - 8:00 PM IST. Closed on Sundays.
Customer Support: Dedicated helpdesk available via phone and email.

TERMS & POLICIES:
- 100% satisfaction guarantee with 14-day refund policy on eligible products/services.
- Quick turnaround time on all customer inquiries within 2 hours.
- Verified and certified support team ready to assist.`;
    }

    const blob = new Blob([content], { type: "text/plain" });
    const sampleFile = new File([blob], sampleName, { type: "text/plain" });
    handleFileSelected(sampleFile);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
          <div>
            <h3 className="font-display text-lg font-bold text-ink">
              2. Upload Business Documents
            </h3>
            <p className="mt-1 text-xs text-muted">
              Upload brochures, price lists, catalogues, or policy PDFs. Documents are chunked and stored directly into Supabase database for <strong className="text-ink">{employeeName}</strong>.
            </p>
          </div>

          {/* Quick sample chips */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Try sample:</span>
            <button
              type="button"
              onClick={() => handleLoadSampleDoc("prices")}
              className="rounded-lg bg-background px-2.5 py-1 text-xs font-medium text-ink border border-border hover:bg-accent-soft hover:border-accent/40 cursor-pointer"
            >
              📋 Price List
            </button>
            <button
              type="button"
              onClick={() => handleLoadSampleDoc("faqs")}
              className="rounded-lg bg-background px-2.5 py-1 text-xs font-medium text-ink border border-border hover:bg-accent-soft hover:border-accent/40 cursor-pointer"
            >
              🏢 Store Policies
            </button>
          </div>
        </div>

        {/* Drag and drop zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
              handleFileSelected(e.dataTransfer.files[0]);
            }
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`mt-4 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
            isDragging
              ? "border-accent bg-accent-soft/30"
              : file
              ? "border-emerald-400 bg-emerald-50/20"
              : "border-border hover:border-accent/60 bg-background/50"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.md,.csv,.json"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileSelected(e.target.files[0]);
              }
            }}
            className="hidden"
          />

          {file ? (
            <div className="space-y-1">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 font-bold text-lg">
                📄
              </div>
              <p className="text-sm font-semibold text-ink">{file.name}</p>
              <p className="text-xs text-muted">
                {(file.size / 1024).toFixed(1)} KB • Ready to chunk and embed into Supabase
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent text-xl">
                ↑
              </div>
              <div>
                <p className="text-sm font-semibold text-ink">
                  Click to browse or drag and drop files here
                </p>
                <p className="text-xs text-muted mt-0.5">
                  Supports PDF, TXT, Markdown, CSV (up to 10MB)
                </p>
              </div>
            </div>
          )}
        </div>

        {/* File meta & action */}
        {file && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted">
                Document Display Name
              </label>
              <input
                type="text"
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-ink outline-hidden focus:border-accent"
                placeholder="e.g. Products & Price List"
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={handleUpload}
                disabled={isUploading}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-accent/90 disabled:opacity-50 cursor-pointer"
              >
                {isUploading ? (
                  <>
                    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Processing & Chunking...
                  </>
                ) : (
                  <>Upload & Chunk into Database →</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Status banner */}
        {statusMessage && (
          <div
            className={`mt-4 rounded-xl p-4 text-xs border space-y-2.5 ${
              statusMessage.isError
                ? "bg-red-50 text-red-700 border-red-200"
                : "bg-emerald-50 text-emerald-800 border-emerald-200"
            }`}
          >
            <p className="font-semibold">{statusMessage.text}</p>
            {!statusMessage.isError && onProceedToCall && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={onProceedToCall}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-emerald-800 transition-all cursor-pointer"
                >
                  <span>📞</span>
                  <span>Continue to Outbound Voice Calling →</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Database Documents & Chunks Status Section */}
      {documents.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <h4 className="text-sm font-bold text-ink flex items-center gap-2">
                <span>🗄️</span>
                <span>Database Knowledge Chunks</span>
              </h4>
              <p className="text-[11px] text-muted mt-0.5">
                All business documents and vector chunks currently active in Supabase
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                ● {documents.length} Docs ({totalChunks} Chunks)
              </span>
            </div>
          </div>

          <KnowledgeMeter
            aiEmployeeId={aiEmployeeId}
            refreshKey={documents.map((d) => `${d.id}:${d.updated_at}`).join("|")}
          />

          <div className="space-y-3">
            {documents.map((doc: any) => {
              const isExpanded = expandedDocId === doc.id;
              const chunkCount = doc.chunk_count || doc.metadata?.chunk_count || 1;
              return (
                <div
                  key={doc.id}
                  className="rounded-xl border border-border bg-background p-4 text-xs transition-all hover:border-accent/30"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="text-lg">
                        {doc.source_type === "voice_transcript" ? "🎙️" : "📄"}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-ink text-sm">{doc.name}</span>
                          <span className="rounded-full bg-blue-100 text-blue-800 px-2 py-0.5 text-[10px] font-bold">
                            {chunkCount} {chunkCount === 1 ? "chunk" : "chunks"}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted mt-0.5">
                          {doc.file_type || "text/plain"} • Added {new Date(doc.created_at).toLocaleDateString()}
                          {doc.metadata?.uploaded_by ? ` by ${doc.metadata.uploaded_by}` : ""}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setExpandedDocId(isExpanded ? null : doc.id);
                          setOpenEditing(false);
                          setEditingDocId(null);
                        }}
                        className="rounded-lg border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-ink hover:bg-accent-soft hover:text-accent cursor-pointer"
                      >
                        {isExpanded ? "Close" : "Open"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingDocId(null);
                          setExpandedDocId(doc.id);
                          setOpenEditing(true);
                        }}
                        disabled={(isExpanded && openEditing) || editingDocId === doc.id}
                        className="rounded-lg border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-ink hover:bg-accent-soft hover:text-accent cursor-pointer disabled:opacity-50"
                      >
                        Edit
                      </button>
                      {onDeleteDocument && (
                        <button
                          type="button"
                          onClick={() => onDeleteDocument(doc.id)}
                          className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-700 hover:bg-red-100 cursor-pointer"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>



                  {editingDocId === doc.id && (
                    <div className="mt-3 space-y-2 border-t border-border pt-3">
                      <input
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        aria-label="Title"
                        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs text-ink outline-hidden focus:border-accent"
                      />
                      <textarea
                        value={draftText}
                        onChange={(e) => setDraftText(e.target.value)}
                        rows={14}
                        aria-label="Text"
                        className="w-full rounded-lg border border-border bg-surface p-3 font-mono text-[11px] leading-relaxed text-ink outline-hidden focus:border-accent"
                      />
                      {editError ? <p className="text-[11px] text-warn">{editError}</p> : null}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={saveEdit}
                          disabled={savingEdit || !draftName.trim() || !draftText.trim()}
                          className="rounded-lg bg-accent px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-accent/90 disabled:opacity-50 cursor-pointer"
                        >
                          {savingEdit ? "Saving…" : "Save changes"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingDocId(null)}
                          disabled={savingEdit}
                          className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-semibold text-ink cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Expanded: the document laid out as a dashboard */}
                  {isExpanded && (
                    <div className="mt-3 border-t border-border pt-4">
                      <KnowledgeDocumentView
                        documentId={doc.id}
                        name={doc.name}
                        rawText={doc.raw_text}
                        editing={openEditing}
                        onEditingChange={setOpenEditing}
                        onSaved={() => {
                          setStatusMessage({ text: `✓ Saved "${doc.name}". Calls use the new version from now on.`, isError: false });
                          onUploadSuccess();
                        }}
                        onEditText={() => startEditing(doc)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
