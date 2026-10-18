import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { SupabaseVectorStore } from "../src/lib/rag/vector-store";
import { CharacterTextSplitter } from "../src/lib/rag/text-splitter";

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

async function testUpload() {
  const businessId = "5926bf42-45a1-407f-ab69-87e6b840e2a4";
  const aiEmployeeId = "03ace84e-8ccf-4270-92af-3a3dd626a497"; // Ram

  const textToUpload = `
BUSINESS PRODUCT CATALOG & PRICING
1. Samsung Galaxy S25 Ultra (12GB RAM, 256GB Storage) - Rs 1,18,999.
2. Apple iPhone 16 Pro (256GB Storage) - Rs 1,09,999.
3. Apple iPhone 16 (128GB Storage) - Rs 69,999.
4. iQOO 15R (12GB RAM, 256GB Storage) - Rs 50,999.
5. Realme P4 Pro 5G (8GB RAM, 128GB Storage) - Rs 24,999.
6. Xiaomi Redmi Note 14 5G (8GB RAM, 256GB Storage) - Rs 19,999.
7. Samsung Galaxy A16 5G (8GB RAM, 128GB Storage) - Rs 16,999.

WASHING MACHINES:
- Samsung Front Load 5 Star 9kg - Rs 40,490.
- LG Front Load 9kg - Rs 36,999.
- Samsung Fully Automatic 7kg - Rs 26,999.
- LG Fully Automatic 7kg - Rs 24,999.
- Whirlpool Fully Automatic 7.5kg - Rs 23,999.

DISCOUNTS & POLICIES:
- Store Timings: Monday to Saturday 10:00 AM to 8:00 PM IST in Coimbatore, Tamil Nadu.
- 0% EMI available on HDFC & ICICI Bank credit cards.
- Free doorstep installation within 24 hours.
`.trim();

  console.log("1. Inserting into knowledge_documents...");
  const { data: doc, error: docErr } = await supabase
    .from("knowledge_documents")
    .insert({
      business_id: businessId,
      ai_employee_id: aiEmployeeId,
      name: "Product_Catalogue_and_Prices.txt",
      source_type: "document_upload",
      file_type: "text/plain",
      raw_text: textToUpload,
      summary: "Product catalogue for smartphones and washing machines with prices and store hours.",
      status: "indexed",
      metadata: { original_filename: "Product_Catalogue_and_Prices.txt" },
    })
    .select("*")
    .single();

  console.log("Doc insert:", { docId: doc?.id, docErr });
  if (docErr || !doc) return;

  console.log("2. Splitting text into chunks...");
  const splitter = new CharacterTextSplitter({
    chunkSize: 400,
    chunkOverlap: 50,
    separator: "\n\n",
  });

  const chunkDocs = await splitter.createDocuments([textToUpload], [
    {
      documentId: doc.id,
      businessId,
      aiEmployeeId,
      sourceType: "document_upload",
      sourceName: doc.name,
    },
  ]);

  console.log(`Created ${chunkDocs.length} chunk documents.`);
  for (let i = 0; i < chunkDocs.length; i++) {
    console.log(`Chunk ${i}: length=${chunkDocs[i].pageContent.length}, preview="${chunkDocs[i].pageContent.slice(0, 50)}..."`);
  }

  console.log("3. Adding chunks to SupabaseVectorStore...");
  const vectorStore = new SupabaseVectorStore(supabase as any);
  const chunkIds = await vectorStore.addDocuments(chunkDocs, businessId, aiEmployeeId, doc.id);
  console.log("Inserted chunk IDs:", chunkIds);

  console.log("4. Verifying chunks in Supabase knowledge_chunks table...");
  const { data: verifiedChunks, error: vErr } = await supabase
    .from("knowledge_chunks")
    .select("id, document_id, chunk_index, content")
    .eq("document_id", doc.id);

  console.log("Verified chunks in DB count:", verifiedChunks?.length, vErr || "");
}

testUpload().catch(console.error);
