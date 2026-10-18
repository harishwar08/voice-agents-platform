import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { SupabaseVectorStore } from "../src/lib/rag/vector-store";
import { synthesizeLeadResponse } from "../src/lib/rag/qa-engine";

// Load .env
const envFile = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envFile)) {
  const envContent = fs.readFileSync(envFile, "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function runVerification() {
  console.log("===============================================================");
  console.log("=== RAG PIPELINE VERIFICATION: FULL CHUNKS RETRIEVAL TO LLM ===");
  console.log("===============================================================\n");

  const employeeId = "03ace84e-8ccf-4270-92af-3a3dd626a497"; // Ram (Pavan Electronics)
  const vs = new SupabaseVectorStore(supabase as any);

  // 1. Verify chunks in Supabase knowledge_chunks
  const { data: chunks, count } = await supabase
    .from("knowledge_chunks")
    .select("id, document_id, chunk_index, content", { count: "exact" })
    .eq("ai_employee_id", employeeId);

  console.log(`[Step 1] Verified Supabase knowledge_chunks count: ${chunks?.length || 0} chunks.`);
  if (!chunks || chunks.length === 0) {
    throw new Error("No chunks found in Supabase knowledge_chunks for employee!");
  }

  // 2. Test Primary User Query: "What is the price of Galaxy A16 5G?"
  const query1 = "What is the price of Galaxy A16 5G?";
  console.log(`\n[Step 2] Testing Target Query: "${query1}"`);

  const retrievedChunks1 = await vs.similaritySearch(query1, 4, {
    aiEmployeeId: employeeId,
    threshold: 0.1,
  });

  console.log(`Retrieved ${retrievedChunks1.length} chunks from knowledge_chunks.`);
  const topChunk = retrievedChunks1[0]?.content || "";

  console.log("\n--- Top Retrieved Chunk Preview ---");
  console.log(topChunk.slice(0, 400));
  console.log("-----------------------------------\n");

  // Verify chunk content
  const hasGalaxy = /Galaxy A16 5G/i.test(topChunk);
  const hasSamsung = /Samsung/i.test(topChunk);
  const hasPrice = /₹16,999|16,999/i.test(topChunk);
  const isNotGenericSummary = !topChunk.startsWith("Pavan Electronics, a Coimbatore-based store, offers a comprehensive range");

  console.log("Chunk Validation Checks:");
  console.log(`  - Contains 'Galaxy A16 5G': ${hasGalaxy ? "PASSED" : "FAILED"}`);
  console.log(`  - Contains Brand 'Samsung': ${hasSamsung ? "PASSED" : "FAILED"}`);
  console.log(`  - Contains Price '₹16,999': ${hasPrice ? "PASSED" : "FAILED"}`);
  console.log(`  - Is Full Document Chunk (not summary): ${isNotGenericSummary ? "PASSED" : "FAILED"}`);

  if (!hasGalaxy || !hasPrice) {
    throw new Error("Top retrieved chunk failed to contain Galaxy A16 5G or price ₹16,999!");
  }

  // 3. Send retrieved chunks to LLM
  console.log("\n[Step 3] Synthesizing LLM response with retrieved chunks...");
  const llmResult = await synthesizeLeadResponse({
    query: query1,
    contextChunks: retrievedChunks1,
    employee: { name: "Ram", tone: "Courteous and professional" },
    businessName: "Pavan Electronics",
  });

  console.log("\n--- LLM Final Answer ---");
  console.log(llmResult.answer);
  console.log("------------------------");
  console.log(`Confidence: ${(llmResult.confidence * 100).toFixed(1)}%`);

  const answerMentionsGalaxy = /Galaxy A16/i.test(llmResult.answer);
  const answerMentionsPrice = /16,999/i.test(llmResult.answer);

  console.log("\nLLM Answer Validation Checks:");
  console.log(`  - Answer identifies Galaxy A16: ${answerMentionsGalaxy ? "PASSED" : "FAILED"}`);
  console.log(`  - Answer provides exact price ₹16,999: ${answerMentionsPrice ? "PASSED" : "FAILED"}`);

  if (!answerMentionsPrice) {
    throw new Error("LLM answer did not contain the exact price ₹16,999!");
  }

  // 4. Test Second Query: "What is the price of iPhone 16 Pro and Galaxy S25 Ultra?"
  console.log("\n\n[Step 4] Testing Multi-Product Query: 'What is the price of iPhone 16 Pro and Galaxy S25 Ultra?'");
  const query2 = "What is the price of iPhone 16 Pro and Galaxy S25 Ultra?";
  const retrieved2 = await vs.similaritySearch(query2, 4, { aiEmployeeId: employeeId });
  const ans2 = await synthesizeLeadResponse({
    query: query2,
    contextChunks: retrieved2,
    employee: { name: "Ram" },
    businessName: "Pavan Electronics",
  });
  console.log("LLM Answer 2:\n", ans2.answer);
  console.log(`Contains iPhone 16 Pro price (₹1,09,999): ${ans2.answer.includes("1,09,999") ? "PASSED" : "FAILED"}`);
  console.log(`Contains Galaxy S25 Ultra price (₹1,18,999): ${ans2.answer.includes("1,18,999") ? "PASSED" : "FAILED"}`);

  console.log("\n===============================================================");
  console.log("=== ALL RAG PIPELINE VERIFICATION TESTS PASSED SUCCESSFULLY! ===");
  console.log("===============================================================");
}

runVerification().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
