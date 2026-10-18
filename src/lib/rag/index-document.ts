import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, KnowledgeDocument } from "@/lib/database.types";
import { RecursiveCharacterTextSplitter } from "@/lib/rag/text-splitter";
import { SupabaseVectorStore } from "@/lib/rag/vector-store";

// Spoken explanations are short and conversational, so they split finer; written
// documents use bigger chunks so tables and specs stay intact.
const CHUNKING: Record<KnowledgeDocument["source_type"], { chunkSize: number; chunkOverlap: number }> = {
  voice_transcript: { chunkSize: 450, chunkOverlap: 50 },
  document_upload: { chunkSize: 1000, chunkOverlap: 120 },
  direct_note: { chunkSize: 1000, chunkOverlap: 120 },
};

/** Splits a knowledge document into embedded chunks for search, and returns the chunk ids. */
export async function indexDocument(
  supabase: SupabaseClient<Database>,
  doc: Pick<KnowledgeDocument, "id" | "business_id" | "ai_employee_id" | "name" | "source_type">,
  text: string,
  extraMetadata: Record<string, unknown> = {}
): Promise<string[]> {
  const splitter = new RecursiveCharacterTextSplitter(CHUNKING[doc.source_type]);
  const chunks = await splitter.createDocuments([text], [
    {
      documentId: doc.id,
      businessId: doc.business_id,
      aiEmployeeId: doc.ai_employee_id,
      sourceType: doc.source_type,
      sourceName: doc.name,
      ...extraMetadata,
    },
  ]);
  return new SupabaseVectorStore(supabase).addDocuments(chunks, doc.business_id, doc.ai_employee_id, doc.id);
}
