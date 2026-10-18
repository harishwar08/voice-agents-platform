import { createClient } from "@supabase/supabase-js";
import { SupabaseVectorStore } from "../src/lib/rag/vector-store";
import { synthesizeLeadResponse, RetrievalQA, getChatGroq } from "../src/lib/rag/qa-engine";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const supabase = createClient(url, key);
  const vectorStore = new SupabaseVectorStore(supabase);

  console.log("=== Testing LangChain & ChatGroq RAG Pipeline ===");

  // 1. Fetch test employee
  const { data: employee } = await supabase
    .from("ai_employees")
    .select("*, businesses(name)")
    .limit(1)
    .single();

  if (!employee) {
    console.error("No employee found in Supabase.");
    return;
  }

  const businessName = (employee as any).businesses?.name || "Shri Mobiles";
  console.log(`Testing with AI Employee: ${employee.name} (${businessName})`);

  // 2. Test LangChain retriever
  const retriever = vectorStore.asRetriever({
    k: 3,
    filter: { aiEmployeeId: employee.id, businessId: employee.business_id, threshold: 0.05 },
  });

  const testQueries = [
    "What products or models do you sell?",
    "What is the price of iPhone 15?",
    "Do you have any discounts or offers?",
  ];

  for (const query of testQueries) {
    console.log(`\n========================================`);
    console.log(`Lead Query: "${query}"`);

    // Retrieval
    const relevantDocs = await retriever.getRelevantDocuments(query);
    console.log(`Retrieved ${relevantDocs.length} chunks from Supabase vector store.`);

    // Generation
    const result = await synthesizeLeadResponse({
      query,
      contextChunks: relevantDocs.map((d) => ({
        id: d.metadata?.id || "doc",
        documentId: d.metadata?.documentId || "doc",
        content: d.pageContent,
        metadata: d.metadata,
        similarity: d.metadata?.similarity || 0.85,
      })),
      employee: {
        name: employee.name,
        description: employee.description,
        tone: (employee as any).tone,
        language: (employee as any).language,
      },
      businessName,
    });

    console.log(`\nAI Response from ${employee.name}:`);
    console.log(result.answer);
    console.log(`\nSources: ${result.sources.join(", ")} | Confidence: ${(result.confidence * 100).toFixed(1)}%`);
  }
}

main().catch(console.error);
