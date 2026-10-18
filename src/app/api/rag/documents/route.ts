import { NextResponse } from "next/server";
import { canAccessBusiness, getAccessScope, loadAccessibleEmployee } from "@/lib/auth/access";
import { getSessionContext } from "@/lib/auth/session";
import { replaceDocumentText } from "@/lib/rag/update-document";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_DOCUMENT_CHARS = 200_000;

export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const aiEmployeeId = searchParams.get("aiEmployeeId");

    if (!aiEmployeeId) {
      return NextResponse.json({ error: "aiEmployeeId is required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: "Database client unavailable" }, { status: 500 });
    }

    const employee = await loadAccessibleEmployee(supabase, session, aiEmployeeId);
    if (!employee) {
      return NextResponse.json({ error: "AI Employee not found" }, { status: 404 });
    }

    const businessId = employee.business_id;

    // Fetch documents from Supabase
    let documents: any[] = [];
    let chunksCount = 0;

    try {
      let docQuery = supabase
        .from("knowledge_documents")
        .select("*")
        .order("created_at", { ascending: false });

      if (businessId) {
        docQuery = docQuery.or(`business_id.eq.${businessId},ai_employee_id.eq.${aiEmployeeId}`);
      } else {
        docQuery = docQuery.eq("ai_employee_id", aiEmployeeId);
      }

      const { data: dbDocs } = await docQuery;
      if (dbDocs) documents = dbDocs;

      // Count chunks per document directly from knowledge_chunks table
      const { data: chunkList } = await supabase
        .from("knowledge_chunks")
        .select("document_id")
        .in("document_id", documents.map((d) => d.id));

      const countMap: Record<string, number> = {};
      if (chunkList) {
        for (const c of chunkList) {
          if (c.document_id) {
            countMap[c.document_id] = (countMap[c.document_id] || 0) + 1;
          }
        }
      }

      documents = documents.map((d) => ({
        ...d,
        chunk_count: countMap[d.id] ?? d.metadata?.chunk_count ?? 1,
      }));

      let chunkQuery = supabase
        .from("knowledge_chunks")
        .select("id", { count: "exact", head: true });

      if (businessId) {
        chunkQuery = chunkQuery.or(`business_id.eq.${businessId},ai_employee_id.eq.${aiEmployeeId}`);
      } else {
        chunkQuery = chunkQuery.eq("ai_employee_id", aiEmployeeId);
      }

      const { count } = await chunkQuery;
      if (count !== null) chunksCount = count;
    } catch {
      // Supabase tables pending migration
    }

    // Merge with local RAG store fallback
    const { localRagStore } = await import("@/lib/rag/local-cache");
    const localDocs = localRagStore.getDocuments(aiEmployeeId);
    const localChunks = localRagStore.getChunks(aiEmployeeId);

    // De-duplicate by id
    const existingIds = new Set(documents.map((d) => d.id));
    for (const ld of localDocs) {
      if (!existingIds.has(ld.id)) {
        documents.push(ld);
      }
    }

    const totalChunksCombined = Math.max(chunksCount, localChunks.length);

    return NextResponse.json({
      documents,
      totalChunks: totalChunksCombined,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch documents" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getSessionContext();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get("id");

    if (!documentId) {
      return NextResponse.json({ error: "Document id is required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: "Database client unavailable" }, { status: 500 });
    }

    const scope = await getAccessScope(supabase, session);
    const { data: doc } = await supabase
      .from("knowledge_documents")
      .select("business_id")
      .eq("id", documentId)
      .maybeSingle();

    // Documents only in the local fallback cache carry no business, so only staff may clear them.
    if (doc ? !canAccessBusiness(scope, doc.business_id) : !scope.staff) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    if (doc) {
      await supabase.from("knowledge_chunks").delete().eq("document_id", documentId);
      await supabase.from("knowledge_documents").delete().eq("id", documentId);
    }

    const { localRagStore } = await import("@/lib/rag/local-cache");
    localRagStore.deleteDocument(documentId);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to delete document" }, { status: 500 });
  }
}

/**
 * Owners correct a knowledge item in place: new text is re-chunked for search,
 * and the next call already carries the change.
 */
export async function PATCH(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ error: "Database client unavailable" }, { status: 500 });

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const text = typeof body?.text === "string" ? body.text.replace(/\r\n/g, "\n").trim() : "";
  if (!name || !text) return NextResponse.json({ error: "Give the item a title and some text." }, { status: 400 });
  if (text.length > MAX_DOCUMENT_CHARS) {
    return NextResponse.json({ error: "That is too long for one item. Split it into a few." }, { status: 400 });
  }

  const { data: doc } = await supabase
    .from("knowledge_documents")
    .select("*")
    .eq("id", String(body?.id ?? ""))
    .maybeSingle();
  const scope = await getAccessScope(supabase, session);
  if (!doc || !canAccessBusiness(scope, doc.business_id)) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const updated = await replaceDocumentText(supabase, doc, name, text);
  if (!updated) return NextResponse.json({ error: "Could not save the change." }, { status: 500 });
  return NextResponse.json({ document: updated });
}
