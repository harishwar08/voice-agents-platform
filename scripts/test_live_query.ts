import { SupabaseVectorStore } from "../src/lib/rag/vector-store";
import { synthesizeLeadResponse } from "../src/lib/rag/qa-engine";

async function main() {
  const vs = new SupabaseVectorStore();
  const query = "What is the price of iPhone 15 and OnePlus 12?";
  console.log(`Testing query: "${query}"`);

  const results = await vs.similaritySearch(query, 3);
  console.log(`Retrieved ${results.length} chunks.`);

  results.forEach((r, i) => {
    console.log(`[Chunk #${i + 1}] Similarity: ${(r.similarity * 100).toFixed(1)}% | Document: ${r.metadata?.sourceName || "N/A"}`);
    console.log(`Content: "${r.content}"\n`);
  });

  const response = synthesizeLeadResponse({
    query,
    contextChunks: results,
    employee: { name: "Priya", description: "Inbound sales voice agent" },
    businessName: "Sri Mobile",
  });

  console.log("=== AI EMPLOYEE RESPONSE ===");
  console.log(response.answer);
  console.log(`Confidence: ${(response.confidence * 100).toFixed(1)}%`);
  console.log("============================");
}

main().catch(console.error);
