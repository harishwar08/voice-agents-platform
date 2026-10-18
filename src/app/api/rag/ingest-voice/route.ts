import { NextResponse } from "next/server";
import { loadAccessibleEmployee } from "@/lib/auth/access";
import { getSessionContext } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { indexDocument } from "@/lib/rag/index-document";
import { generateDocumentSummary } from "@/lib/rag/qa-engine";

export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      aiEmployeeId,
      businessName,
      transcriptText,
      title = "Spoken Business Overview & Product Details",
      speaker = "Business Owner",
    } = body;

    if (!aiEmployeeId) {
      return NextResponse.json({ error: "aiEmployeeId is required" }, { status: 400 });
    }

    if (!transcriptText || !transcriptText.trim()) {
      return NextResponse.json({ error: "Voice transcript text is empty" }, { status: 400 });
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

    // Update business name if provided
    if (businessName && businessName.trim()) {
      await supabase
        .from("businesses")
        .update({ name: businessName.trim() })
        .eq("id", businessId);
    }

    const trimmedText = transcriptText.trim();
    const docName = title || `Voice Transcript - ${new Date().toLocaleDateString()}`;
    const aiSummary = await generateDocumentSummary(trimmedText, docName);

    // 1. Create record in knowledge_documents
    const { data: dbDoc, error: docError } = await supabase
      .from("knowledge_documents")
      .insert({
        business_id: businessId,
        ai_employee_id: aiEmployeeId,
        name: docName,
        source_type: "voice_transcript",
        file_type: "audio/transcript",
        raw_text: trimmedText,
        summary: aiSummary,
        status: "indexed",
        metadata: {
          speaker,
          recorded_at: new Date().toISOString(),
          recorded_by: session.profile.full_name || session.email,
        },
      })
      .select("*")
      .single();

    if (docError || !dbDoc) {
      console.error("Supabase knowledge_documents insert error:", docError);
      return NextResponse.json(
        { error: `Database error saving voice transcript: ${docError?.message || "Unknown error"}` },
        { status: 500 }
      );
    }

    const doc = dbDoc;

    // 2. Chunk, embed and store in knowledge_chunks
    const chunkIds = await indexDocument(supabase, doc, trimmedText);

    console.log(`Voice transcript indexed: ${chunkIds.length} chunks stored.`);

    return NextResponse.json({
      success: true,
      documentId: doc.id,
      name: doc.name,
      chunksCount: chunkIds.length,
      summary: aiSummary,
    });
  } catch (err: any) {
    console.error("Voice ingest error:", err);
    return NextResponse.json({ error: err.message || "Failed to ingest voice transcript" }, { status: 500 });
  }
}
