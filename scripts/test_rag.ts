import { CharacterTextSplitter } from "../src/lib/rag/text-splitter";
import { defaultEmbeddings } from "../src/lib/rag/embeddings";
import { synthesizeLeadResponse } from "../src/lib/rag/qa-engine";

async function runTests() {
  console.log("=== 1. Testing CharacterTextSplitter ===");
  const splitter = new CharacterTextSplitter({
    chunkSize: 120,
    chunkOverlap: 20,
    separator: "\n\n",
  });

  const sampleTranscript = `We sell mobile phones and gadgets at Sri Mobile.\n\niPhone 15 is 65000 rupees and OnePlus 12 is 54000 rupees. We offer a 10% student discount.\n\nOur store is open 10 AM to 9 PM everyday. Located near Metro Pillar 142.`;

  const chunks = splitter.createDocuments([sampleTranscript], [
    { sourceName: "Spoken Onboarding Transcript", sourceType: "voice_transcript" },
  ]);

  console.log(`Created ${chunks.length} chunks from sample transcript.`);
  chunks.forEach((c, idx) => {
    console.log(`[Chunk #${idx + 1}] (${c.pageContent.length} chars): ${c.pageContent}`);
  });

  if (chunks.length < 2) {
    throw new Error("Expected at least 2 chunks from splitter");
  }
  console.log("✓ CharacterTextSplitter test passed.\n");

  console.log("=== 2. Testing Sentence-Transformers Embeddings (384-dim) ===");
  const testText = "What is the price of iPhone 15?";
  const embedding = await defaultEmbeddings.embedQuery(testText);

  console.log(`Generated embedding with ${embedding.length} dimensions.`);
  if (embedding.length !== 384) {
    throw new Error(`Expected 384 dimensions, got ${embedding.length}`);
  }
  console.log(`Sample vector values: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(", ")}...]`);
  console.log("✓ Sentence-Transformers embedding test passed.\n");

  console.log("=== 3. Testing Lead Response Synthesis ===");
  const mockChunks = [
    {
      id: "chk-1",
      documentId: "doc-1",
      content: "iPhone 15 is 65000 rupees and OnePlus 12 is 54000 rupees. We offer a 10% student discount.",
      metadata: { sourceName: "Spoken Transcript" },
      similarity: 0.885,
    },
  ];

  const res = synthesizeLeadResponse({
    query: "How much is the iPhone 15 and is there a student discount?",
    contextChunks: mockChunks,
    employee: { name: "Priya", description: "Inbound sales" },
    businessName: "Sri Mobile",
  });

  console.log("Lead Question: 'How much is the iPhone 15 and is there a student discount?'");
  console.log(`AI Answer: "${res.answer}"`);
  console.log(`Confidence: ${(res.confidence * 100).toFixed(1)}%, Sources: ${res.sources.join(", ")}`);

  if (!res.answer.includes("65000") || !res.answer.includes("student discount")) {
    throw new Error("Answer was not properly grounded in context chunks");
  }
  console.log("✓ Response synthesis test passed.\n");

  console.log("=========================================");
  console.log("ALL RAG COMPONENT TESTS PASSED SUCCESSFULLY!");
  console.log("=========================================");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
