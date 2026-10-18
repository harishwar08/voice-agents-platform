import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

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

async function check() {
  const { data: docs } = await supabase
    .from("knowledge_documents")
    .select("id, name, created_at, status, ai_employee_id, source_type, raw_text")
    .order("created_at", { ascending: false });

  console.log("=== DOCUMENTS ===");
  if (docs) {
    for (const d of docs) {
      console.log(`Doc ID: ${d.id} | Name: "${d.name}" | Type: ${d.source_type} | Status: ${d.status} | TextLen: ${d.raw_text?.length} | Created: ${d.created_at}`);
    }
  }

  const { data: chunks } = await supabase
    .from("knowledge_chunks")
    .select("id, document_id, created_at, chunk_index, content")
    .order("created_at", { ascending: false });

  console.log("\n=== CHUNKS ===");
  console.log("Total chunks in DB:", chunks?.length);
  if (chunks && chunks.length > 0) {
    for (const c of chunks.slice(0, 10)) {
      console.log(`Chunk ID: ${c.id} | Doc ID: ${c.document_id} | Index: ${c.chunk_index} | Text: ${c.content?.slice(0, 50)}...`);
    }
  }
}

check().catch(console.error);
