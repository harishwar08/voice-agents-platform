import { createClient } from "@supabase/supabase-js";
import { CharacterTextSplitter } from "../src/lib/rag/text-splitter";
import { SupabaseVectorStore } from "../src/lib/rag/vector-store";
import { generateDocumentSummary } from "../src/lib/rag/qa-engine";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!url || !key) {
    console.error("Missing Supabase credentials in .env");
    process.exit(1);
  }

  const supabase = createClient(url, key);

  console.log("=== RAG Vector Chunks Sync Script ===");
  console.log("Checking Supabase documents...");

  const { data: documents, error: docErr } = await supabase
    .from("knowledge_documents")
    .select("*");

  if (docErr) {
    console.error("Error fetching documents:", docErr.message);
    process.exit(1);
  }

  console.log(`Found ${documents?.length || 0} documents in knowledge_documents.`);

  if (!documents || documents.length === 0) {
    console.log("No documents to sync.");
    return;
  }

  const splitter = new CharacterTextSplitter({
    chunkSize: 450,
    chunkOverlap: 50,
    separator: "\n\n",
  });

  const vectorStore = new SupabaseVectorStore(supabase);

  for (const doc of documents) {
    console.log(`\nProcessing document: "${doc.name}" (ID: ${doc.id})`);

    // Check if chunks already exist in Supabase
    const { count, error: countErr } = await supabase
      .from("knowledge_chunks")
      .select("id", { count: "exact", head: true })
      .eq("document_id", doc.id);

    if (!countErr && (count || 0) > 0) {
      console.log(`Document already has ${count} chunks in knowledge_chunks. Skipping.`);
      continue;
    }

    // Split text into chunks
    const chunkDocuments = await splitter.createDocuments([doc.raw_text], [
      {
        documentId: doc.id,
        businessId: doc.business_id,
        aiEmployeeId: doc.ai_employee_id,
        sourceType: doc.source_type,
        sourceName: doc.name,
      },
    ]);

    console.log(`Created ${chunkDocuments.length} chunks. Generating embeddings and storing in Supabase...`);

    const chunkIds = await vectorStore.addDocuments(
      chunkDocuments,
      doc.business_id,
      doc.ai_employee_id,
      doc.id
    );

    console.log(`Stored ${chunkIds.length} chunks in Supabase knowledge_chunks!`);

    // Update summary with Groq if it was just a raw slice
    if (!doc.summary || doc.summary.length < 50 || doc.summary.endsWith("...")) {
      try {
        const newSummary = await generateDocumentSummary(doc.raw_text, doc.name);
        await supabase
          .from("knowledge_documents")
          .update({ summary: newSummary })
          .eq("id", doc.id);
        console.log(`Updated document AI summary: "${newSummary.slice(0, 90)}..."`);
      } catch (err: any) {
        console.warn("Could not update summary:", err?.message);
      }
    }
  }

  // Verify total chunks in Supabase
  const { count: totalChunks } = await supabase
    .from("knowledge_chunks")
    .select("id", { count: "exact", head: true });

  console.log(`\n=== Verification Complete ===`);
  console.log(`Total chunks now in Supabase knowledge_chunks: ${totalChunks}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
